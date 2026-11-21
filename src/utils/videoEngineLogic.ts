import { AspectRatio } from '../types/clipforge';
import { formatFileSize } from './timecode';

export const DEFAULT_MAX_UPLOAD_MB = 300;
export const MAX_AUDIO_ANALYSIS_DURATION_SEC = 600; // Cap single browser pass at 10 min for memory safety
export const AUDIO_CHUNK_DURATION_SEC = 30; // Extract & analyze in 30-second chunks

export interface UploadValidationResult {
  valid: boolean;
  extension: string;
  normalizedMime: string;
  warning?: string;
  error?: string;
}

const ALLOWED_EXTENSIONS = new Set(['mp4', 'webm', 'mov']);
const ALLOWED_MIME_PREFIXES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

export function extractFileExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function validateUploadFile(
  file: { name: string; size: number; type: string },
  maxUploadSizeMB = DEFAULT_MAX_UPLOAD_MB
): UploadValidationResult {
  const ext = extractFileExtension(file.name);
  const mime = (file.type || '').toLowerCase().split(';')[0].trim();

  if (!file.name || file.size <= 0) {
    return {
      valid: false,
      extension: ext,
      normalizedMime: mime,
      error: 'The selected file is empty. Please choose a valid MP4, WebM, or MOV video file.',
    };
  }

  const maxBytes = Math.max(10, maxUploadSizeMB) * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      extension: ext,
      normalizedMime: mime,
      error: `File size (${formatFileSize(file.size)}) exceeds your configured upload limit of ${maxUploadSizeMB} MB. Increase the limit in Settings or upload a smaller video.`,
    };
  }

  const hasAllowedExt = ALLOWED_EXTENSIONS.has(ext);
  const hasAllowedMime = mime !== '' && ALLOWED_MIME_PREFIXES.has(mime);

  if (!hasAllowedExt && !hasAllowedMime) {
    return {
      valid: false,
      extension: ext,
      normalizedMime: mime,
      error: `Unsupported format "${ext ? `.${ext}` : mime || 'unknown'}". Supported formats are MP4, WebM, and MOV (where browser decoding supports MOV).`,
    };
  }

  let warning: string | undefined;
  if (ext === 'mov' || mime === 'video/quicktime') {
    warning =
      'MOV support depends on your browser codec decoder (H.264/AAC MOV works best). If preview decoding fails, convert to H.264 MP4.';
  }

  const normalizedMime =
    hasAllowedMime
      ? mime
      : ext === 'webm'
        ? 'video/webm'
        : ext === 'mov'
          ? 'video/quicktime'
          : 'video/mp4';

  return {
    valid: true,
    extension: ext || (normalizedMime === 'video/webm' ? 'webm' : 'mp4'),
    normalizedMime,
    warning,
  };
}

export interface PlannedAudioChunk {
  index: number;
  startSec: number;
  durationSec: number;
  endSec: number;
}

export function planAudioChunks(
  totalDurationSec: number,
  options?: { chunkDurationSec?: number; maxTotalDurationSec?: number }
): { chunks: PlannedAudioChunk[]; analyzedDuration: number; truncatedByLimit: boolean } {
  const chunkDuration = Math.max(5, options?.chunkDurationSec ?? AUDIO_CHUNK_DURATION_SEC);
  const maxTotal = Math.max(chunkDuration, options?.maxTotalDurationSec ?? MAX_AUDIO_ANALYSIS_DURATION_SEC);

  const safeDuration = Number.isFinite(totalDurationSec) && totalDurationSec > 0 ? totalDurationSec : 0;
  if (safeDuration <= 0) {
    return { chunks: [], analyzedDuration: 0, truncatedByLimit: false };
  }

  const truncatedByLimit = safeDuration > maxTotal;
  const analyzedDuration = Math.min(safeDuration, maxTotal);
  const chunks: PlannedAudioChunk[] = [];

  let cursor = 0;
  let index = 0;
  while (cursor < analyzedDuration - 0.05) {
    const dur = Math.min(chunkDuration, analyzedDuration - cursor);
    const roundedStart = Math.round(cursor * 100) / 100;
    const roundedDur = Math.round(dur * 100) / 100;
    chunks.push({
      index,
      startSec: roundedStart,
      durationSec: roundedDur,
      endSec: Math.round((roundedStart + roundedDur) * 100) / 100,
    });
    cursor += chunkDuration;
    index += 1;
  }

  return { chunks, analyzedDuration, truncatedByLimit };
}

