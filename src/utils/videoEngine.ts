import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  AspectRatio,
  AudioChunkSummary,
  AudioPreparationResult,
  ClipEditorSettings,
  ProcessingStatus,
} from '../types/clipforge';
import {
  AUDIO_CHUNK_DURATION_SEC,
  buildFfmpegAudioChunkArgs,
  buildFfmpegTrimArgs,
  checkBrowserMemoryBudget,
  classifyProcessingError,
  MAX_AUDIO_ANALYSIS_DURATION_SEC,
  planAudioChunks,
  validateTrimTimestamps,
  validateUploadFile,
} from './videoEngineLogic';
import { saveMediaBlob } from './mediaStorage';
import { renderClipFrameToCanvas } from './canvasClipRenderer';
import { evaluateReactionEffectsAtTime } from './captionReactionLogic';
import { buildClipSfxMixWav } from './sfxSynth';
import type {
  AnalyzeWavChunkRequest,
  AnalyzeWavChunkResponse,
} from '../workers/mediaAnalysisWorker';

export interface BrowserMediaCapabilities {
  webAssembly: boolean;
  webWorkers: boolean;
  indexedDB: boolean;
  mediaRecorder: boolean;
  mediaRecorderMimeType: string | null;
  ffmpegSupported: boolean;
}

export function detectBrowserMediaCapabilities(): BrowserMediaCapabilities {
  const webAssembly = typeof WebAssembly !== 'undefined';
  const webWorkers = typeof Worker !== 'undefined';
  const indexedDBAvailable = typeof indexedDB !== 'undefined';
  const mediaRecorder = typeof MediaRecorder !== 'undefined';

  let mediaRecorderMimeType: string | null = null;
  if (mediaRecorder && typeof MediaRecorder.isTypeSupported === 'function') {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    mediaRecorderMimeType = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || null;
  }

  return {
    webAssembly,
    webWorkers,
    indexedDB: indexedDBAvailable,
    mediaRecorder,
    mediaRecorderMimeType,
    ffmpegSupported: webAssembly && webWorkers,
  };
}

// Singleton FFmpeg worker manager with serialized execution and safe termination on cancel/error
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegCoreUrls: { coreURL: string; wasmURL: string } | null = null;

async function getLoadedFfmpeg(
  signal?: AbortSignal,
  onStatus?: (status: ProcessingStatus) => void
): Promise<FFmpeg> {
  if (signal?.aborted) {
    throw new DOMException('Aborted before loading FFmpeg', 'AbortError');
  }

  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const caps = detectBrowserMediaCapabilities();
      if (!caps.ffmpegSupported) {
        throw new Error('WebAssembly or Web Workers are not supported in this browser.');
      }

      onStatus?.({
        stage: 'Loading video',
        progress: null,
        detail: 'Initializing FFmpeg.wasm video engine in Web Worker...',
      });

      const instance = new FFmpeg();
      if (!ffmpegCoreUrls) {
        const origin = window.location.origin;
        const [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${origin}/ffmpeg/ffmpeg-core.js`, 'text/javascript'),
          toBlobURL(`${origin}/ffmpeg/ffmpeg-core.wasm`, 'application/wasm'),
        ]);
        ffmpegCoreUrls = { coreURL, wasmURL };
      }

      await instance.load(
        {
          coreURL: ffmpegCoreUrls.coreURL,
          wasmURL: ffmpegCoreUrls.wasmURL,
        },
        { signal }
      );

      ffmpegInstance = instance;
      return instance;
    })().catch((err) => {
      ffmpegLoadPromise = null;
      ffmpegInstance = null;
      throw err;
    });
  }

  return ffmpegLoadPromise;
}

export function terminateFfmpegWorker(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // ignore
    }
    ffmpegInstance = null;
  }
  ffmpegLoadPromise = null;
}

let analysisWorker: Worker | null = null;

function analyzeWavInWorker(
  chunkIndex: number,
  startSec: number,
  wavBytes: Uint8Array,
  signal?: AbortSignal
): Promise<AnalyzeWavChunkResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled audio chunk analysis', 'AbortError'));
      return;
    }

    if (!analysisWorker) {
      analysisWorker = new Worker(
        new URL('../workers/mediaAnalysisWorker.ts', import.meta.url),
        { type: 'module' }
      );
    }

    const id = `chunk-${chunkIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Copy buffer before transferring ownership to worker
    const copy = wavBytes.slice().buffer;

    const handleMessage = (event: MessageEvent<AnalyzeWavChunkResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data);
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Audio analysis worker error'));
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Cancelled audio analysis', 'AbortError'));
    };

    const cleanup = () => {
      analysisWorker?.removeEventListener('message', handleMessage);
      analysisWorker?.removeEventListener('error', handleError);
      signal?.removeEventListener('abort', handleAbort);
    };

    analysisWorker.addEventListener('message', handleMessage);
    analysisWorker.addEventListener('error', handleError);
    signal?.addEventListener('abort', handleAbort, { once: true });

    const payload: AnalyzeWavChunkRequest = {
      id,
      chunkIndex,
      startSec,
      wavBuffer: copy,
    };
    analysisWorker.postMessage(payload, [copy]);
  });
}

