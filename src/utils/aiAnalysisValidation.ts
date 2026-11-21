import {
  AiClipCategory,
  AiClipSuggestion,
  ClipCategory,
  ClipCountOption,
  ClipDurationOption,
  TranscriptChunkResult,
} from '../types/clipforge';

export interface AnalyzeAudioChunkPayload {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  mimeType: string;
  base64Data: string;
  rmsEnergy?: number;
  peakAmplitude?: number;
}

export interface AnalyzeAudioRequestPayload {
  fileName: string;
  videoDurationSeconds: number;
  contentMode: ClipCategory;
  targetDurationSeconds: ClipDurationOption;
  clipCount: ClipCountOption;
  chunks: AnalyzeAudioChunkPayload[];
}

export interface ValidationOutcome<T> {
  valid: boolean;
  data?: T;
  error?: string;
}

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
]);

const ALLOWED_MODES = new Set<ClipCategory>([
  'Funny Moments',
  'Interesting Moments',
  'Educational',
  'Podcast',
  'Gaming',
  'Reactions',
  'Automatic Selection',
]);

const ALLOWED_DURATIONS = new Set<ClipDurationOption>([15, 30, 45, 60]);
const ALLOWED_COUNTS = new Set<ClipCountOption>([3, 5, 10]);

const MAX_CHUNKS = 20; // Up to 10 minutes of 30s chunks
const MAX_CHUNK_BASE64_CHARS = 5_500_000; // ~4 MB raw audio per chunk
const MAX_TOTAL_BASE64_CHARS = 30_000_000; // ~22 MB total audio per request

export function normalizeAiCategory(raw: unknown): AiClipCategory {
  const val = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (val.includes('fun') || val.includes('humor') || val.includes('comedy') || val.includes('punch')) {
    return 'funny';
  }
  if (val.includes('edu') || val.includes('explain') || val.includes('tutorial') || val.includes('lesson')) {
    return 'educational';
  }
  if (val.includes('pod') || val.includes('opinion') || val.includes('convo') || val.includes('interview')) {
    return 'podcast';
  }
  if (val.includes('gam') || val.includes('clutch') || val.includes('stream')) {
    return 'gaming';
  }
  if (val.includes('react') || val.includes('surpris') || val.includes('shock')) {
    return 'reactions';
  }
  if (val.includes('emot') || val.includes('heart') || val.includes('story')) {
    return 'emotional';
  }
  if (val.includes('hook') || val.includes('open')) {
    return 'hook';
  }
  return 'interesting';
}

export function mapAiCategoryToClipCategory(category: AiClipCategory): ClipCategory {
  switch (category) {
    case 'funny':
      return 'Funny Moments';
    case 'educational':
      return 'Educational';
    case 'podcast':
      return 'Podcast';
    case 'gaming':
      return 'Gaming';
    case 'reactions':
      return 'Reactions';
    case 'interesting':
    case 'emotional':
    case 'hook':
    default:
      return 'Interesting Moments';
  }
}