export function buildAspectFilterExpression(
  aspectRatio: AspectRatio,
  options?: { quality?: '1080p' | '720p'; zoom?: number; cropX?: number; cropY?: number }
): string {
  const targetShort = options?.quality === '720p' ? 720 : 1080;
  const targetW =
    aspectRatio === '9:16'
      ? Math.min(720, Math.round((targetShort * 9) / 16))
      : aspectRatio === '1:1'
        ? Math.min(720, targetShort)
        : Math.min(1280, Math.round((targetShort * 16) / 9));
  const targetH =
    aspectRatio === '9:16'
      ? Math.min(1280, targetShort)
      : aspectRatio === '1:1'
        ? Math.min(720, targetShort)
        : Math.min(720, targetShort);

  // Ensure even dimensions required by yuv420p libx264
  const evenW = targetW % 2 === 0 ? targetW : targetW - 1;
  const evenH = targetH % 2 === 0 ? targetH : targetH - 1;

  const zoomFactor = Math.max(1, Math.min(1.8, (options?.zoom ?? 100) / 100));
  const scaledW = Math.round((evenW * zoomFactor) / 2) * 2;
  const scaledH = Math.round((evenH * zoomFactor) / 2) * 2;

  // Offset pan inside zoomed/cropped region, clamped safely
  const panX = Math.max(-0.25, Math.min(0.25, (options?.cropX ?? 0) / 100));
  const panY = Math.max(-0.25, Math.min(0.25, (options?.cropY ?? 0) / 100));

  const xExpr = `'max(0,min(iw-${evenW},(iw-${evenW})/2+(${(-panX).toFixed(3)})*iw))'`;
  const yExpr = `'max(0,min(ih-${evenH},(ih-${evenH})/2+(${(-panY).toFixed(3)})*ih))'`;

  return `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=w=${evenW}:h=${evenH}:x=${xExpr}:y=${yExpr},setsar=1`;
}

export function buildFfmpegTrimArgs(params: {
  inputName: string;
  outputName: string;
  startTime: number;
  endTime: number;
  aspectRatio?: AspectRatio;
  applyReframe?: boolean;
  quality?: '1080p' | '720p';
  zoom?: number;
  cropX?: number;
  cropY?: number;
  fastStreamCopy?: boolean;
}): string[] {
  const safeStart = Math.max(0, Number.isFinite(params.startTime) ? params.startTime : 0);
  const safeDuration = Math.max(1, Math.round((params.endTime - safeStart) * 100) / 100);

  if (params.fastStreamCopy && !params.applyReframe) {
    return [
      '-ss',
      safeStart.toFixed(2),
      '-i',
      params.inputName,
      '-t',
      safeDuration.toFixed(2),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-y',
      params.outputName,
    ];
  }

  const args: string[] = [
    '-ss',
    safeStart.toFixed(2),
    '-i',
    params.inputName,
    '-t',
    safeDuration.toFixed(2),
  ];

  if (params.applyReframe && params.aspectRatio) {
    args.push(
      '-vf',
      buildAspectFilterExpression(params.aspectRatio, {
        quality: params.quality ?? '720p',
        zoom: params.zoom,
        cropX: params.cropX,
        cropY: params.cropY,
      })
    );
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    params.outputName
  );

  return args;
}