export interface VideoIngestionResult {
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
  fileBlob: Blob;
  thumbnailBlob: Blob;
  warning?: string;
}

/**
 * Validates an uploaded video file, extracts genuine HTML5 metadata (duration, resolution),
 * and captures a real decoded video frame thumbnail via Canvas API.
 */
export async function inspectAndIngestVideoFile(
  file: File,
  maxUploadSizeMB: number,
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<VideoIngestionResult> {
  onStatus?.({
    stage: 'Loading video',
    progress: null,
    detail: `Validating ${file.name}...`,
  });

  const validation = validateUploadFile(file, maxUploadSizeMB);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid video file.');
  }

  if (signal?.aborted) {
    throw new DOMException('Upload cancelled', 'AbortError');
  }

  onStatus?.({
    stage: 'Reading metadata',
    progress: null,
    detail: 'Decoding video stream metadata and generating frame thumbnail...',
  });

  const tempUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  try {
    const metadata = await new Promise<{ duration: number; width: number; height: number }>(
      (resolve, reject) => {
        const metadataTimer = window.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              `Timed out decoding video metadata for "${file.name}". The file may be corrupted or use an unsupported codec.`
            )
          );
        }, 12_000);

        const onAbort = () => {
          cleanup();
          reject(new DOMException('Upload cancelled', 'AbortError'));
        };
        const onLoadedMetadata = () => {
          const duration =
            Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
          if (duration <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
            cleanup();
            reject(
              new Error(
                'Browser could not read a valid video stream from this file. The file may be corrupted, audio-only, or use an unsupported codec (convert to H.264 MP4 or WebM).'
              )
            );
            return;
          }
          cleanup();
          resolve({
            duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };
        const onError = () => {
          const code = video.error?.code;
          cleanup();
          if (code === MediaError.MEDIA_ERR_DECODE) {
            reject(
              new Error(
                `Corrupted or truncated video stream detected in "${file.name}". Re-export the source video and upload again.`
              )
            );
            return;
          }
          reject(
            new Error(
              `Unsupported codec or corrupted video file (${file.name}). Ensure the file is a valid H.264 MP4, VP8/VP9 WebM, or browser-decodable MOV.`
            )
          );
        };
        const cleanup = () => {
          window.clearTimeout(metadataTimer);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          signal?.removeEventListener('abort', onAbort);
        };

        signal?.addEventListener('abort', onAbort, { once: true });
        video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        video.addEventListener('error', onError, { once: true });
        video.src = tempUrl;
        video.load();
      }
    );

    if (signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError');
    }

    // Capture a real decoded frame thumbnail using Canvas API at ~10% (capped to 1.5s)
    const seekTarget = Math.min(Math.max(0.2, metadata.duration * 0.1), Math.max(0.2, metadata.duration - 0.1), 1.5);
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => resolve(), 2500);
      const onSeeked = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.currentTime = seekTarget;
      } catch {
        window.clearTimeout(timeout);
        resolve();
      }
    });

    const thumbCanvas = document.createElement('canvas');
    const maxThumbW = 640;
    const scale = Math.min(1, maxThumbW / metadata.width);
    thumbCanvas.width = Math.max(160, Math.round(metadata.width * scale));
    thumbCanvas.height = Math.max(90, Math.round(metadata.height * scale));
    const ctx = thumbCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }

    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
      thumbCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode video thumbnail frame.'));
        },
        'image/jpeg',
        0.86
      );
    });

    return {
      fileName: file.name,
      fileSizeBytes: file.size,
      durationSeconds: Math.round(metadata.duration * 100) / 100,
      width: metadata.width,
      height: metadata.height,
      mimeType: validation.normalizedMime,
      fileBlob: file,
      thumbnailBlob,
      warning: validation.warning,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(tempUrl);
  }
}

