import {
  CaptionLanguageMode,
  CaptionReactionResponse,
  ProcessingStatus,
} from '../types/clipforge';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export interface RequestCaptionsReactionsParams {
  audioBlob: Blob;
  clipTitle: string;
  clipDurationSeconds: number;
  languageMode: CaptionLanguageMode;
  includeReactions: boolean;
  existingTranscript?: string;
  onStatus?: (status: ProcessingStatus) => void;
  signal?: AbortSignal;
}

const CAPTION_REQUEST_TIMEOUT_MS = 95_000;

export async function requestCaptionsAndReactions(
  params: RequestCaptionsReactionsParams
): Promise<CaptionReactionResponse> {
  params.onStatus?.({
    stage: 'Generating captions',
    progress: 35,
    detail: params.includeReactions
      ? 'Sending clip audio to Gemini AI for synced captions and comedic reaction cues...'
      : 'Sending clip audio to Gemini AI for word-level synced captions...',
  });

  const buffer = await params.audioBlob.arrayBuffer();
  if (params.signal?.aborted) {
    throw new DOMException('Caption generation cancelled', 'AbortError');
  }

  const audioBase64 = arrayBufferToBase64(buffer);

  const timeoutController = new AbortController();
  const onExternalAbort = () => timeoutController.abort();
  params.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = window.setTimeout(() => timeoutController.abort(), CAPTION_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/ai/generate-captions-and-reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutController.signal,
      body: JSON.stringify({
        clipTitle: params.clipTitle,
        clipDurationSeconds: params.clipDurationSeconds,
        languageMode: params.languageMode,
        includeReactions: params.includeReactions,
        audioBase64,
        audioMimeType: params.audioBlob.type || 'audio/wav',
        existingTranscript: params.existingTranscript,
      }),
    });
  } catch (err) {
    if (params.signal?.aborted) {
      throw new DOMException('Caption generation cancelled', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Gemini caption generation timed out waiting for the server. Please retry with a shorter clip.'
      );
    }
    throw new Error(
      'Network error: Could not reach the ClipForge AI server to generate captions. Check your connection and retry.'
    );
  } finally {
    window.clearTimeout(timer);
    params.signal?.removeEventListener('abort', onExternalAbort);
  }

  const data = (await response.json().catch(() => null)) as
    | (CaptionReactionResponse & { error?: string })
    | null;

  if (!response.ok || !data) {
    const msg =
      data && typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : `Gemini caption generation failed (HTTP ${response.status}).`;
    throw new Error(msg);
  }

  params.onStatus?.({
    stage: 'Completed',
    progress: 100,
    detail:
      data.status === 'no_speech'
        ? 'No intelligible speech detected in this clip audio.'
        : `Generated ${data.captions.length} synced caption ${
            data.captions.length === 1 ? 'segment' : 'segments'
          }${data.reactionEffects.length > 0 ? ` and ${data.reactionEffects.length} comedic reaction suggestion(s)` : ''}.`,
  });

  return data;
}