export function buildFfmpegAudioChunkArgs(params: {
  inputName: string;
  outputName: string;
  startSec: number;
  durationSec: number;
}): string[] {
  return [
    '-ss',
    Math.max(0, params.startSec).toFixed(2),
    '-i',
    params.inputName,
    '-t',
    Math.max(0.5, params.durationSec).toFixed(2),
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'wav',
    '-y',
    params.outputName,
  ];
}

export interface TrimValidationResult {
  valid: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  error?: string;
}

export function validateTrimTimestamps(
  startTime: number,
  endTime: number,
  videoDurationSeconds: number,
  minClipLength = 1
): TrimValidationResult {
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return {
      valid: false,
      startTime: 0,
      endTime: 0,
      duration: 0,
      error: 'Video duration is unknown or invalid. Re-upload a valid video file.',
    };
  }

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return {
      valid: false,
      startTime: 0,
      endTime: 0,
      duration: 0,
      error: 'Invalid timestamps: enter numeric start and end times in seconds.',
    };
  }

  if (startTime < 0) {
    return {
      valid: false,
      startTime,
      endTime,
      duration: 0,
      error: 'Invalid timestamps: start time cannot be negative.',
    };
  }

  if (endTime > videoDurationSeconds + 0.05) {
    return {
      valid: false,
      startTime,
      endTime,
      duration: 0,
      error: `Invalid timestamps: end time (${endTime.toFixed(1)}s) exceeds video duration (${videoDurationSeconds.toFixed(1)}s).`,
    };
  }

  if (endTime <= startTime) {
    return {
      valid: false,
      startTime,
      endTime,
      duration: 0,
      error: 'Invalid timestamps: end time must be strictly greater than start time.',
    };
  }

  const effectiveMin = Math.min(minClipLength, Math.max(0.5, videoDurationSeconds));
  const duration = Math.round((endTime - startTime) * 100) / 100;
  if (duration < effectiveMin) {
    return {
      valid: false,
      startTime,
      endTime,
      duration,
      error: `Invalid timestamps: clip duration must be at least ${effectiveMin.toFixed(1)}s (currently ${duration.toFixed(1)}s).`,
    };
  }

  return {
    valid: true,
    startTime: Math.round(startTime * 100) / 100,
    endTime: Math.min(videoDurationSeconds, Math.round(endTime * 100) / 100),
    duration,
  };
}

export const MAX_WASM_SINGLE_PASS_BYTES = 512 * 1024 * 1024; // 512 MB safe cap for in-browser WASM heap

export function checkBrowserMemoryBudget(
  fileSizeBytes: number,
  heapInfo?: { usedJSHeapSize: number; jsHeapSizeLimit: number } | null
): { ok: boolean; error?: string } {
  if (fileSizeBytes > MAX_WASM_SINGLE_PASS_BYTES) {
    return {
      ok: false,
      error: `Insufficient browser memory for FFmpeg.wasm: file size (${formatFileSize(fileSizeBytes)}) exceeds the safe 512 MB in-browser WASM processing cap. Trim a shorter segment, upload a smaller file, or use the WebM MediaRecorder fallback.`,
    };
  }

  if (heapInfo && heapInfo.jsHeapSizeLimit > 0) {
    const remainingBytes = heapInfo.jsHeapSizeLimit - heapInfo.usedJSHeapSize;
    // Require roughly 2.2x the source blob size available in JS heap headroom for safe copy + encode
    const estimatedNeed = Math.max(64 * 1024 * 1024, fileSizeBytes * 2.2);
    if (remainingBytes < estimatedNeed && fileSizeBytes > 32 * 1024 * 1024) {
      return {
        ok: false,
        error: `Insufficient browser memory available (${formatFileSize(Math.max(0, remainingBytes))} free heap). Close other browser tabs, upload a smaller video, or use the WebM MediaRecorder fallback.`,
      };
    }
  }

  return { ok: true };
}

