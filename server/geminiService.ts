import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  AiAudioAnalysisResponse,
  CaptionReactionResponse,
  TranscriptChunkResult,
} from '../src/types/clipforge';
import {
  AnalyzeAudioRequestPayload,
  buildAiContentModePrompt,
  buildClipSelectionPrompt,
  cleanTranscriptText,
  hasSufficientSpeechTranscript,
  isMeaningfulSpeech,
  validateAiClipSuggestions,
} from '../src/utils/aiAnalysisValidation';
import {
  GenerateCaptionsReactionsPayload,
  normalizeCaptionSegments,
  validateReactionSuggestions,
} from '../src/utils/captionReactionLogic';
import {
  clampYouTubeAnalysisWindow,
  isValidYouTubeVideoId,
} from '../src/utils/urlImport';
import { buildTrustedYouTubeUrls } from './urlSecurity';
import { ClipCategory, ClipDurationOption } from '../src/types/clipforge';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const MAX_INLINE_AUDIO_BYTES_FOR_ANALYSIS = 12 * 1024 * 1024; // ~12 MB raw audio (~6 min 16kHz mono WAV)
const PRIMARY_FAST_TIMEOUT_MS = 18_000;
const TRANSCRIBE_TIMEOUT_MS = 40_000;
const ANALYSIS_TIMEOUT_MS = 55_000;
const PRIMARY_COOLDOWN_MS = 5 * 60 * 1000;

let primaryCooldownUntil = 0;

export class GeminiServiceError extends Error {
  statusCode: number;
  code: string;
  retryable: boolean;

