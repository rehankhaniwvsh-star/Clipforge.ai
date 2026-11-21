import {
  AiAudioAnalysisResponse,
  AudioPreparationResult,
  ClipCategory,
  ClipCountOption,
  ClipDurationOption,
  ProcessingStatus,
} from '../types/clipforge';
import {
  AnalyzeAudioChunkPayload,
  validateAiClipSuggestions,
} from './aiAnalysisValidation';
import { loadMediaBlob } from './mediaStorage';

const CLIENT_ANALYSIS_TIMEOUT_MS = 135_000;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
}

export async function requestGeminiAudioAnalysis(
  params: {
    fileName: string;
    videoDurationSeconds: number;
    contentMode: ClipCategory;
    targetDurationSeconds: ClipDurationOption;
    clipCount: ClipCountOption;
    audioPrep: AudioPreparationResult;
  },
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<AiAudioAnalysisResponse> {
  if (!params.audioPrep.hasAudioTrack || params.audioPrep.chunks.length === 0) {
    return {
      status: 'insufficient_data',
      model: 'gemini-4-hydrogen',
      transcriptionModel: 'gemini-4-hydrogen',
      transcript: '',
      transcriptChunks: [],
      insufficiencyReason:
        'No audio track was detected in this video file. Gemini requires spoken audio to analyze moments and timestamps. You can still use Exact Trim mode to cut timestamps manually.',
      clips: [],
      droppedCount: 0,
      warnings: [],
    };
  }

  onStatus?.({
    stage: 'Analyzing with Gemini AI',
    progress: 10,
    detail: `Encoding ${params.audioPrep.chunks.length} extracted WAV ${
      params.audioPrep.chunks.length === 1 ? 'chunk' : 'chunks'
    } for secure server-side Gemini analysis...`,
  });

  const chunksPayload: AnalyzeAudioChunkPayload[] = [];
  for (let i = 0; i < params.audioPrep.chunks.length; i += 1) {
    if (signal?.aborted) {
      throw new DOMException('AI analysis cancelled', 'AbortError');
    }
    const chunk = params.audioPrep.chunks[i];
    if (!chunk.storageKey) continue;
    const blob = await loadMediaBlob(chunk.storageKey);
    if (!blob || blob.size < 44) continue;

    const base64Data = await blobToBase64(blob);
    chunksPayload.push({
      index: chunk.index,
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      durationSec: chunk.durationSec,
      mimeType: blob.type || 'audio/wav',
      base64Data,
      rmsEnergy: chunk.rmsEnergy,
      peakAmplitude: chunk.peakAmplitude,
    });
  }

  if (chunksPayload.length === 0) {
    throw new Error(
      'Extracted audio chunks were not found in browser storage. Click "Prepare Audio Chunks" and try again.'
    );
  }

  onStatus?.({
    stage: 'Analyzing with Gemini AI',
    progress: null,
    detail: `Transcribing speech and analyzing ${params.contentMode.toLowerCase()} moments with Gemini AI on the server...`,
  });

  const timeoutController = new AbortController();
  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = window.setTimeout(() => timeoutController.abort(), CLIENT_ANALYSIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/ai/analyze-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: timeoutController.signal,
      body: JSON.stringify({
        fileName: params.fileName,
        videoDurationSeconds: params.videoDurationSeconds,
        contentMode: params.contentMode,
        targetDurationSeconds: params.targetDurationSeconds,
        clipCount: params.clipCount,
        chunks: chunksPayload,
      }),
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('AI analysis cancelled', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Gemini analysis timed out waiting for the server. Please retry or analyze a shorter recording.'
      );
    }
    throw new Error(
      'Could not reach the ClipForge AI server endpoint. Verify your connection and try again.'
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const errObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const msg =
      typeof errObj.error === 'string' && errObj.error.trim()
        ? errObj.error.trim()
        : `Gemini analysis failed with HTTP ${response.status}.`;
    throw new Error(msg);
  }

  const parsed = data as AiAudioAnalysisResponse;

  // Client-side second-layer timestamp validation before rendering
  if (parsed.status === 'ok') {
    const revalidated = validateAiClipSuggestions(parsed.clips, {
      videoDurationSeconds: params.videoDurationSeconds,
      targetDurationSeconds: params.targetDurationSeconds,
      maxClips: params.clipCount,
    });
    const combinedWarnings = Array.from(
      new Set([...(parsed.warnings ?? []), ...revalidated.warnings])
    );

    if (revalidated.clips.length === 0) {
      return {
        ...parsed,
        status: 'insufficient_data',
        insufficiencyReason:
          'No AI clip suggestions passed final timestamp validation for this video duration.',
        clips: [],
        droppedCount: (parsed.droppedCount ?? 0) + revalidated.droppedCount,
        warnings: combinedWarnings,
      };
    }

    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail: `Gemini AI identified ${revalidated.clips.length} validated ${
        revalidated.clips.length === 1 ? 'clip' : 'clips'
      } grounded in your video's speech.`,
    });

    return {
      ...parsed,
      clips: revalidated.clips,
      droppedCount: (parsed.droppedCount ?? 0) + revalidated.droppedCount,
      warnings: combinedWarnings,
    };
  }

  onStatus?.({
    stage: 'Completed',
    progress: 100,
    detail:
      parsed.insufficiencyReason ||
      'Gemini reported insufficient speech or timestamp cues in this video.',
  });

  return parsed;
}

export async function requestGeminiYouTubeAnalysis(
  params: {
    videoId: string;
    title: string;
    durationSeconds: number;
    contentMode: ClipCategory;
    targetDurationSeconds: ClipDurationOption;
    clipCount: ClipCountOption;
    windowStartSec?: number;
    windowEndSec?: number;
  },
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<AiAudioAnalysisResponse> {
  onStatus?.({
    stage: 'Analyzing with Gemini AI',
    progress: null,
    detail: `Analyzing YouTube video segment for ${params.contentMode.toLowerCase()} with server-side Gemini AI...`,
  });

  const timeoutController = new AbortController();
  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = window.setTimeout(() => timeoutController.abort(), CLIENT_ANALYSIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('/api/ai/analyze-youtube', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: timeoutController.signal,
      body: JSON.stringify(params),
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('AI analysis cancelled', 'AbortError');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Gemini YouTube analysis timed out waiting for the server. Try analyzing a shorter time window (e.g., 5–10 minutes).'
      );
    }
    throw new Error(
      'Could not reach the ClipForge AI server endpoint. Verify your connection and try again.'
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned an unexpected response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const errObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const msg =
      typeof errObj.error === 'string' && errObj.error.trim()
        ? errObj.error.trim()
        : `Gemini YouTube analysis failed with HTTP ${response.status}.`;
    throw new Error(msg);
  }

  const parsed = data as AiAudioAnalysisResponse;
  if (parsed.status === 'ok' && parsed.clips.length > 0) {
    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail: `Gemini AI identified ${parsed.clips.length} validated ${
        parsed.clips.length === 1 ? 'clip' : 'clips'
      } directly from this YouTube video.`,
    });
  } else {
    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail:
        parsed.insufficiencyReason ||
        'No highlight clips were detected in that window. Try adjusting the time window or using Exact Trim.',
    });
  }

  return parsed;
}