export interface ClassifiedProcessingError {
  kind: 'cancelled' | 'memory' | 'codec' | 'corrupted' | 'network' | 'api' | 'timestamp' | 'generic';
  message: string;
  suggestFallback: boolean;
}

export function classifyProcessingError(err: unknown): ClassifiedProcessingError {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : 'Unknown processing error';
  const cleanMsg = err instanceof Error ? err.message : raw;
  const lower = raw.toLowerCase();

  if (lower.includes('abort') || lower.includes('cancel') || lower.includes('terminated')) {
    return {
      kind: 'cancelled',
      message: 'Processing was cancelled by user.',
      suggestFallback: false,
    };
  }

  if (lower.includes('invalid timestamp') || lower.includes('start time') && lower.includes('end time')) {
    return {
      kind: 'timestamp',
      message: cleanMsg,
      suggestFallback: false,
    };
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('could not reach') ||
    lower.includes('offline') ||
    lower.includes('econnreset') ||
    lower.includes('err_internet_disconnected')
  ) {
    return {
      kind: 'network',
      message: cleanMsg.toLowerCase().includes('network') || cleanMsg.toLowerCase().includes('reach')
        ? cleanMsg
        : 'Network error: could not reach the ClipForge AI server. Check your internet connection and retry.',
      suggestFallback: false,
    };
  }

  if (
    lower.includes('gemini') ||
    lower.includes('api key') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('http 4') ||
    lower.includes('http 5') ||
    lower.includes('server returned')
  ) {
    return {
      kind: 'api',
      message: cleanMsg,
      suggestFallback: false,
    };
  }

  if (
    lower.includes('out of memory') ||
    lower.includes('insufficient browser memory') ||
    lower.includes('oom') ||
    lower.includes('allocation failed') ||
    lower.includes('memory access out of bounds') ||
    lower.includes('quotaexceedederror') ||
    lower.includes('storage quota') ||
    lower.includes('rangeerror')
  ) {
    return {
      kind: 'memory',
      message: lower.includes('quotaexceedederror') || lower.includes('storage quota')
        ? 'Browser storage quota exceeded while caching video data in IndexedDB. Clear workspace data in Settings or upload a smaller file.'
        : 'Insufficient browser memory while processing this video. Try trimming a shorter segment, uploading a smaller file, or using the browser WebM recorder fallback.',
      suggestFallback: !lower.includes('quotaexceedederror') && !lower.includes('storage quota'),
    };
  }

  if (
    lower.includes('corrupted') ||
    lower.includes('truncated') ||
    lower.includes('invalid data found') ||
    lower.includes('moov atom not found') ||
    lower.includes('timed out decoding video metadata')
  ) {
    return {
      kind: 'corrupted',
      message: cleanMsg.toLowerCase().includes('corrupted') || cleanMsg.toLowerCase().includes('timed out')
        ? cleanMsg
        : 'The video file appears corrupted or truncated and could not be decoded. Re-export the source video and try again.',
      suggestFallback: false,
    };
  }

  if (
    lower.includes('codec') ||
    lower.includes('decoder') ||
    lower.includes('unsupported format') ||
    lower.includes('unsupported')
  ) {
    const isUploadCodec = lower.includes('unsupported format') || lower.includes('browser could not read');
    return {
      kind: 'codec',
      message: isUploadCodec
        ? cleanMsg
        : 'This video uses a codec or container stream that could not be encoded cleanly to MP4 in-browser. You can try the browser MediaRecorder WebM export alternative.',
      suggestFallback: !isUploadCodec,
    };
  }

  return {
    kind: 'generic',
    message: cleanMsg.startsWith('Video processing error:') ? cleanMsg : `Video processing error: ${cleanMsg}`,
    suggestFallback: !lower.includes('upload a local') && !lower.includes('empty') && !lower.includes('exceeds your configured'),
  };
}