  constructor(message: string, statusCode = 500, code = 'GEMINI_ERROR', retryable = false) {
    super(message);
    this.name = 'GeminiServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export function isGeminiApiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 8 && key !== 'MY_GEMINI_API_KEY');
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets and retry.',
      503,
      'API_KEY_MISSING',
      false
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getHttpStatusFromError(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as Record<string, unknown>;
  const direct = Number(record.status ?? record.statusCode ?? record.code);
  if (Number.isInteger(direct) && direct >= 400 && direct <= 599) return direct;
  if (record.error && typeof record.error === 'object') {
    const nested = Number((record.error as Record<string, unknown>).code);
    if (Number.isInteger(nested) && nested >= 400 && nested <= 599) return nested;
  }
  return undefined;
}

export function formatGeminiApiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;

  const status = getHttpStatusFromError(err);
  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown Gemini API error');
  console.error('[GeminiService] Upstream error:', { status, message: rawMessage.slice(0, 300) });
  const lower = rawMessage.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return new GeminiServiceError(
      'Gemini analysis timed out while processing the audio. Please retry or analyze a shorter video.',
      504,
      'GEMINI_TIMEOUT',
      true
    );
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('api key not valid')
  ) {
    return new GeminiServiceError(
      'Gemini API authentication failed. Please verify your API key in Settings > Secrets.',
      403,
      'API_KEY_INVALID',
      false
    );
  }

  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit')) {
    return new GeminiServiceError(
      'Gemini API rate limit or quota was reached. Wait a moment and retry, or check your key quota in Settings > Secrets.',
      429,
      'RESOURCE_EXHAUSTED',
      true
    );
  }

  if (status === 404 || lower.includes('not_found')) {
    return new GeminiServiceError(
      'The configured Gemini model could not be reached. Please retry shortly.',
      502,
      'MODEL_NOT_FOUND',
      false
    );
  }

  if (status === 400 || lower.includes('invalid_argument')) {
    return new GeminiServiceError(
      'Gemini could not decode the extracted audio format. Ensure the uploaded video has a valid audio track.',
      400,
      'INVALID_AUDIO_INPUT',
      false
    );
  }

  if (
    (status !== undefined && status >= 500) ||
    lower.includes('unavailable') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return new GeminiServiceError(
      'Gemini service is temporarily unavailable. Please try again in a few seconds.',
      503,
      'GEMINI_UNAVAILABLE',
      true
    );
  }

  return new GeminiServiceError(
    `Gemini audio analysis failed: ${rawMessage.slice(0, 220)}`,
    502,
    'GEMINI_UPSTREAM_ERROR',
    false
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new GeminiServiceError(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`, 504, 'GEMINI_TIMEOUT', true));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withRetryAndFailover<T>(
  operation: (modelName: string) => Promise<T>,
  options: { maxRetries: number; timeoutMs: number; label: string }
): Promise<{ result: T; modelUsed: string }> {
  const skipPrimary = Date.now() < primaryCooldownUntil;
  const modelsToTry = skipPrimary ? [FALLBACK_MODEL] : [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError: GeminiServiceError | null = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx += 1) {
    const modelName = modelsToTry[mIdx];
    const isPrimary = modelName === PRIMARY_MODEL;
    const retries = isPrimary ? 0 : options.maxRetries;
    const effectiveTimeout = isPrimary ? Math.min(options.timeoutMs, PRIMARY_FAST_TIMEOUT_MS) : options.timeoutMs;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await withTimeout(operation(modelName), effectiveTimeout, options.label);
        return { result, modelUsed: modelName };
      } catch (err) {
        const formatted = formatGeminiApiError(err);
        lastError = formatted;

        const canRetrySameModel = formatted.retryable && attempt < retries;
        if (canRetrySameModel) {
          const backoffMs = 800 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        const shouldFailoverModel =
          isPrimary &&
          mIdx + 1 < modelsToTry.length &&
          (formatted.code === 'GEMINI_UNAVAILABLE' ||
            formatted.code === 'GEMINI_TIMEOUT' ||
            formatted.code === 'MODEL_NOT_FOUND');

        if (shouldFailoverModel) {
          primaryCooldownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
          console.warn(
            `[GeminiService] ${modelName} returned ${formatted.code}; failing over to ${FALLBACK_MODEL} for 5 minutes.`
          );
          break;
        }

        throw formatted;
      }
    }
  }

  throw lastError ?? new GeminiServiceError(`${options.label} failed.`, 500);
}

async function transcribeSingleChunk(
  ai: GoogleGenAI,
  chunk: AnalyzeAudioRequestPayload['chunks'][number]
): Promise<{ chunkResult: TranscriptChunkResult; modelUsed: string }> {
  const { result: response, modelUsed } = await withRetryAndFailover(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: chunk.mimeType,
                data: chunk.base64Data,
              },
            },
            {
              text:
                'Transcribe all spoken speech accurately and verbatim. If there is only silence, tone, beep, or non-speech music with no intelligible spoken words, respond with exactly: [no speech]',
            },
          ],
        },
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      }),
    {
      maxRetries: 1,
      timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      label: `Audio chunk ${chunk.index + 1} transcription`,
    }
  );

  const rawText = cleanTranscriptText(response.text ?? '');
  const hasSpeech = isMeaningfulSpeech(rawText);

  return {
    modelUsed,
    chunkResult: {
      index: chunk.index,
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      text: hasSpeech ? rawText : '',
      hasSpeech,
    },
  };
}

export async function analyzeAudioWithGemini(
  payload: AnalyzeAudioRequestPayload
): Promise<AiAudioAnalysisResponse> {
  const ai = createGeminiClient();
  const sortedChunks = [...payload.chunks].sort((a, b) => a.index - b.index);

  // Stage 1: Transcribe chunks with bounded concurrency (2 at a time)
  const transcriptChunks: TranscriptChunkResult[] = new Array(sortedChunks.length);
  let transcriptionModelUsed = PRIMARY_MODEL;
  const concurrency = 2;
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < sortedChunks.length) {
      const current = nextIdx;
      nextIdx += 1;
      const out = await transcribeSingleChunk(ai, sortedChunks[current]);
      transcriptChunks[current] = out.chunkResult;
      transcriptionModelUsed = out.modelUsed;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sortedChunks.length) }, () => worker())
  );

  const combinedTranscript = transcriptChunks
    .filter((c) => c.hasSpeech && c.text)
    .map((c) => `[${c.startSec.toFixed(1)}s-${c.endSec.toFixed(1)}s] ${c.text}`)
    .join('\n');

  const speechCheck = hasSufficientSpeechTranscript(transcriptChunks);
  if (!speechCheck.sufficient) {
    return {
      status: 'insufficient_data',
      model: PRIMARY_MODEL,
      transcriptionModel: transcriptionModelUsed,
      transcript: combinedTranscript,
      transcriptChunks,
      insufficiencyReason: speechCheck.reason,
      clips: [],
      droppedCount: 0,
      warnings: [],
    };
  }

  // Stage 2: Contextual audio + transcript analysis with structured JSON output
  const analyzedDurationSeconds = Math.min(
    payload.videoDurationSeconds,
    sortedChunks.reduce((maxEnd, c) => Math.max(maxEnd, c.endSec), 0)
  );

  const selectionPrompt = buildClipSelectionPrompt({
    fileName: payload.fileName,
    videoDurationSeconds: payload.videoDurationSeconds,
    analyzedDurationSeconds,
    contentMode: payload.contentMode,
    targetDurationSeconds: payload.targetDurationSeconds,
    clipCount: payload.clipCount,
    transcriptChunks,
  });

  // Attach inline audio chunks directly when within safe payload bounds so Gemini hears vocal tone, laughter, and exact sub-chunk timing
  const estimatedRawAudioBytes = sortedChunks.reduce(
    (sum, c) => sum + Math.floor((c.base64Data.length * 3) / 4),
    0
  );

  const contentParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (estimatedRawAudioBytes <= MAX_INLINE_AUDIO_BYTES_FOR_ANALYSIS) {
    for (const chunk of sortedChunks) {
      contentParts.push({
        text: `Audio segment ${chunk.index + 1} covering ${chunk.startSec.toFixed(1)}s to ${chunk.endSec.toFixed(1)}s:`,
      });
      contentParts.push({
        inlineData: {
          mimeType: chunk.mimeType,
          data: chunk.base64Data,
        },
      });
    }
  }

  contentParts.push({ text: selectionPrompt });

  const { result: analysisResponse, modelUsed: analysisModelUsed } = await withRetryAndFailover(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: { parts: contentParts },
        config: {
          systemInstruction:
            'You are an expert short-form viral video editor for ClipForge AI. Analyze the provided audio and timestamped transcript to select the highest-retention short-form clips. Return strictly valid JSON matching the schema. Never invent speech or timestamps beyond the actual audio duration. Avoid mid-sentence cuts, avoid cutting off punchlines, prefer strong opening hooks, avoid duplicate overlapping moments, and clearly report insufficient_data if speech/timestamp grounding is insufficient.',
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                description: 'Either "ok" when grounded clips were found, or "insufficient_data" when speech/timestamps are insufficient.',
              },
              insufficiencyReason: {
                type: Type.STRING,
                description: 'Clear explanation when status is "insufficient_data"; otherwise empty string.',
              },
              clips: {
                type: Type.ARRAY,
                description: 'Selected high-retention short-form clip suggestions ordered by engagement strength.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Compelling, concise short-form video title grounded in the clip content.',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'One of: funny, interesting, educational, podcast, gaming, reactions, emotional, hook.',
                    },
                    startTime: {
                      type: Type.NUMBER,
                      description: 'Exact start timestamp in seconds within [0, analyzedDurationSeconds].',
                    },
                    endTime: {
                      type: Type.NUMBER,
                      description: 'Exact end timestamp in seconds strictly greater than startTime and within analyzedDurationSeconds.',
                    },
                    duration: {
                      type: Type.NUMBER,
                      description: 'Clip duration in seconds (endTime - startTime).',
                    },
                    hook: {
                      type: Type.STRING,
                      description: 'Short description of the opening hook that captures viewer attention.',
                    },
                    reason: {
                      type: Type.STRING,
                      description: 'Specific explanation of why this moment is engaging based on what is actually spoken.',
                    },
                    score: {
                      type: Type.INTEGER,
                      description: 'Engagement score from 1 to 100.',
                    },
                    caption: {
                      type: Type.STRING,
                      description: 'Short suggested opening caption matching what is spoken at the start of the clip.',
                    },
                  },
                  required: [
                    'title',
                    'category',
                    'startTime',
                    'endTime',
                    'duration',
                    'hook',
                    'reason',
                    'score',
                    'caption',
                  ],
                },
              },
            },
            required: ['status', 'insufficiencyReason', 'clips'],
          },
        },
      }),
    {
      maxRetries: 1,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
      label: 'Gemini contextual clip analysis',
    }
  );

  const rawJsonText = (analysisResponse.text ?? '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJsonText) as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError(
      'Gemini returned an unreadable response while structuring clip suggestions. Please retry.',
      502,
      'INVALID_MODEL_JSON',
      true
    );
  }

  if (parsed.status === 'insufficient_data') {
    const reason =
      typeof parsed.insufficiencyReason === 'string' && parsed.insufficiencyReason.trim()
        ? parsed.insufficiencyReason.trim()
        : 'Speech or timestamp cues in this recording were insufficient to select accurate short-form clips.';
    return {
      status: 'insufficient_data',
      model: analysisModelUsed,
      transcriptionModel: transcriptionModelUsed,
      transcript: combinedTranscript,
      transcriptChunks,
      insufficiencyReason: reason,
      clips: [],
      droppedCount: 0,
      warnings: [],
    };
  }

  // Stage 3: Strict deterministic validation of all AI timestamps & deduplication before returning
  const validated = validateAiClipSuggestions(parsed.clips, {
    videoDurationSeconds: analyzedDurationSeconds,
    targetDurationSeconds: payload.targetDurationSeconds,
    maxClips: payload.clipCount,
  });

  if (validated.clips.length === 0) {
    return {
      status: 'insufficient_data',
      model: analysisModelUsed,
      transcriptionModel: transcriptionModelUsed,
      transcript: combinedTranscript,
      transcriptChunks,
      insufficiencyReason:
        'Gemini analyzed the transcript, but no valid non-overlapping timestamps fell cleanly within this video’s actual duration. Try Exact Trim or upload a longer spoken clip.',
      clips: [],
      droppedCount: validated.droppedCount,
      warnings: validated.warnings,
    };
  }

  return {
    status: 'ok',
    model: analysisModelUsed,
    transcriptionModel: transcriptionModelUsed,
    transcript: combinedTranscript,
    transcriptChunks,
    clips: validated.clips,
    droppedCount: validated.droppedCount,
    warnings: validated.warnings,
  };
}

export async function generateCaptionsAndReactionsWithGemini(
  payload: GenerateCaptionsReactionsPayload
): Promise<CaptionReactionResponse> {
  const ai = createGeminiClient();
  const dur = Math.round(payload.clipDurationSeconds * 100) / 100;

  const languageDirective =
    payload.languageMode === 'hindi'
      ? 'Output all caption text in natural Devanagari Hindi (हिन्दी) with proper punctuation (।, ?, !). Translate/transcribe spoken Hindi or English faithfully into crisp Devanagari Hindi.'
      : payload.languageMode === 'hinglish'
        ? 'Output caption text in natural conversational Hinglish (Roman script mixing Hindi & English as spoken by Indian creators) with proper punctuation.'
        : payload.languageMode === 'english'
          ? 'Output caption text in clean, punctuated English.'
          : 'Auto-detect the spoken language (English, Hindi Devanagari, or Hinglish) and transcribe faithfully in that language with proper punctuation.';

  const reactionDirective = payload.includeReactions
    ? [
        'FUNNY REACTION EDITING ENGINE:',
        'Carefully analyze the actual spoken words, comedic timing, punchlines, awkward reveals, and vocal reactions.',
        'Allowed reaction types ONLY: "quick-zoom", "dramatic-zoom", "freeze-frame", "slow-motion", "reaction-emphasis", "comedic-pause", "meme-text", "emoji-overlay", "sound-effect".',
        'Allowed soundEffect values ONLY: "whoosh", "pop", "riser", "bass-drop", "shutter", "vine-boom", "record-scratch".',
        'CRITICAL RULE: Do NOT randomly add effects. Only suggest an effect when the spoken moment genuinely supports a comedic reaction (e.g., a punchline, funny mishap, unexpected confession, sarcastic deadpan, or surprise reveal).',
        'If the clip is serious, purely informational, or does not contain a genuine comedic beat, return an EMPTY reactionEffects array [] and explain why in reactionNote.',
        'Suggest at most 3 tasteful, well-timed reaction effects within [0, ' + dur + 's], with a concrete reason grounded in what is actually said.',
      ].join('\n')
    : 'Do NOT suggest reaction effects; return an empty reactionEffects array [] and set reactionNote to "Reaction suggestions were not requested."';

  const prompt = [
    `Analyze this ${dur}s short-form video clip audio ("${payload.clipTitle}").`,
    payload.existingTranscript ? `Reference context transcript: "${payload.existingTranscript}"` : '',
    '',
    'AUTOMATIC CAPTION REQUIREMENTS:',
    `1. ${languageDirective}`,
    `2. Split speech into concise, readable short-form subtitle segments (2 to 7 words per segment) with accurate start and end timestamps strictly inside [0, ${dur}].`,
    '3. Provide word-level timestamps in each segment\'s "words" array whenever clearly audible, marking punchy/important keywords with isKeyword: true.',
    '4. Include speaker labels (e.g. "Speaker 1", "Speaker 2") when voices are identifiable.',
    '5. Use proper capitalization and punctuation. If there is no intelligible speech (only silence/noise/music), set status to "no_speech" and return empty captions.',
    '',
    reactionDirective,
  ]
    .filter(Boolean)
    .join('\n');

  const { result: response, modelUsed } = await withRetryAndFailover(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: payload.audioMimeType,
                data: payload.audioBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          systemInstruction:
            'You are ClipForge AI\'s precision captioning and comedic reaction assistant. Transcribe actual spoken audio accurately with timestamps strictly within the clip duration. Support English, Hindi (Devanagari), and Hinglish. Never invent speech. Never randomly add reaction effects unless a genuine comedic beat exists in the spoken content. Return strictly valid JSON.',
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                description: '"ok" if speech was transcribed, or "no_speech" if no intelligible speech exists.',
              },
              detectedLanguage: {
                type: Type.STRING,
                description: 'One of "en", "hi", or "hinglish".',
              },
              reactionNote: {
                type: Type.STRING,
                description: 'Brief note explaining why reaction effects were suggested or why none were added.',
              },
              captions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    start: { type: Type.NUMBER },
                    end: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                    speaker: { type: Type.STRING },
                    language: { type: Type.STRING },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          start: { type: Type.NUMBER },
                          end: { type: Type.NUMBER },
                          isKeyword: { type: Type.BOOLEAN },
                        },
                        required: ['word', 'start', 'end'],
                      },
                    },
                  },
                  required: ['start', 'end', 'text'],
                },
              },
              reactionEffects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    reason: { type: Type.STRING },
                    intensity: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                    emoji: { type: Type.STRING },
                    soundEffect: { type: Type.STRING },
                  },
                  required: ['type', 'startTime', 'endTime', 'reason'],
                },
              },
            },
            required: ['status', 'detectedLanguage', 'reactionNote', 'captions', 'reactionEffects'],
          },
        },
      }),
    {
      maxRetries: 1,
      timeoutMs: ANALYSIS_TIMEOUT_MS,
      label: 'Gemini caption and reaction generation',
    }
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse((response.text ?? '').trim()) as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError(
      'Gemini returned an unreadable JSON payload while generating captions. Please retry.',
      502,
      'INVALID_MODEL_JSON',
      true
    );
  }

  const rawLang = typeof parsed.detectedLanguage === 'string' ? parsed.detectedLanguage.toLowerCase() : 'en';
  const detectedLanguage: 'en' | 'hi' | 'hinglish' =
    rawLang === 'hi' || rawLang === 'hindi'
      ? 'hi'
      : rawLang === 'hinglish'
        ? 'hinglish'
        : 'en';

  const { segments, hasWordTimestamps } = normalizeCaptionSegments(parsed.captions, dur);
  const reactionEffects = payload.includeReactions
    ? validateReactionSuggestions(parsed.reactionEffects, dur)
    : [];

  if (parsed.status === 'no_speech' || segments.length === 0) {
    return {
      status: 'no_speech',
      model: modelUsed,
      detectedLanguage,
      hasWordTimestamps: false,
      captions: [],
      reactionEffects: [],
      reactionNote:
        typeof parsed.reactionNote === 'string' && parsed.reactionNote.trim()
          ? parsed.reactionNote.trim()
          : 'No intelligible speech was found in this clip to caption.',
      warnings: [],
    };
  }

  const reactionNote =
    typeof parsed.reactionNote === 'string' && parsed.reactionNote.trim()
      ? parsed.reactionNote.trim()
      : reactionEffects.length > 0
        ? `Suggested ${reactionEffects.length} contextual comedic reaction edit(s) grounded in the clip transcript.`
        : 'No comedic beats warranted reaction effects on this clip, so none were added.';

  return {
    status: 'ok',
    model: modelUsed,
    detectedLanguage,
    hasWordTimestamps,
    captions: segments,
    reactionEffects,
    reactionNote,
    warnings: [],
  };
}

export interface AnalyzeYouTubeRequestPayload {
  videoId: string;
  title: string;
  durationSeconds: number;
  contentMode: ClipCategory;
  targetDurationSeconds: ClipDurationOption;
  clipCount: number;
  windowStartSec?: number;
  windowEndSec?: number;
}

export async function analyzeYouTubeVideoWithGemini(
  payload: AnalyzeYouTubeRequestPayload
): Promise<AiAudioAnalysisResponse & { analyzedWindow: { startSec: number; endSec: number } }> {
  if (!isValidYouTubeVideoId(payload.videoId)) {
    throw new GeminiServiceError('Invalid YouTube video ID.', 400, 'INVALID_REQUEST', false);
  }

  const ai = createGeminiClient();
  const urls = buildTrustedYouTubeUrls(payload.videoId);
  const window = clampYouTubeAnalysisWindow(
    payload.durationSeconds,
    payload.windowStartSec,
    payload.windowEndSec
  );
  const windowDuration = Math.max(10, window.endSec - window.startSec);
  const modeRule = buildAiContentModePrompt(payload.contentMode);

  const prompt = [
    `Analyze this YouTube video segment from "${payload.title}" (${urls.canonicalUrl}).`,
    `The segment provided starts at ${window.startSec}s and ends at ${window.endSec}s (segment length: ${windowDuration}s).`,
    `Content focus: ${payload.contentMode}. ${modeRule}`,
    `Select up to ${payload.clipCount} standout, high-retention short-form clips targeting ~${payload.targetDurationSeconds}s each (between 10s and 90s when possible).`,
    '',
    'CRITICAL TIMESTAMP & GROUNDING RULES:',
    `1. Return startTime and endTime in seconds RELATIVE TO THIS SEGMENT (0 to ${windowDuration}), where 0 is the beginning of this provided segment.`,
    '2. Every clip must be grounded in actual spoken dialogue or standout moments heard/seen in this video segment. Never invent speech or timestamps.',
    '3. Start on a strong opening hook and finish after the punchline or thought completes—avoid cutting mid-sentence.',
    '4. Avoid overlapping duplicate clips.',
    '5. Also provide a concise summary transcript of the key spoken highlights in this segment in the "transcriptSummary" field.',
    '6. If the video cannot be accessed, is private/unplayable, or has no intelligible speech/highlights, set status to "insufficient_data" and explain why in "insufficiencyReason".',
  ].join('\n');

  const { result: response, modelUsed } = await withRetryAndFailover(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: urls.canonicalUrl,
                },
                videoMetadata: {
                  startOffset: `${window.startSec}s`,
                  endOffset: `${window.endSec}s`,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          systemInstruction:
            'You are ClipForge AI, an expert short-form viral video editor. Watch and listen to the provided YouTube video segment and identify the highest-retention short-form clip timestamps. Return strictly valid JSON matching the schema.',
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                description: '"ok" if grounded clips were found, or "insufficient_data" otherwise.',
              },
              insufficiencyReason: {
                type: Type.STRING,
                description: 'Clear reason when status is "insufficient_data", otherwise empty string.',
              },
              transcriptSummary: {
                type: Type.STRING,
                description: 'Brief timestamped summary of spoken highlights heard in this video segment.',
              },
              clips: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    duration: { type: Type.NUMBER },
                    hook: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    score: { type: Type.INTEGER },
                    caption: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'category',
                    'startTime',
                    'endTime',
                    'duration',
                    'hook',
                    'reason',
                    'score',
                    'caption',
                  ],
                },
              },
            },
            required: ['status', 'insufficiencyReason', 'transcriptSummary', 'clips'],
          },
        },
      }),
    {
      maxRetries: 1,
      timeoutMs: 65_000,
      label: 'Gemini YouTube video analysis',
    }
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse((response.text ?? '').trim()) as Record<string, unknown>;
  } catch {
    throw new GeminiServiceError(
      'Gemini returned an unreadable response while analyzing the YouTube video. Please retry.',
      502,
      'INVALID_MODEL_JSON',
      true
    );
  }

  const transcriptSummary =
    typeof parsed.transcriptSummary === 'string' ? parsed.transcriptSummary.trim() : '';

  if (parsed.status === 'insufficient_data') {
    return {
      status: 'insufficient_data',
      model: modelUsed,
      transcriptionModel: modelUsed,
      transcript: transcriptSummary,
      transcriptChunks: [],
      insufficiencyReason:
        typeof parsed.insufficiencyReason === 'string' && parsed.insufficiencyReason.trim()
          ? parsed.insufficiencyReason.trim()
          : 'Could not detect clear highlights in this YouTube window. Try shifting the analysis window or using Exact Trim.',
      clips: [],
      droppedCount: 0,
      warnings: [],
      analyzedWindow: { startSec: window.startSec, endSec: window.endSec },
    };
  }

  // Normalize timestamps: handle segment-relative (0..windowDuration) OR already-offset absolute timestamps
  const rawClips = Array.isArray(parsed.clips) ? parsed.clips : [];
  const normalizedRaw = rawClips.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const rec = item as Record<string, unknown>;
    const rawStart = Number(rec.startTime);
    const rawEnd = Number(rec.endTime);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return item;

    const alreadyAbsolute =
      window.startSec > 0 && rawStart >= window.startSec - 1 && rawEnd <= window.endSec + 5;
    const absStart = alreadyAbsolute ? rawStart : window.startSec + rawStart;
    const absEnd = alreadyAbsolute ? rawEnd : window.startSec + rawEnd;

    return {
      ...rec,
      startTime: Math.max(window.startSec, Math.min(window.endSec, absStart)),
      endTime: Math.max(window.startSec, Math.min(window.endSec, absEnd)),
    };
  });

  const validated = validateAiClipSuggestions(normalizedRaw, {
    videoDurationSeconds: Math.max(payload.durationSeconds, window.endSec),
    targetDurationSeconds: payload.targetDurationSeconds,
    maxClips: payload.clipCount,
  });

  if (validated.clips.length === 0) {
    return {
      status: 'insufficient_data',
      model: modelUsed,
      transcriptionModel: modelUsed,
      transcript: transcriptSummary,
      transcriptChunks: [],
      insufficiencyReason:
        'Gemini analyzed this YouTube window, but no valid non-overlapping clip timestamps fell inside the window bounds. Try another time window or Exact Trim.',
      clips: [],
      droppedCount: validated.droppedCount,
      warnings: validated.warnings,
      analyzedWindow: { startSec: window.startSec, endSec: window.endSec },
    };
  }

  return {
    status: 'ok',
    model: modelUsed,
    transcriptionModel: modelUsed,
    transcript: transcriptSummary,
    transcriptChunks: [],
    clips: validated.clips,
    droppedCount: validated.droppedCount,
    warnings: validated.warnings,
    analyzedWindow: { startSec: window.startSec, endSec: window.endSec },
  };
}