/**
 * Extracts 16kHz mono WAV audio in bounded chunks (30s windows, capped at 10m per browser pass)
 * using FFmpeg.wasm and analyzes each chunk in a dedicated Web Worker to prepare audio payloads
 * for downstream AI analysis without overloading browser memory.
 */
export async function prepareAudioChunksFromVideo(
  sourceBlob: Blob,
  fileName: string,
  durationSeconds: number,
  storagePrefix: string,
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<AudioPreparationResult> {
  const plan = planAudioChunks(durationSeconds, {
    chunkDurationSec: AUDIO_CHUNK_DURATION_SEC,
    maxTotalDurationSec: MAX_AUDIO_ANALYSIS_DURATION_SEC,
  });

  if (plan.chunks.length === 0) {
    return {
      sampleRate: 16000,
      channels: 1,
      totalDurationAnalyzed: 0,
      truncatedByLimit: false,
      hasAudioTrack: false,
      chunks: [],
      suggestedPeaksSec: [],
    };
  }

  const perfMemory = (
    performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
  ).memory;
  const memBudget = checkBrowserMemoryBudget(sourceBlob.size, perfMemory ?? null);
  if (!memBudget.ok) {
    throw new Error(memBudget.error);
  }

  const ffmpeg = await getLoadedFfmpeg(signal, onStatus);
  const ext = fileName.toLowerCase().endsWith('.webm')
    ? 'webm'
    : fileName.toLowerCase().endsWith('.mov')
      ? 'mov'
      : 'mp4';
  const inputName = `audio_src_${Date.now()}.${ext}`;

  onStatus?.({
    stage: 'Preparing audio',
    progress: 0,
    detail: `Loading source into FFmpeg worker for chunked audio extraction (${plan.chunks.length} ${plan.chunks.length === 1 ? 'chunk' : 'chunks'})...`,
  });

  const inputBytes = await fetchFile(sourceBlob);
  if (signal?.aborted) {
    throw new DOMException('Audio preparation cancelled', 'AbortError');
  }

  await ffmpeg.writeFile(inputName, inputBytes, { signal });

  const summaries: AudioChunkSummary[] = [];
  const peaks: Array<{ timeSec: number; energy: number }> = [];
  let hasAudioTrack = false;

  try {
    for (let i = 0; i < plan.chunks.length; i += 1) {
      if (signal?.aborted) {
        throw new DOMException('Audio preparation cancelled', 'AbortError');
      }
      const chunk = plan.chunks[i];
      const outWav = `chunk_${i}_${Date.now()}.wav`;

      onStatus?.({
        stage: 'Preparing audio',
        progress: Math.round((i / plan.chunks.length) * 100),
        detail: `Extracting 16kHz mono audio chunk ${i + 1} of ${plan.chunks.length} (${chunk.startSec}s–${chunk.endSec}s)...`,
      });

      const args = buildFfmpegAudioChunkArgs({
        inputName,
        outputName: outWav,
        startSec: chunk.startSec,
        durationSec: chunk.durationSec,
      });

      const exitCode = await ffmpeg.exec(args, undefined, { signal });
      if (exitCode !== 0) {
        // Video may have no audio stream (silent video) — handle gracefully without failing upload
        break;
      }

      const rawData = await ffmpeg.readFile(outWav, undefined, { signal });
      await ffmpeg.deleteFile(outWav).catch(() => {});

      const bytes =
        rawData instanceof Uint8Array
          ? rawData
          : new TextEncoder().encode(String(rawData));

      if (bytes.byteLength <= 44) {
        continue;
      }

      hasAudioTrack = true;
      const stats = await analyzeWavInWorker(i, chunk.startSec, bytes, signal);

      // Persist extracted WAV chunk in IndexedDB ready for AI transcription/analysis
      const storageKey = `${storagePrefix}-audio-chunk-${i}`;
      const wavBlob = new Blob([bytes.slice()], { type: 'audio/wav' });
      await saveMediaBlob(storageKey, wavBlob).catch(() => {});

      summaries.push({
        index: i,
        startSec: chunk.startSec,
        endSec: chunk.endSec,
        durationSec: stats.durationSec || chunk.durationSec,
        rmsEnergy: stats.rmsEnergy,
        peakAmplitude: stats.peakAmplitude,
        byteSize: bytes.byteLength,
        storageKey,
      });

      peaks.push({
        timeSec: Math.round((chunk.startSec + stats.peakOffsetSec) * 10) / 10,
        energy: stats.rmsEnergy + stats.peakAmplitude * 0.5,
      });
    }
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
  }

  onStatus?.({
    stage: 'Completed',
    progress: 100,
    detail: hasAudioTrack
      ? `Prepared ${summaries.length} audio ${summaries.length === 1 ? 'chunk' : 'chunks'} (16kHz mono WAV) for analysis.`
      : 'Video loaded (no audio track detected in source stream).',
  });

  const suggestedPeaksSec = peaks
    .sort((a, b) => b.energy - a.energy)
    .map((p) => p.timeSec);

  return {
    sampleRate: 16000,
    channels: 1,
    totalDurationAnalyzed: plan.analyzedDuration,
    truncatedByLimit: plan.truncatedByLimit,
    hasAudioTrack,
    chunks: summaries,
    suggestedPeaksSec,
  };
}

export interface TrimAndRenderOptions {
  sourceBlob: Blob;
  sourceFileName: string;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  applyReframe?: boolean;
  quality?: '1080p' | '720p';
  zoom?: number;
  cropX?: number;
  cropY?: number;
  editor?: ClipEditorSettings;
  stageLabel?: 'Processing clip' | 'Rendering' | 'Exporting';
}

export interface RenderedVideoResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
  formatLabel: 'MP4 Video' | 'WebM Video';
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: string;
}