export function validateAnalyzeAudioRequestBody(
  body: unknown
): ValidationOutcome<AnalyzeAudioRequestPayload> {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  const fileName = typeof raw.fileName === 'string' && raw.fileName.trim() ? raw.fileName.trim().slice(0, 180) : 'uploaded-video.mp4';
  const videoDurationSeconds = Number(raw.videoDurationSeconds);

  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds < 1 || videoDurationSeconds > 14400) {
    return {
      valid: false,
      error: 'videoDurationSeconds must be a valid duration between 1 second and 4 hours.',
    };
  }

  const contentMode = raw.contentMode as ClipCategory;
  if (!ALLOWED_MODES.has(contentMode)) {
    return { valid: false, error: 'Invalid contentMode specified.' };
  }

  const targetDurationSeconds = Number(raw.targetDurationSeconds) as ClipDurationOption;
  if (!ALLOWED_DURATIONS.has(targetDurationSeconds)) {
    return { valid: false, error: 'targetDurationSeconds must be 15, 30, 45, or 60.' };
  }

  const clipCount = Number(raw.clipCount) as ClipCountOption;
  if (!ALLOWED_COUNTS.has(clipCount)) {
    return { valid: false, error: 'clipCount must be 3, 5, or 10.' };
  }

  if (!Array.isArray(raw.chunks) || raw.chunks.length === 0) {
    return { valid: false, error: 'At least one extracted audio chunk is required.' };
  }

  if (raw.chunks.length > MAX_CHUNKS) {
    return {
      valid: false,
      error: `Too many audio chunks (${raw.chunks.length}). Maximum supported per analysis pass is ${MAX_CHUNKS}.`,
    };
  }

  const validatedChunks: AnalyzeAudioChunkPayload[] = [];
  let totalBase64Length = 0;

  for (let i = 0; i < raw.chunks.length; i += 1) {
    const item = raw.chunks[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Chunk ${i} is malformed.` };
    }
    const c = item as Record<string, unknown>;
    const startSec = Number(c.startSec);
    const endSec = Number(c.endSec);
    const durationSec = Number(c.durationSec);
    const mimeType = typeof c.mimeType === 'string' ? c.mimeType.toLowerCase().split(';')[0].trim() : '';
    const base64Data = typeof c.base64Data === 'string' ? c.base64Data.trim() : '';

    if (
      !Number.isFinite(startSec) ||
      !Number.isFinite(endSec) ||
      !Number.isFinite(durationSec) ||
      startSec < 0 ||
      endSec <= startSec ||
      durationSec <= 0
    ) {
      return { valid: false, error: `Chunk ${i} has invalid time boundaries.` };
    }

    if (!ALLOWED_AUDIO_MIMES.has(mimeType)) {
      return {
        valid: false,
        error: `Chunk ${i} uses unsupported audio MIME type "${mimeType}".`,
      };
    }

    if (base64Data.length < 32 || base64Data.length > MAX_CHUNK_BASE64_CHARS) {
      return {
        valid: false,
        error: `Chunk ${i} audio payload size is outside allowed bounds.`,
      };
    }

    totalBase64Length += base64Data.length;
    if (totalBase64Length > MAX_TOTAL_BASE64_CHARS) {
      return {
        valid: false,
        error: 'Total audio payload exceeds the server processing limit. Trim or analyze a shorter section.',
      };
    }

    validatedChunks.push({
      index: Number.isInteger(Number(c.index)) ? Number(c.index) : i,
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      durationSec: Math.round(durationSec * 100) / 100,
      mimeType,
      base64Data,
      rmsEnergy: Number.isFinite(Number(c.rmsEnergy)) ? Number(c.rmsEnergy) : undefined,
      peakAmplitude: Number.isFinite(Number(c.peakAmplitude)) ? Number(c.peakAmplitude) : undefined,
    });
  }

  return {
    valid: true,
    data: {
      fileName,
      videoDurationSeconds: Math.round(videoDurationSeconds * 100) / 100,
      contentMode,
      targetDurationSeconds,
      clipCount,
      chunks: validatedChunks,
    },
  };
}

export function buildAiContentModePrompt(mode: ClipCategory): string {
  switch (mode) {
    case 'Funny Moments':
      return 'MODE = FUNNY: Prioritize humorous statements, comedic timing, punchlines, unexpected situations, playful banter, and naturally funny reactions. Never cut off the setup or the punchline.';
    case 'Interesting Moments':
      return 'MODE = INTERESTING: Prioritize curiosity hooks, surprising facts, counterintuitive insights, engaging discussions, and memorable storytelling beats.';
    case 'Educational':
      return 'MODE = EDUCATIONAL: Prioritize clear, self-contained explanations, actionable frameworks, step-by-step insights, and complete conceptual ideas.';
    case 'Podcast':
      return 'MODE = PODCAST: Prioritize strong opinions, memorable quotable statements, high-signal debates, and complete conversational exchanges.';
    case 'Gaming':
      return 'MODE = GAMING: Prioritize high-tension clutch callouts, surprising plays, intense reactions, and funny squad comms.';
    case 'Reactions':
      return 'MODE = REACTIONS: Prioritize sudden emotional shifts, gasps, laughter, genuine shock, and expressive commentary.';
    case 'Automatic Selection':
    default:
      return 'MODE = AUTOMATIC: Select a balanced mix of the highest-retention moments across funny, interesting, educational, podcast opinion, emotional, and strong-hook categories.';
  }
}

export function buildClipSelectionPrompt(params: {
  fileName: string;
  videoDurationSeconds: number;
  analyzedDurationSeconds: number;
  contentMode: ClipCategory;
  targetDurationSeconds: ClipDurationOption;
  clipCount: ClipCountOption;
  transcriptChunks: TranscriptChunkResult[];
}): string {
  const effectiveTarget = Math.min(params.targetDurationSeconds, Math.max(3, Math.floor(params.videoDurationSeconds)));
  const maxPossibleClips = Math.max(
    1,
    Math.min(params.clipCount, Math.ceil(params.analyzedDurationSeconds / Math.max(4, Math.min(effectiveTarget * 0.5, 10))))
  );

  const chunkLines = params.transcriptChunks
    .map(
      (chunk) =>
        `[Chunk ${chunk.index + 1} | ${chunk.startSec.toFixed(1)}s - ${chunk.endSec.toFixed(1)}s | speech=${chunk.hasSpeech ? 'yes' : 'no'}]: ${
          chunk.text.trim() || '(no intelligible speech detected)'
        }`
    )
    .join('\n');

  return [
    `Video file: ${params.fileName}`,
    `Total actual video duration: ${params.videoDurationSeconds.toFixed(2)} seconds (analyzed audio window: 0.00s to ${params.analyzedDurationSeconds.toFixed(2)}s).`,
    `Requested content mode: ${params.contentMode}`,
    buildAiContentModePrompt(params.contentMode),
    `Requested target clip duration: ~${effectiveTarget} seconds (user selected ${params.targetDurationSeconds}s; adapt cleanly if the source video is shorter than ${params.targetDurationSeconds}s, keeping every clip complete and strictly inside [0, ${params.analyzedDurationSeconds.toFixed(2)}]).`,
    `Requested number of clips: up to ${maxPossibleClips} distinct non-overlapping clips (never fabricate extra clips if fewer genuine moments exist).`,
    '',
    'CRITICAL SELECTION REQUIREMENTS:',
    '1. Analyze the full transcript and audio context (speech, tone, humor, reactions, strong hooks, opinions, educational explanations, emotional moments, punchlines).',
    '2. Avoid starting or ending mid-sentence; keep complete thoughts intact.',
    '3. Never cut off a punchline, reveal, or key takeaway.',
    '4. Prefer moments with an immediate strong opening hook in the first 2-3 seconds.',
    '5. Preserve the speaker’s original meaning — do not twist context.',
    '6. Avoid duplicate or heavily overlapping time ranges.',
    '7. Respect the target clip duration as closely as natural sentence boundaries allow.',
    `8. Every startTime and endTime MUST be valid numbers with 0 <= startTime < endTime <= ${params.analyzedDurationSeconds.toFixed(2)}.`,
    '9. Provide a concrete hook description and clear explanation ("reason") grounded in what is actually said.',
    '10. If the audio lacks sufficient intelligible speech or timestamp cues to select real clips reliably, set status="insufficient_data", explain why in insufficiencyReason, and return clips=[]. Do NOT invent timestamps or hallucinate speech.',
    '',
    'TIMESTAMPED TRANSCRIPT BY CHUNK:',
    chunkLines,
  ].join('\n');
}

const NON_SPEECH_PATTERNS = [
  /^\[?(silence|silent|music|instrumental|tone|beep|static|noise|no speech|inaudible|background noise|applause|laughter|blank_audio)\]?$/i,
  /^(\(no speech\)|\(silence\)|\(music\)|\(tone\)|\(inaudible\))$/i,
];

export function cleanTranscriptText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function isMeaningfulSpeech(text: string): boolean {
  const cleaned = cleanTranscriptText(text);
  if (!cleaned) return false;
  if (NON_SPEECH_PATTERNS.some((re) => re.test(cleaned))) return false;
  // Strip bracketed sound tags like [silence], [music], [beep], (tone)
  const spokenOnly = cleaned
    .replace(/\[[^\]]{1,40}\]/g, ' ')
    .replace(/\([^)]{1,40}\)/g, ' ')
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u3040-\u9FFF\s']/g, ' ')
    .trim();
  const words = spokenOnly.split(/\s+/).filter((w) => w.length > 0);
  return words.length >= 3;
}

export function hasSufficientSpeechTranscript(chunks: TranscriptChunkResult[]): {
  sufficient: boolean;
  totalWords: number;
  reason?: string;
} {
  const spokenTexts = chunks
    .filter((c) => c.hasSpeech && isMeaningfulSpeech(c.text))
    .map((c) => cleanTranscriptText(c.text));

  const combined = spokenTexts.join(' ').trim();
  const words = combined
    ? combined
        .replace(/\[[^\]]{1,40}\]/g, ' ')
        .replace(/\([^)]{1,40}\)/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    : [];

  if (words.length < 4) {
    return {
      sufficient: false,
      totalWords: words.length,
      reason:
        'Insufficient intelligible speech was detected in the extracted audio track to generate grounded transcript timestamps. Upload a video with spoken dialogue or use Exact Trim mode to cut timestamps manually.',
    };
  }

  return {
    sufficient: true,
    totalWords: words.length,
  };
}

export interface ValidatedAiClipsResult {
  clips: AiClipSuggestion[];
  droppedCount: number;
  warnings: string[];
}

function computeOverlapRatio(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const inter = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  if (inter <= 0) return 0;
  const minDur = Math.max(0.001, Math.min(aEnd - aStart, bEnd - bStart));
  return inter / minDur;
}

export function validateAiClipSuggestions(
  rawClips: unknown,
  options: {
    videoDurationSeconds: number;
    targetDurationSeconds: ClipDurationOption;
    maxClips: number;
  }
): ValidatedAiClipsResult {
  const warnings: string[] = [];
  if (!Array.isArray(rawClips)) {
    return { clips: [], droppedCount: 0, warnings: ['AI response did not contain a clips array.'] };
  }

  const maxDur = Math.max(1, options.videoDurationSeconds);
  const minClipDuration = Math.min(2, Math.max(1, maxDur * 0.4));
  let droppedCount = 0;

  const candidates: AiClipSuggestion[] = [];

  for (const item of rawClips) {
    if (!item || typeof item !== 'object') {
      droppedCount += 1;
      continue;
    }
    const obj = item as Record<string, unknown>;
    const startRaw = Number(obj.startTime);
    const endRaw = Number(obj.endTime);

    if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) {
      droppedCount += 1;
      warnings.push('Dropped an AI clip with non-numeric timestamps.');
      continue;
    }

    // Reject timestamps that lie completely outside video bounds
    if (startRaw < -0.5 || startRaw >= maxDur || endRaw <= 0 || endRaw > maxDur + 1.0) {
      droppedCount += 1;
      warnings.push(
        `Dropped an AI clip with out-of-range timestamps (${startRaw.toFixed(1)}s–${endRaw.toFixed(1)}s for ${maxDur.toFixed(1)}s video).`
      );
      continue;
    }

    const startTime = Math.round(Math.max(0, Math.min(maxDur - minClipDuration, startRaw)) * 10) / 10;
    const endTime = Math.round(Math.max(0, Math.min(maxDur, endRaw)) * 10) / 10;
    const duration = Math.round((endTime - startTime) * 10) / 10;

    if (duration < minClipDuration) {
      droppedCount += 1;
      warnings.push(`Dropped an AI clip shorter than ${minClipDuration.toFixed(1)}s.`);
      continue;
    }

    const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 120) : '';
    const hook = typeof obj.hook === 'string' && obj.hook.trim() ? obj.hook.trim().slice(0, 220) : '';
    const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim().slice(0, 320) : '';
    const caption = typeof obj.caption === 'string' && obj.caption.trim() ? obj.caption.trim().slice(0, 240) : '';

    if (!title || !reason) {
      droppedCount += 1;
      warnings.push('Dropped an AI clip missing title or explanation.');
      continue;
    }

    const rawScore = Number(obj.score);
    const score = Number.isFinite(rawScore) ? Math.max(1, Math.min(100, Math.round(rawScore))) : 75;

    candidates.push({
      title,
      category: normalizeAiCategory(obj.category),
      startTime,
      endTime,
      duration,
      hook: hook || title,
      reason,
      score,
      caption: caption || title,
    });
  }

  // Sort by highest score first, then deduplicate heavily overlapping segments (>55% overlap)
  candidates.sort((a, b) => b.score - a.score || a.startTime - b.startTime);

  const accepted: AiClipSuggestion[] = [];
  for (const clip of candidates) {
    const isDuplicate = accepted.some(
      (existing) => computeOverlapRatio(existing.startTime, existing.endTime, clip.startTime, clip.endTime) > 0.55
    );
    if (isDuplicate) {
      droppedCount += 1;
      warnings.push(`Removed duplicate overlapping moment "${clip.title}" (${clip.startTime}s–${clip.endTime}s).`);
      continue;
    }
    accepted.push(clip);
    if (accepted.length >= options.maxClips) break;
  }

  return {
    clips: accepted,
    droppedCount,
    warnings,
  };
}