/**
 * Real video trimming and MP4 rendering via FFmpeg.wasm inside its Web Worker.
 * Emits real FFmpeg progress percentages (never simulated timers).
 */
export async function trimAndRenderClipWithFfmpeg(
  options: TrimAndRenderOptions,
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<RenderedVideoResult> {
  const tsCheck = validateTrimTimestamps(
    options.startTime,
    options.endTime,
    Math.max(options.endTime, 1),
    0.5
  );
  if (!tsCheck.valid) {
    throw new Error(tsCheck.error || 'Invalid timestamps provided for trimming.');
  }

  const perfMemory = (
    performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
  ).memory;
  const memBudget = checkBrowserMemoryBudget(options.sourceBlob.size, perfMemory ?? null);
  if (!memBudget.ok) {
    throw new Error(memBudget.error);
  }

  const ffmpeg = await getLoadedFfmpeg(signal, onStatus);
  const ext = options.sourceFileName.toLowerCase().endsWith('.webm')
    ? 'webm'
    : options.sourceFileName.toLowerCase().endsWith('.mov')
      ? 'mov'
      : 'mp4';

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const inputName = `trim_in_${runId}.${ext}`;
  const outputName = `trim_out_${runId}.mp4`;

  const duration = Math.max(0.5, Math.round((options.endTime - options.startTime) * 100) / 100);
  const activeStage = options.stageLabel ?? 'Processing clip';

  onStatus?.({
    stage: activeStage,
    progress: 0,
    detail: `Loading source media into FFmpeg worker (${options.startTime.toFixed(1)}s – ${options.endTime.toFixed(1)}s)...`,
  });

  const handleProgress = ({ progress }: { progress: number; time: number }) => {
    const pct = Math.max(0, Math.min(99, Math.round((Number.isFinite(progress) ? progress : 0) * 100)));
    onStatus?.({
      stage: pct > 35 ? 'Rendering' : activeStage,
      progress: pct,
      detail: `Encoding MP4 segment (${pct}%)...`,
    });
  };

  ffmpeg.on('progress', handleProgress);

  try {
    const inputBytes = await fetchFile(options.sourceBlob);
    if (signal?.aborted) {
      throw new DOMException('Trim cancelled', 'AbortError');
    }

    await ffmpeg.writeFile(inputName, inputBytes, { signal });

    const args = buildFfmpegTrimArgs({
      inputName,
      outputName,
      startTime: options.startTime,
      endTime: options.endTime,
      aspectRatio: options.aspectRatio,
      applyReframe: options.applyReframe ?? false,
      quality: options.quality ?? '720p',
      zoom: options.zoom ?? 100,
      cropX: options.cropX ?? 0,
      cropY: options.cropY ?? 0,
    });

    onStatus?.({
      stage: 'Rendering',
      progress: 5,
      detail: `Trimming & rendering real MP4 (${duration.toFixed(1)}s)...`,
    });

    let exitCode = await ffmpeg.exec(args, undefined, { signal });

    // If audio track is missing or AAC encoding failed on silent source, retry video-only H.264 MP4
    if (exitCode !== 0) {
      const videoOnlyArgs = args.filter((a) => a !== '-c:a' && a !== 'aac' && a !== '-b:a' && a !== '128k');
      const idx = videoOnlyArgs.indexOf('-movflags');
      if (idx >= 0) videoOnlyArgs.splice(idx, 0, '-an');
      exitCode = await ffmpeg.exec(videoOnlyArgs, undefined, { signal });
    }

    if (exitCode !== 0) {
      throw new Error('Unsupported codec or FFmpeg render error while encoding MP4.');
    }

    onStatus?.({
      stage: 'Exporting',
      progress: 98,
      detail: 'Reading rendered MP4 buffer from worker...',
    });

    const outData = await ffmpeg.readFile(outputName, undefined, { signal });
    const bytes =
      outData instanceof Uint8Array
        ? outData
        : new TextEncoder().encode(String(outData));

    if (bytes.byteLength < 256) {
      throw new Error('Rendered MP4 output was empty. Check that start/end times fall within video duration.');
    }

    const blob = new Blob([bytes.slice()], { type: 'video/mp4' });
    const resolution =
      options.applyReframe
        ? options.aspectRatio === '9:16'
          ? options.quality === '720p'
            ? '404x720'
            : '608x1080'
          : options.aspectRatio === '1:1'
            ? '720x720'
            : '1280x720'
        : 'Source Resolution';

    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail: `Rendered real MP4 clip (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`,
    });

    return {
      blob,
      mimeType: 'video/mp4',
      extension: 'mp4',
      formatLabel: 'MP4 Video',
      fileSizeBytes: blob.size,
      durationSeconds: duration,
      resolution,
    };
  } catch (err) {
    const classified = classifyProcessingError(err);
    if (classified.kind === 'cancelled' || classified.kind === 'memory') {
      terminateFfmpegWorker();
    }
    throw err;
  } finally {
    ffmpeg.off('progress', handleProgress);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

/**
 * Real Canvas + MediaRecorder fallback engine for browsers/codecs where FFmpeg.wasm
 * MP4 encoding fails or runs out of memory. Produces a genuine playable WebM/MP4 Blob.
 */
export async function recordClipWithMediaRecorder(
  options: TrimAndRenderOptions,
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<RenderedVideoResult> {
  const caps = detectBrowserMediaCapabilities();
  if (!caps.mediaRecorder || !caps.mediaRecorderMimeType) {
    throw new Error('MediaRecorder video export is not supported in this browser.');
  }

  const mimeType = caps.mediaRecorderMimeType;
  const isMp4 = mimeType.includes('mp4');
  const duration = Math.max(1, options.endTime - options.startTime);

  const srcUrl = URL.createObjectURL(options.sourceBlob);
  const video = document.createElement('video');
  video.src = srcUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    onStatus?.({
      stage: 'Processing clip',
      progress: 0,
      detail: 'Preparing browser MediaRecorder fallback stream...',
    });

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode source video in MediaRecorder fallback.'));
      video.load();
    });

    const outW = options.aspectRatio === '9:16' ? 406 : options.aspectRatio === '1:1' ? 640 : 854;
    const outH = options.aspectRatio === '9:16' ? 720 : options.aspectRatio === '1:1' ? 640 : 480;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const stoppedPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(new Error('MediaRecorder encoding failed.'));
    });

    video.currentTime = options.startTime;
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
    });

    recorder.start(200);
    await video.play();

    await new Promise<void>((resolve, reject) => {
      let rafId = 0;
      const onAbort = () => {
        cancelAnimationFrame(rafId);
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        reject(new DOMException('Export cancelled', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const drawFrame = () => {
        if (signal?.aborted) return;
        const elapsed = Math.max(0, video.currentTime - options.startTime);
        const pct = Math.min(99, Math.round((elapsed / duration) * 100));
        onStatus?.({
          stage: 'Rendering',
          progress: pct,
          detail: `Capturing real browser video fallback (${pct}%)...`,
        });

        if (options.editor) {
          renderClipFrameToCanvas({
            ctx,
            source: video,
            sourceWidth: video.videoWidth || outW,
            sourceHeight: video.videoHeight || outH,
            outputWidth: outW,
            outputHeight: outH,
            editor: options.editor,
            relTimeSec: elapsed,
            clipDurationSec: duration,
          });
        } else {
          const zoomFactor = (options.zoom ?? 100) / 100;
          const scale = Math.max(outW / video.videoWidth, outH / video.videoHeight) * zoomFactor;
          const drawW = video.videoWidth * scale;
          const drawH = video.videoHeight * scale;
          const offsetX = (outW - drawW) / 2 + ((options.cropX ?? 0) / 100) * outW;
          const offsetY = (outH - drawH) / 2 + ((options.cropY ?? 0) / 100) * outH;
          ctx.fillStyle = '#09090B';
          ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
        }

        if (video.currentTime >= options.endTime || video.ended) {
          signal?.removeEventListener('abort', onAbort);
          video.pause();
          recorder.stop();
          resolve();
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      rafId = requestAnimationFrame(drawFrame);
    });

    onStatus?.({
      stage: 'Exporting',
      progress: 99,
      detail: 'Finalizing MediaRecorder video file...',
    });

    const blob = await stoppedPromise;
    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail: `Rendered fallback ${isMp4 ? 'MP4' : 'WebM'} clip (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`,
    });

    return {
      blob,
      mimeType,
      extension: isMp4 ? 'mp4' : 'webm',
      formatLabel: isMp4 ? 'MP4 Video' : 'WebM Video',
      fileSizeBytes: blob.size,
      durationSeconds: Math.round(duration * 100) / 100,
      resolution: `${outW}x${outH}`,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(srcUrl);
  }
}

export function triggerRealBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Extracts a compact 16kHz mono WAV Blob for a specific clip segment [startTime, endTime]
 * so Gemini can transcribe word-level synced captions and comedic beats for that exact clip.
 */
export async function extractClipAudioWavWithFfmpeg(
  sourceBlob: Blob,
  sourceFileName: string,
  startTime: number,
  endTime: number,
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const ffmpeg = await getLoadedFfmpeg(signal, onStatus);
  const ext = sourceFileName.toLowerCase().endsWith('.webm')
    ? 'webm'
    : sourceFileName.toLowerCase().endsWith('.mov')
      ? 'mov'
      : 'mp4';

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const inputName = `cap_src_${runId}.${ext}`;
  const outWav = `cap_aud_${runId}.wav`;
  const duration = Math.max(0.8, Math.round((endTime - startTime) * 100) / 100);

  onStatus?.({
    stage: 'Preparing audio',
    progress: 15,
    detail: `Extracting clip audio track (${duration.toFixed(1)}s) for Gemini caption sync...`,
  });

  const inputBytes = await fetchFile(sourceBlob);
  if (signal?.aborted) throw new DOMException('Cancelled audio extraction', 'AbortError');
  await ffmpeg.writeFile(inputName, inputBytes, { signal });

  try {
    const args = buildFfmpegAudioChunkArgs({
      inputName,
      outputName: outWav,
      startSec: Math.max(0, startTime),
      durationSec: duration,
    });
    const exitCode = await ffmpeg.exec(args, undefined, { signal });
    if (exitCode !== 0) {
      throw new Error('This video clip has no decodable audio track for automatic captions.');
    }

    const raw = await ffmpeg.readFile(outWav, undefined, { signal });
    const bytes =
      raw instanceof Uint8Array ? raw : new TextEncoder().encode(String(raw));
    if (bytes.byteLength <= 44) {
      throw new Error('Extracted clip audio was empty. Verify the clip contains spoken audio.');
    }

    return new Blob([bytes.slice()], { type: 'audio/wav' });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outWav).catch(() => {});
  }
}

function getBurnInDimensions(aspectRatio: AspectRatio): { outW: number; outH: number } {
  // Even dimensions required by libx264 yuv420p
  if (aspectRatio === '9:16') return { outW: 406, outH: 720 };
  if (aspectRatio === '1:1') return { outW: 640, outH: 640 };
  return { outW: 854, outH: 480 };
}

async function seekVideoExact(video: HTMLVideoElement, targetSec: number): Promise<void> {
  const clamped = Math.max(0, Math.min(Math.max(0, (video.duration || targetSec) - 0.04), targetSec));
  if (Math.abs(video.currentTime - clamped) < 0.015 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }, 1200);
    const onSeeked = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    try {
      video.currentTime = clamped;
    } catch {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }
  });
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.86): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode composited video frame.'));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Renders a genuine playable H.264 + AAC MP4 clip with:
 * - Burned-in synced captions (all 10 templates, custom fonts incl. Hindi/Hinglish, outlines, shadows)
 * - Video formatting (Center, Smart, Background Blur, Face-Centered, Manual Crop)
 * - Accepted funny reaction effects (zoom, freeze frame, slow motion, pause, meme text, emoji, mixed SFX)
 * - Original clip audio retained cleanly and synchronized with speech.
 */
export async function renderBurnedInClipWithFfmpeg(
  options: TrimAndRenderOptions & { editor: ClipEditorSettings },
  onStatus?: (status: ProcessingStatus) => void,
  signal?: AbortSignal
): Promise<RenderedVideoResult> {
  const tsCheck = validateTrimTimestamps(
    options.startTime,
    options.endTime,
    Math.max(options.endTime, 1),
    0.5
  );
  if (!tsCheck.valid) {
    throw new Error(tsCheck.error || 'Invalid timestamps provided for rendering.');
  }

  const perfMemory = (
    performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
  ).memory;
  const memBudget = checkBrowserMemoryBudget(options.sourceBlob.size, perfMemory ?? null);
  if (!memBudget.ok) {
    throw new Error(memBudget.error);
  }

  const ffmpeg = await getLoadedFfmpeg(signal, onStatus);
  const duration = Math.max(0.5, Math.round((options.endTime - options.startTime) * 100) / 100);
  const { outW, outH } = getBurnInDimensions(options.editor.aspectRatio);
  const fps = duration <= 20 ? 15 : 12;
  const totalFrames = Math.max(fps, Math.round(duration * fps));

  const ext = options.sourceFileName.toLowerCase().endsWith('.webm')
    ? 'webm'
    : options.sourceFileName.toLowerCase().endsWith('.mov')
      ? 'mov'
      : 'mp4';

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const inputVideoName = `burn_src_${runId}.${ext}`;
  const sfxWavName = `burn_sfx_${runId}.wav`;
  const outputMp4Name = `burn_out_${runId}.mp4`;
  const framePrefix = `bf_${runId}_`;

  const srcUrl = URL.createObjectURL(options.sourceBlob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const writtenFrames: string[] = [];
  let wroteInputVideo = false;
  let wroteSfxWav = false;

  try {
    onStatus?.({
      stage: 'Loading video',
      progress: 2,
      detail: `Preparing ${outW}x${outH} burn-in renderer (${totalFrames} frames @ ${fps} fps)...`,
    });

    // Wait for fonts so custom fonts & Devanagari render cleanly onto Canvas
    if (document.fonts && typeof document.fonts.ready !== 'undefined') {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Export cancelled', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });
      video.onloadedmetadata = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      video.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Could not decode source video frames for burned-in caption export.'));
      };
      video.src = srcUrl;
      video.load();
    });

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for burned-in export.');

    const acceptedEffects = (options.editor.reactionEffects ?? []).filter((e) => e.status === 'accepted');

    // Step 1: Render every timeline frame with captions, formatting, and reaction effects burned in
    for (let f = 0; f < totalFrames; f += 1) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      const relTimeSec = f / fps;
      const reactionState = evaluateReactionEffectsAtTime(acceptedEffects, relTimeSec, duration);
      const targetSourceSec = options.startTime + reactionState.sourceTimeSec;

      await seekVideoExact(video, targetSourceSec);

      renderClipFrameToCanvas({
        ctx,
        source: video,
        sourceWidth: video.videoWidth || outW,
        sourceHeight: video.videoHeight || outH,
        outputWidth: outW,
        outputHeight: outH,
        editor: options.editor,
        relTimeSec,
        clipDurationSec: duration,
      });

      const jpegBytes = await canvasToJpegBytes(canvas, 0.86);
      const frameFile = `${framePrefix}${String(f + 1).padStart(5, '0')}.jpg`;
      await ffmpeg.writeFile(frameFile, jpegBytes, { signal });
      writtenFrames.push(frameFile);

      if (f % 3 === 0 || f === totalFrames - 1) {
        const pct = Math.min(72, Math.max(4, Math.round(((f + 1) / totalFrames) * 70)));
        onStatus?.({
          stage: 'Rendering',
          progress: pct,
          detail: `Burning captions & effects into frame ${f + 1} of ${totalFrames} (${pct}%)...`,
        });
      }
    }

    // Step 2: Load original source video into FFmpeg FS to retain synchronized original audio
    onStatus?.({
      stage: 'Exporting',
      progress: 76,
      detail: 'Muxing H.264 video with original synchronized audio track...',
    });

    const sourceBytes = await fetchFile(options.sourceBlob);
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
    await ffmpeg.writeFile(inputVideoName, sourceBytes, { signal });
    wroteInputVideo = true;

    // Optional SFX mix WAV if intro SFX or accepted reaction SFX are active
    const sfxWavBytes = buildClipSfxMixWav({
      clipDurationSeconds: duration,
      introSoundEffect: options.editor.soundEffect,
      sfxVolumePercent: options.editor.sfxVolume,
      reactionEffects: acceptedEffects,
    });
    if (sfxWavBytes) {
      await ffmpeg.writeFile(sfxWavName, sfxWavBytes, { signal });
      wroteSfxWav = true;
    }

    const startArg = Math.max(0, options.startTime).toFixed(3);
    const durArg = duration.toFixed(3);
    let exitCode = -1;

    // Attempt A: Burned-in H.264 video + Original Audio mixed with SFX WAV (when SFX active)
    if (wroteSfxWav) {
      const mixArgs = [
        '-framerate',
        String(fps),
        '-i',
        `${framePrefix}%05d.jpg`,
        '-ss',
        startArg,
        '-t',
        durArg,
        '-i',
        inputVideoName,
        '-i',
        sfxWavName,
        '-filter_complex',
        '[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0[aout]',
        '-map',
        '0:v:0',
        '-map',
        '[aout]',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        '-y',
        outputMp4Name,
      ];
      exitCode = await ffmpeg.exec(mixArgs, undefined, { signal });
    }

    // Attempt B: Burned-in H.264 video + Original Audio directly (no SFX or if source had no audio for amix)
    if (exitCode !== 0) {
      const directAudioArgs = [
        '-framerate',
        String(fps),
        '-i',
        `${framePrefix}%05d.jpg`,
        '-ss',
        startArg,
        '-t',
        durArg,
        '-i',
        inputVideoName,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        '-y',
        outputMp4Name,
      ];
      exitCode = await ffmpeg.exec(directAudioArgs, undefined, { signal });
    }

    // Attempt C: Silent video fallback (if source had no audio stream at all)
    if (exitCode !== 0) {
      const videoOnlyArgs = [
        '-framerate',
        String(fps),
        '-i',
        `${framePrefix}%05d.jpg`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        '-y',
        outputMp4Name,
      ];
      exitCode = await ffmpeg.exec(videoOnlyArgs, undefined, { signal });
    }

    if (exitCode !== 0) {
      throw new Error('FFmpeg could not encode the burned-in MP4 video stream.');
    }

    onStatus?.({
      stage: 'Exporting',
      progress: 96,
      detail: 'Reading final burned-in MP4 buffer...',
    });

    const outData = await ffmpeg.readFile(outputMp4Name, undefined, { signal });
    const bytes =
      outData instanceof Uint8Array ? outData : new TextEncoder().encode(String(outData));
    if (bytes.byteLength < 512) {
      throw new Error('Burned-in MP4 output was empty.');
    }

    const blob = new Blob([bytes.slice()], { type: 'video/mp4' });
    onStatus?.({
      stage: 'Completed',
      progress: 100,
      detail: `Exported burned-in MP4 (${outW}x${outH}, ${(blob.size / (1024 * 1024)).toFixed(2)} MB) with captions & audio.`,
    });

    return {
      blob,
      mimeType: 'video/mp4',
      extension: 'mp4',
      formatLabel: 'MP4 Video',
      fileSizeBytes: blob.size,
      durationSeconds: duration,
      resolution: `${outW}x${outH}`,
    };
  } catch (err) {
    const classified = classifyProcessingError(err);
    if (classified.kind === 'cancelled' || classified.kind === 'memory') {
      terminateFfmpegWorker();
    }
    throw err;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(srcUrl);

    for (const fName of writtenFrames) {
      await ffmpeg.deleteFile(fName).catch(() => {});
    }
    if (wroteInputVideo) {
      await ffmpeg.deleteFile(inputVideoName).catch(() => {});
    }
    if (wroteSfxWav) {
      await ffmpeg.deleteFile(sfxWavName).catch(() => {});
    }
    await ffmpeg.deleteFile(outputMp4Name).catch(() => {});
  }
}

