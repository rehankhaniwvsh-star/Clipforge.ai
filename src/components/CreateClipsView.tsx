import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AudioWaveform,
  Check,
  CheckCircle2,
  Film,
  Info,
  Link2,
  Loader2,
  Play,
  Scissors,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  AiAudioAnalysisResponse,
  AspectRatio,
  ClipCategory,
  ClipCountOption,
  ClipDurationOption,
  ClipGenerationConfig,
  ProcessingStatus,
  UploadedVideoInfo,
} from '../types/clipforge';
import {
  ASPECT_RATIOS,
  CLIP_CATEGORIES,
  CLIP_COUNTS,
  CLIP_DURATIONS,
} from '../data/templates';
import { estimateCreditCostMinutes, validateVideoUrl } from '../utils/clipGenerator';
import { formatDurationLabel, formatFileSize, formatTimecode } from '../utils/timecode';
import {
  inspectAndIngestVideoFile,
  prepareAudioChunksFromVideo,
  terminateFfmpegWorker,
} from '../utils/videoEngine';
import { classifyProcessingError, validateTrimTimestamps } from '../utils/videoEngineLogic';
import {
  requestGeminiAudioAnalysis,
  requestGeminiYouTubeAnalysis,
} from '../utils/aiAnalysisClient';
import { clampYouTubeAnalysisWindow } from '../utils/urlImport';
import { objectUrlManager } from '../utils/objectUrlManager';
import { ProcessingStatusBanner } from './ProcessingStatusBanner';

interface CreateClipsViewProps {
  defaultAspectRatio: AspectRatio;
  availableCreditsMinutes: number;
  maxUploadSizeMB: number;
  onGenerateClips: (
    video: UploadedVideoInfo,
    projectName: string,
    config: ClipGenerationConfig,
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal,
    useFallback?: boolean
  ) => Promise<void>;
}

const PREVIEW_VIDEO_URL_KEY = 'create-clips-source-video';
const PREVIEW_THUMB_URL_KEY = 'create-clips-source-thumb';

export function CreateClipsView({
  defaultAspectRatio,
  availableCreditsMinutes,
  maxUploadSizeMB,
  onGenerateClips,
}: CreateClipsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideoInfo | null>(null);
  const [projectName, setProjectName] = useState('');
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: null,
    detail: '',
  });
  const [activeOperation, setActiveOperation] = useState<'none' | 'upload' | 'audio' | 'ai' | 'generate'>('none');
  const [selectedAiClipIndices, setSelectedAiClipIndices] = useState<number[]>([]);

  const [urlInput, setUrlInput] = useState('');
  const [urlFeedback, setUrlFeedback] = useState<{
    tone: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  const [category, setCategory] = useState<ClipCategory>('Funny Moments');
  const [duration, setDuration] = useState<ClipDurationOption>(30);
  const [clipCount, setClipCount] = useState<ClipCountOption>(3);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(defaultAspectRatio);

  const [useCustomTrim, setUseCustomTrim] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15);

  const [ytWindowStartMin, setYtWindowStartMin] = useState(0);
  const [ytWindowEndMin, setYtWindowEndMin] = useState(10);
  const [ytPreviewStartSec, setYtPreviewStartSec] = useState<number>(0);
  const [ytPreviewAutoplay, setYtPreviewAutoplay] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const syncTrimBoundsForDuration = (totalDuration: number) => {
    const safeEnd = Math.min(totalDuration, Math.max(3, Math.min(15, Math.floor(totalDuration))));
    setTrimStart(0);
    setTrimEnd(Math.round(safeEnd * 10) / 10);
  };

  const handleCancelOperation = () => {
    abortControllerRef.current?.abort();
    if (activeOperation === 'audio' || activeOperation === 'generate') {
      terminateFfmpegWorker();
    }
    setActiveOperation('none');
    setStatus({
      stage: 'Failed',
      progress: null,
      detail: 'Operation cancelled.',
      error: 'Processing cancelled by user. Temporary resources were released.',
    });
  };

  const loadLocalFile = async (file: File) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setUploadWarning(null);
    setUrlFeedback(null);
    setActiveOperation('upload');

    try {
      const result = await inspectAndIngestVideoFile(
        file,
        maxUploadSizeMB,
        setStatus,
        controller.signal
      );

      if (controller.signal.aborted) return;

      const videoUrl = objectUrlManager.create(PREVIEW_VIDEO_URL_KEY, result.fileBlob);
      const thumbUrl = objectUrlManager.create(PREVIEW_THUMB_URL_KEY, result.thumbnailBlob);
      const cleanName = result.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');

      if (result.warning) setUploadWarning(result.warning);

      setUploadedVideo({
        fileName: result.fileName,
        fileSizeBytes: result.fileSizeBytes,
        durationSeconds: result.durationSeconds,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        objectUrl: videoUrl,
        sourceType: 'local-upload',
        thumbnailUrl: thumbUrl,
        fileBlob: result.fileBlob,
        thumbnailBlob: result.thumbnailBlob,
      });
      setProjectName(cleanName || 'Uploaded Video Project');
      syncTrimBoundsForDuration(result.durationSeconds);

      setStatus({
        stage: 'Completed',
        progress: 100,
        detail: `Loaded ${result.fileName} (${result.width}×${result.height}, ${formatDurationLabel(result.durationSeconds)}) with real canvas thumbnail.`,
      });
    } catch (err) {
      const classified = classifyProcessingError(err);
      setStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
        fallbackAvailable: false,
      });
    } finally {
      setActiveOperation('none');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void loadLocalFile(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void loadLocalFile(file);
    }
  };

  const runAudioAndGeminiAnalysis = async (
    targetVideo: UploadedVideoInfo,
    controller: AbortController
  ): Promise<{
    audioPrep?: UploadedVideoInfo['audioPrep'];
    aiAnalysis: AiAudioAnalysisResponse;
  }> => {
    if (targetVideo.sourceType === 'youtube' && targetVideo.youtubeVideoId) {
      const window = clampYouTubeAnalysisWindow(
        targetVideo.durationSeconds,
        Math.round(ytWindowStartMin * 60),
        Math.round(ytWindowEndMin * 60)
      );

      const aiAnalysis = await requestGeminiYouTubeAnalysis(
        {
          videoId: targetVideo.youtubeVideoId,
          title: projectName.trim() || targetVideo.fileName,
          durationSeconds: targetVideo.durationSeconds,
          contentMode: category,
          targetDurationSeconds: duration,
          clipCount,
          windowStartSec: window.startSec,
          windowEndSec: window.endSec,
        },
        setStatus,
        controller.signal
      );

      if (controller.signal.aborted) {
        throw new DOMException('AI analysis cancelled', 'AbortError');
      }

      setUploadedVideo((prev) => (prev ? { ...prev, aiAnalysis } : prev));
      setSelectedAiClipIndices(aiAnalysis.clips.map((_, idx) => idx));
      return { aiAnalysis };
    }

    let audioPrep = targetVideo.audioPrep;
    if (!audioPrep) {
      const storagePrefix = `prep-${Date.now()}`;
      audioPrep = await prepareAudioChunksFromVideo(
        targetVideo.fileBlob!,
        targetVideo.fileName,
        targetVideo.durationSeconds,
        storagePrefix,
        setStatus,
        controller.signal
      );
      if (controller.signal.aborted) {
        throw new DOMException('AI analysis cancelled', 'AbortError');
      }
      setUploadedVideo((prev) => (prev ? { ...prev, audioPrep } : prev));
    }

    const aiAnalysis = await requestGeminiAudioAnalysis(
      {
        fileName: targetVideo.fileName,
        videoDurationSeconds: targetVideo.durationSeconds,
        contentMode: category,
        targetDurationSeconds: duration,
        clipCount,
        audioPrep,
      },
      setStatus,
      controller.signal
    );

    if (controller.signal.aborted) {
      throw new DOMException('AI analysis cancelled', 'AbortError');
    }

    setUploadedVideo((prev) => (prev ? { ...prev, audioPrep, aiAnalysis } : prev));
    setSelectedAiClipIndices(aiAnalysis.clips.map((_, idx) => idx));
    return { audioPrep, aiAnalysis };
  };

  const handlePrepareAudio = async () => {
    if (!uploadedVideo?.fileBlob) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveOperation('audio');

    try {
      const storagePrefix = `prep-${Date.now()}`;
      const audioPrep = await prepareAudioChunksFromVideo(
        uploadedVideo.fileBlob,
        uploadedVideo.fileName,
        uploadedVideo.durationSeconds,
        storagePrefix,
        setStatus,
        controller.signal
      );

      if (controller.signal.aborted) return;

      setUploadedVideo((prev) => (prev ? { ...prev, audioPrep } : prev));
    } catch (err) {
      const classified = classifyProcessingError(err);
      setStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
        fallbackAvailable: false,
      });
    } finally {
      setActiveOperation('none');
    }
  };

  const handleAnalyzeWithGemini = async () => {
    if (!uploadedVideo) return;
    if (uploadedVideo.sourceType !== 'youtube' && !uploadedVideo.fileBlob) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveOperation('ai');

    try {
      await runAudioAndGeminiAnalysis(uploadedVideo, controller);
    } catch (err) {
      const msg = err instanceof Error ? err.message : classifyProcessingError(err).message;
      setStatus({
        stage: 'Failed',
        progress: null,
        detail: msg,
        error: msg,
        fallbackAvailable: false,
      });
    } finally {
      setActiveOperation('none');
    }
  };

  const toggleAiClipSelection = (index: number) => {
    setSelectedAiClipIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  };

  const handleJumpSourceToTimestamp = (sec: number) => {
    if (uploadedVideo?.sourceType === 'youtube') {
      setYtPreviewStartSec(Math.max(0, Math.floor(sec)));
      setYtPreviewAutoplay(true);
      return;
    }
    const el = sourceVideoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(uploadedVideo?.durationSeconds ?? sec, sec));
    void el.play().catch(() => {});
  };

  const handleUrlImport = async () => {
    const validation = validateVideoUrl(urlInput);
    if (validation.status === 'empty' || validation.status === 'invalid') {
      setUrlFeedback({ tone: 'error', text: validation.message });
      return;
    }

    if (validation.status === 'unsupported-platform') {
      setUrlFeedback({ tone: 'info', text: validation.message });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveOperation('upload');
    setUploadWarning(null);
    setUrlFeedback(null);

    if (validation.status === 'youtube') {
      setStatus({
        stage: 'Loading video',
        progress: null,
        detail: 'Inspecting YouTube video metadata on the server...',
      });

      try {
        const res = await fetch('/api/media/inspect-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ url: urlInput.trim() }),
        });

        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : `Could not import YouTube URL (HTTP ${res.status}).`
          );
        }

        if (controller.signal.aborted) return;

        const durationSec = Math.max(10, Number(data.durationSeconds) || 600);
        const startSec = Number.isFinite(Number(data.startSeconds))
          ? Math.min(durationSec - 10, Math.max(0, Number(data.startSeconds)))
          : 0;
        const win = clampYouTubeAnalysisWindow(durationSec, startSec, startSec + 600);

        const title =
          typeof data.title === 'string' && data.title.trim()
            ? data.title.trim()
            : `YouTube Video (${validation.youtubeVideoId})`;
        const author = typeof data.author === 'string' ? data.author : 'YouTube Creator';
        const thumb = typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : '';
        const canonicalUrl =
          typeof data.canonicalUrl === 'string'
            ? data.canonicalUrl
            : `https://www.youtube.com/watch?v=${validation.youtubeVideoId}`;

        objectUrlManager.revoke(PREVIEW_VIDEO_URL_KEY);
        objectUrlManager.revoke(PREVIEW_THUMB_URL_KEY);

        setUploadedVideo({
          fileName: title,
          fileSizeBytes: 0,
          durationSeconds: durationSec,
          width: Number(data.width) || 1280,
          height: Number(data.height) || 720,
          mimeType: 'video/youtube',
          objectUrl: canonicalUrl,
          sourceType: 'youtube',
          thumbnailUrl: thumb,
          youtubeVideoId: String(data.videoId || validation.youtubeVideoId),
          youtubeUrl: canonicalUrl,
          youtubeChannel: author,
          youtubeIsLiveArchive: Boolean(data.isLiveContent),
          youtubeStartSec: startSec,
        });
        setProjectName(title);
        setSelectedAiClipIndices([]);
        setYtPreviewStartSec(Math.floor(startSec));
        setYtPreviewAutoplay(false);
        setYtWindowStartMin(Math.floor(win.startSec / 60));
        setYtWindowEndMin(Math.max(1, Math.ceil(win.endSec / 60)));
        syncTrimBoundsForDuration(durationSec);
        if (startSec > 0) {
          setTrimStart(startSec);
          setTrimEnd(Math.min(durationSec, startSec + 30));
        }

        setUrlFeedback({
          tone: 'success',
          text: `Imported "${title}" by ${author} (${formatDurationLabel(durationSec)}). Ready for Gemini AI highlight analysis or Exact Trim.`,
        });
        setStatus({
          stage: 'Completed',
          progress: 100,
          detail: `Loaded YouTube video "${title}" (${formatDurationLabel(durationSec)}) — ready for Gemini AI analysis.`,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : 'Failed to inspect YouTube video URL.';
        setUrlFeedback({ tone: 'error', text: msg });
        setStatus({
          stage: 'Failed',
          progress: null,
          detail: msg,
          error: msg,
          fallbackAvailable: false,
        });
      } finally {
        setActiveOperation('none');
      }
      return;
    }

    // Direct media file URL (.mp4 / .webm / .mov) with automatic server-side CORS proxy fallback
    setStatus({
      stage: 'Loading video',
      progress: null,
      detail: 'Downloading direct media stream for browser processing...',
    });

    try {
      const targetUrl = urlInput.trim();
      let response: Response;
      try {
        response = await fetch(targetUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (directErr) {
        if (controller.signal.aborted) throw directErr;
        setStatus({
          stage: 'Loading video',
          progress: null,
          detail: 'Direct browser download blocked by remote CORS — fetching via ClipForge media proxy...',
        });
        const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(targetUrl)}&maxMb=${encodeURIComponent(String(maxUploadSizeMB))}`;
        response = await fetch(proxyUrl, { signal: controller.signal });
        if (!response.ok) {
          let proxyError = `HTTP ${response.status} while downloading remote video.`;
          try {
            const errJson = (await response.json()) as Record<string, unknown>;
            if (typeof errJson.error === 'string' && errJson.error.trim()) {
              proxyError = errJson.error.trim();
            }
          } catch {
            // keep default error
          }
          throw new Error(proxyError);
        }
      }

      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const bytes = Number(contentLengthHeader);
        const maxBytes = Math.max(10, maxUploadSizeMB) * 1024 * 1024;
        if (Number.isFinite(bytes) && bytes > maxBytes) {
          throw new Error(
            `Remote file size (${formatFileSize(bytes)}) exceeds your configured upload limit of ${maxUploadSizeMB} MB.`
          );
        }
      }
      const blob = await response.blob();
      const fileName = targetUrl.split('/').pop()?.split('?')[0] || 'remote-media.mp4';
      const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });
      await loadLocalFile(file);
      setUrlFeedback({
        tone: 'success',
        text: 'Direct media file loaded and verified for local trimming.',
      });
    } catch (err) {
      setActiveOperation('none');
      const classified = classifyProcessingError(err);
      const msg =
        err instanceof Error
          ? err.message
          : classified.message;
      setUrlFeedback({ tone: 'error', text: msg });
      setStatus({
        stage: 'Failed',
        progress: null,
        detail: msg,
        error: msg,
        fallbackAvailable: false,
      });
    }
  };

  const handleClearVideo = () => {
    abortControllerRef.current?.abort();
    objectUrlManager.revoke(PREVIEW_VIDEO_URL_KEY);
    objectUrlManager.revoke(PREVIEW_THUMB_URL_KEY);
    setUploadedVideo(null);
    setSelectedAiClipIndices([]);
    setProjectName('');
    setUploadWarning(null);
    setStatus({ stage: 'idle', progress: null, detail: '' });
    setActiveOperation('none');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const trimValidation = uploadedVideo
    ? validateTrimTimestamps(trimStart, trimEnd, uploadedVideo.durationSeconds, 1)
    : null;

  const handleTrimDurationInput = (nextDurationSec: number) => {
    if (!uploadedVideo) return;
    if (!Number.isFinite(nextDurationSec)) return;
    setTrimEnd(Math.round((trimStart + nextDurationSec) * 10) / 10);
  };

  const estimatedCredits = uploadedVideo
    ? estimateCreditCostMinutes(uploadedVideo.durationSeconds, useCustomTrim ? 1 : clipCount)
    : 0;

  const handleGenerate = async (useFallback = false) => {
    if (!uploadedVideo || (uploadedVideo.sourceType !== 'youtube' && !uploadedVideo.fileBlob)) {
      if (urlInput.trim()) {
        await handleUrlImport();
        return;
      }
      fileInputRef.current?.click();
      return;
    }

    if (useCustomTrim) {
      const check = validateTrimTimestamps(trimStart, trimEnd, uploadedVideo.durationSeconds, 1);
      if (!check.valid) {
        setStatus({
          stage: 'Failed',
          progress: null,
          detail: check.error || 'Invalid timestamps.',
          error: check.error || 'Invalid timestamps.',
          fallbackAvailable: false,
        });
        return;
      }
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setActiveOperation('generate');

    try {
      let workingVideo = uploadedVideo;
      let aiSelectedClips = uploadedVideo.aiAnalysis?.clips.filter((_, idx) =>
        selectedAiClipIndices.includes(idx)
      );

      if (!useCustomTrim) {
        if (!workingVideo.aiAnalysis || workingVideo.aiAnalysis.status !== 'ok') {
          const analysisOut = await runAudioAndGeminiAnalysis(workingVideo, controller);
          workingVideo = {
            ...workingVideo,
            audioPrep: analysisOut.audioPrep,
            aiAnalysis: analysisOut.aiAnalysis,
          };

          if (analysisOut.aiAnalysis.status !== 'ok' || analysisOut.aiAnalysis.clips.length === 0) {
            const reason =
              analysisOut.aiAnalysis.insufficiencyReason ||
              'Insufficient speech or timestamp data to generate AI clips automatically. Switch to Exact Trim mode to cut timestamps manually.';
            setStatus({
              stage: 'Failed',
              progress: null,
              detail: reason,
              error: reason,
              fallbackAvailable: false,
            });
            return;
          }

          aiSelectedClips = analysisOut.aiAnalysis.clips;
        } else if (!aiSelectedClips || aiSelectedClips.length === 0) {
          setStatus({
            stage: 'Failed',
            progress: null,
            detail: 'Select at least one Gemini AI suggested clip to render.',
            error: 'Select at least one Gemini AI suggested clip before clicking Generate Clips.',
            fallbackAvailable: false,
          });
          return;
        }
      }

      await onGenerateClips(
        workingVideo,
        projectName.trim() || workingVideo.fileName,
        {
          category,
          duration,
          count: clipCount,
          aspectRatio,
          customTrim: useCustomTrim
            ? {
                enabled: true,
                startTime: trimStart,
                endTime: trimEnd,
              }
            : undefined,
          aiSelectedClips: useCustomTrim ? undefined : aiSelectedClips,
        },
        setStatus,
        controller.signal,
        useFallback
      );
    } catch (err) {
      const classified = classifyProcessingError(err);
      setStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
        fallbackAvailable: classified.suggestFallback && !useFallback,
      });
    } finally {
      setActiveOperation('none');
    }
  };

  const isBusy = activeOperation !== 'none';
  const currentTrimDuration = Math.round((trimEnd - trimStart) * 10) / 10;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="pb-5 border-b border-[#E5E5E5]">
        <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
          Create Clips
        </h1>
        <p className="text-sm text-[#737373] mt-1">
          Upload a long video, configure AI clip detection or exact trim bounds, and render real
          playable MP4 clips in your browser.
        </p>
      </div>

      <ProcessingStatusBanner
        status={status}
        onCancel={isBusy ? handleCancelOperation : undefined}
        onRunFallback={
          status.fallbackAvailable && uploadedVideo?.fileBlob
            ? () => void handleGenerate(true)
            : undefined
        }
        fallbackLabel="Render with WebM Browser Fallback"
        onDismiss={() => setStatus({ stage: 'idle', progress: null, detail: '' })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Upload Card + Preview + Metadata + Audio/Gemini AI */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#171717]">
                1. Start with a video
              </h2>
              <span className="text-xs font-mono tabular-nums text-[#737373]">
                Up to {maxUploadSizeMB} MB · MP4 / WebM / MOV
              </span>
            </div>

            {!uploadedVideo ? (
              <div
                onClick={() => {
                  if (!isBusy) fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${
                  isBusy ? 'cursor-wait' : 'cursor-pointer'
                } ${
                  isDragging
                    ? 'border-[#DC2626] bg-[#FEF2F2]'
                    : 'border-[#E5E5E5] bg-[#FAFAFA] hover:border-[#D4D4D4] hover:bg-[#F5F5F5]/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="video-upload-input"
                  data-testid="video-file-input"
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  onChange={handleFileChange}
                  disabled={isBusy}
                  className="sr-only"
                />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-4 font-display text-lg font-semibold text-[#171717]">
                  Start with a video
                </p>
                <p className="mt-1 text-sm text-[#737373] max-w-md mx-auto">
                  Upload a long video and let AI find the best moments. Supports MP4, WebM, and
                  browser-decoded MOV up to {maxUploadSizeMB} MB.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shadow-xs"
                  >
                    Browse Files
                  </button>
                  {isBusy && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelOperation();
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#FEF2F2] border border-[#E5E5E5] text-[#DC2626] text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      Cancel Upload
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-[#111111] border border-[#E5E5E5] aspect-video">
                  {uploadedVideo.sourceType === 'youtube' && uploadedVideo.youtubeVideoId ? (
                    <iframe
                      key={`${uploadedVideo.youtubeVideoId}-${ytPreviewStartSec}-${ytPreviewAutoplay}`}
                      src={`https://www.youtube.com/embed/${uploadedVideo.youtubeVideoId}?start=${ytPreviewStartSec}&autoplay=${ytPreviewAutoplay ? 1 : 0}&rel=0&modestbranding=1`}
                      title={uploadedVideo.fileName}
                      data-testid="source-youtube-player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0 bg-black"
                    />
                  ) : (
                    <video
                      ref={sourceVideoRef}
                      src={uploadedVideo.objectUrl}
                      poster={uploadedVideo.thumbnailUrl}
                      controls
                      playsInline
                      data-testid="source-video-player"
                      className="h-full w-full object-contain bg-black"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleClearVideo}
                    disabled={isBusy}
                    aria-label="Remove selected video"
                    className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/75 hover:bg-[#DC2626] text-white transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {uploadWarning && (
                  <div className="flex items-start gap-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 text-xs text-[#B45309]">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#D97706]" />
                    <span>{uploadWarning}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="shrink-0 space-y-1">
                    <span className="block text-[11px] font-medium text-[#737373]">
                      {uploadedVideo.sourceType === 'youtube' ? 'YouTube Thumbnail' : 'Captured Frame'}
                    </span>
                    <img
                      src={uploadedVideo.thumbnailUrl}
                      alt="Extracted video frame thumbnail"
                      referrerPolicy="no-referrer"
                      data-testid="extracted-thumbnail"
                      className="h-16 w-28 rounded-lg object-cover border border-[#E5E5E5] bg-[#171717]"
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label
                      htmlFor="project-name-input"
                      className="block text-xs font-medium text-[#737373] mb-1.5"
                    >
                      Project Name
                    </label>
                    <input
                      id="project-name-input"
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Enter project title"
                      className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2 text-sm text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
                    />
                  </div>
                </div>

                {/* Extracted Real Video Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[#E5E5E5] text-xs">
                  <div>
                    <p className="text-[#737373]">
                      {uploadedVideo.sourceType === 'youtube' ? 'Channel' : 'File Name'}
                    </p>
                    <p
                      className="mt-1 font-medium text-[#171717] truncate"
                      title={
                        uploadedVideo.sourceType === 'youtube'
                          ? uploadedVideo.youtubeChannel || uploadedVideo.fileName
                          : uploadedVideo.fileName
                      }
                    >
                      {uploadedVideo.sourceType === 'youtube'
                        ? uploadedVideo.youtubeChannel || 'YouTube'
                        : uploadedVideo.fileName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#737373]">Duration</p>
                    <p
                      data-testid="extracted-duration"
                      className="mt-1 font-mono font-medium text-[#171717] tabular-nums"
                    >
                      {formatDurationLabel(uploadedVideo.durationSeconds)}
                      {uploadedVideo.durationSeconds < 3600
                        ? ` (${uploadedVideo.durationSeconds.toFixed(0)}s)`
                        : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#737373]">
                      {uploadedVideo.sourceType === 'youtube' ? 'Source' : 'File Size'}
                    </p>
                    <p className="mt-1 font-mono font-medium text-[#171717] tabular-nums">
                      {uploadedVideo.sourceType === 'youtube'
                        ? uploadedVideo.youtubeIsLiveArchive
                          ? 'YouTube Live VOD'
                          : 'YouTube Video'
                        : formatFileSize(uploadedVideo.fileSizeBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#737373]">Resolution</p>
                    <p
                      data-testid="extracted-resolution"
                      className="mt-1 font-mono font-medium text-[#171717] tabular-nums"
                    >
                      {uploadedVideo.width}×{uploadedVideo.height}
                    </p>
                  </div>
                </div>

                {/* Audio Extraction & Gemini AI Analysis Panel */}
                <div className="pt-4 border-t border-[#E5E5E5] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AudioWaveform className="h-4 w-4 text-[#DC2626]" />
                      <span className="text-xs font-semibold text-[#171717]">
                        {uploadedVideo.sourceType === 'youtube'
                          ? 'Gemini AI YouTube Video Analysis'
                          : 'Audio Extraction & Gemini AI Analysis'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {uploadedVideo.sourceType !== 'youtube' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handlePrepareAudio()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#171717] transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {activeOperation === 'audio' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#DC2626]" />
                          ) : (
                            <AudioWaveform className="h-3.5 w-3.5 text-[#737373]" />
                          )}
                          <span>
                            {uploadedVideo.audioPrep ? 'Re-extract Audio Chunks' : 'Prepare Audio Chunks'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        data-testid="analyze-gemini-btn"
                        onClick={() => void handleAnalyzeWithGemini()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-xs font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {activeOperation === 'ai' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {uploadedVideo.aiAnalysis ? 'Re-analyze with Gemini AI' : 'Analyze with Gemini AI'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {uploadedVideo.sourceType === 'youtube' ? (
                    <div className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 space-y-2.5 text-xs">
                      <p className="text-[#525252] leading-relaxed">
                        Gemini AI analyzes this YouTube video directly on our server—no local audio
                        download required. For long streams or VODs, select a time window (up to 20
                        minutes per pass):
                      </p>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <label
                            htmlFor="yt-window-start-min"
                            className="block text-[11px] text-[#737373]"
                          >
                            Window Start (min)
                          </label>
                          <input
                            id="yt-window-start-min"
                            type="number"
                            min={0}
                            max={Math.max(0, Math.floor(uploadedVideo.durationSeconds / 60) - 1)}
                            value={ytWindowStartMin}
                            onChange={(e) => {
                              const nextStart = Math.max(0, Number(e.target.value) || 0);
                              setYtWindowStartMin(nextStart);
                              if (ytWindowEndMin <= nextStart) {
                                setYtWindowEndMin(
                                  Math.min(
                                    Math.ceil(uploadedVideo.durationSeconds / 60),
                                    nextStart + 10
                                  )
                                );
                              }
                            }}
                            className="w-24 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor="yt-window-end-min"
                            className="block text-[11px] text-[#737373]"
                          >
                            Window End (min)
                          </label>
                          <input
                            id="yt-window-end-min"
                            type="number"
                            min={1}
                            max={Math.max(1, Math.ceil(uploadedVideo.durationSeconds / 60))}
                            value={ytWindowEndMin}
                            onChange={(e) => {
                              const nextEnd = Math.max(ytWindowStartMin + 1, Number(e.target.value) || 10);
                              setYtWindowEndMin(Math.min(ytWindowStartMin + 20, nextEnd));
                            }}
                            className="w-24 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                          />
                        </div>
                        {uploadedVideo.durationSeconds > 900 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              { label: '0–10m', s: 0, e: 10 },
                              { label: '15–25m', s: 15, e: 25 },
                              { label: '30–40m', s: 30, e: 40 },
                              { label: '60–70m', s: 60, e: 70 },
                            ]
                              .filter((p) => p.s * 60 < uploadedVideo.durationSeconds)
                              .map((preset) => (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setYtWindowStartMin(preset.s);
                                    setYtWindowEndMin(
                                      Math.min(
                                        Math.ceil(uploadedVideo.durationSeconds / 60),
                                        preset.e
                                      )
                                    );
                                    setYtPreviewStartSec(preset.s * 60);
                                  }}
                                  className={`px-2 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                                    ytWindowStartMin === preset.s && ytWindowEndMin === preset.e
                                      ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626] font-semibold'
                                      : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:bg-[#F5F5F5]'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : uploadedVideo.audioPrep ? (
                    <div
                      data-testid="audio-prep-summary"
                      className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#737373] font-mono tabular-nums">
                        <span className="text-[#16A34A] font-sans font-medium">
                          {uploadedVideo.audioPrep.hasAudioTrack
                            ? 'Audio ready for AI analysis'
                            : 'No audio track in source video'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{uploadedVideo.audioPrep.chunks.length} chunks (30s max)</span>
                        <span aria-hidden="true">·</span>
                        <span>{uploadedVideo.audioPrep.sampleRate} Hz mono</span>
                      </div>
                      {uploadedVideo.audioPrep.suggestedPeaksSec.length > 0 && (
                        <p className="text-[#737373]">
                          Detected audio energy peaks at:{' '}
                          <span className="font-mono tabular-nums text-[#171717]">
                            {uploadedVideo.audioPrep.suggestedPeaksSec
                              .slice(0, 5)
                              .map((s) => formatTimecode(s))
                              .join(', ')}
                          </span>
                        </p>
                      )}
                      {uploadedVideo.audioPrep.truncatedByLimit && (
                        <p className="text-[#D97706]">
                          Browser memory guard capped chunk extraction to the first 10 minutes of
                          source audio.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[#737373] leading-relaxed">
                      Extracts bounded 30-second 16kHz mono WAV chunks in your browser and sends
                      them to our server-side Gemini endpoint to transcribe speech and select
                      grounded clip timestamps.
                    </p>
                  )}

                  {uploadedVideo.aiAnalysis && (
                    <div
                      data-testid="gemini-analysis-results"
                      className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-4 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#DC2626]" />
                          <span className="text-xs font-semibold text-[#171717]">
                            Gemini AI Clip Analysis
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-[#737373]">
                          {uploadedVideo.aiAnalysis.status === 'ok'
                            ? `${selectedAiClipIndices.length}/${uploadedVideo.aiAnalysis.clips.length} selected · validated`
                            : 'Insufficient speech data'}
                        </span>
                      </div>

                      {uploadedVideo.aiAnalysis.status === 'insufficient_data' ? (
                        <div
                          data-testid="ai-insufficient-notice"
                          className="flex items-start gap-2.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2.5 text-xs text-[#92400E]"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#D97706]" />
                          <div className="space-y-1">
                            <p className="font-semibold text-[#171717]">
                              Insufficient speech or timestamp grounding
                            </p>
                            <p className="leading-relaxed">
                              {uploadedVideo.aiAnalysis.insufficiencyReason}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {uploadedVideo.aiAnalysis.transcript && (
                            <div
                              data-testid="ai-transcript-box"
                              className="rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] p-3 space-y-1 max-h-28 overflow-y-auto"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                                Extracted Speech Transcript
                              </p>
                              <p className="text-xs text-[#171717] whitespace-pre-line leading-relaxed">
                                {uploadedVideo.aiAnalysis.transcript}
                              </p>
                            </div>
                          )}

                          <div data-testid="ai-clips-list" className="space-y-2.5">
                            {uploadedVideo.aiAnalysis.clips.map((aiClip, idx) => {
                              const checked = selectedAiClipIndices.includes(idx);
                              return (
                                <div
                                  key={`${aiClip.startTime}-${aiClip.endTime}-${idx}`}
                                  data-testid="ai-clip-suggestion"
                                  className={`rounded-xl border p-3 transition-colors space-y-2 ${
                                    checked
                                      ? 'bg-[#FEF2F2] border-[#DC2626]'
                                      : 'bg-[#FFFFFF] border-[#E5E5E5] opacity-75'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleAiClipSelection(idx)}
                                        className="mt-0.5 accent-[#DC2626] rounded"
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[#171717] leading-snug">
                                          {aiClip.title}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums text-[#737373] mt-0.5">
                                          <span className="text-[#DC2626] font-sans font-semibold capitalize">
                                            {aiClip.category}
                                          </span>
                                          <span aria-hidden="true">·</span>
                                          <span>
                                            {formatTimecode(aiClip.startTime)}–
                                            {formatTimecode(aiClip.endTime)} ({aiClip.duration}s)
                                          </span>
                                          <span aria-hidden="true">·</span>
                                          <span className="text-[#16A34A] font-semibold">
                                            Score {aiClip.score}/100
                                          </span>
                                        </div>
                                      </div>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleJumpSourceToTimestamp(aiClip.startTime)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[11px] font-medium text-[#171717] shrink-0"
                                      title="Jump source player to this clip's start time"
                                    >
                                      <Play className="h-3 w-3 text-[#DC2626]" />
                                      <span>Preview</span>
                                    </button>
                                  </div>

                                  <div className="pl-6 space-y-1 text-[11px] leading-relaxed">
                                    <p className="text-[#171717]">
                                      <span className="text-[#737373]">Hook:</span> {aiClip.hook}
                                    </p>
                                    <p className="text-[#737373]">
                                      <span className="text-[#171717] font-medium">Why selected:</span>{' '}
                                      {aiClip.reason}
                                    </p>
                                    <p className="text-[#525252]">
                                      <span className="text-[#737373]">Opening caption:</span> &ldquo;
                                      {aiClip.caption}&rdquo;
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Video URL Import Card */}
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-[#DC2626]" />
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Import from Video URL
                </h2>
              </div>
              <span className="text-xs text-[#737373]">
                YouTube (watch, live, shorts) &amp; direct MP4/WebM supported
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <label htmlFor="video-url-input" className="sr-only">
                Video URL
              </label>
              <input
                id="video-url-input"
                data-testid="video-url-input"
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleUrlImport();
                  }
                }}
                placeholder="Paste a YouTube link (watch, live, shorts) or direct .mp4/.webm URL"
                className="flex-1 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3.5 py-2.5 text-sm text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
              />
              <button
                type="button"
                data-testid="video-url-import-btn"
                disabled={isBusy}
                onClick={() => void handleUrlImport()}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {activeOperation === 'upload' && !uploadedVideo ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <span>Import</span>
                )}
              </button>
            </div>

            {urlFeedback && (
              <div
                role={urlFeedback.tone === 'error' ? 'alert' : 'status'}
                data-testid="url-import-feedback"
                className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-xs border ${
                  urlFeedback.tone === 'error'
                    ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                    : urlFeedback.tone === 'success'
                      ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                      : 'bg-[#FAFAFA] border-[#E5E5E5] text-[#525252]'
                }`}
              >
                {urlFeedback.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#16A34A]" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
                )}
                <span className="leading-relaxed">{urlFeedback.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: AI Clip Settings */}
        <div className="lg:col-span-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#171717]">
                2. AI Clip Settings
              </h2>
              <p className="text-xs text-[#737373] mt-0.5">
                Configure AI highlight discovery or switch to Exact Timestamp Trim.
              </p>
            </div>

            <div
              role="group"
              aria-label="Trim mode"
              className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#F5F5F5] border border-[#E5E5E5] shrink-0"
            >
              <button
                type="button"
                onClick={() => setUseCustomTrim(false)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  !useCustomTrim
                    ? 'bg-[#FFFFFF] text-[#DC2626] shadow-2xs'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                Multi-Clip
              </button>
              <button
                type="button"
                onClick={() => setUseCustomTrim(true)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  useCustomTrim
                    ? 'bg-[#FFFFFF] text-[#DC2626] shadow-2xs'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                Exact Trim
              </button>
            </div>
          </div>

          {/* Content Type Selection Cards */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-[#171717]">Content Type</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CLIP_CATEGORIES.map((item) => {
                const active = category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    className={`px-3 py-2.5 rounded-xl text-left transition-colors border flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-[#FEF2F2] border-[#DC2626] text-[#171717]'
                        : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:bg-[#FAFAFA] hover:border-[#D4D4D4]'
                    }`}
                  >
                    <span className="text-xs font-semibold whitespace-nowrap truncate">
                      {item.value}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Exact Trim OR Target Duration + Clip Count */}
          {useCustomTrim ? (
            <div className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#171717] flex items-center gap-1.5">
                  <Scissors className="h-3.5 w-3.5 text-[#DC2626]" />
                  Exact Video Segment Trim
                </span>
                <span className="font-mono tabular-nums font-semibold text-[#DC2626]">
                  {formatTimecode(trimStart)} – {formatTimecode(trimEnd)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label htmlFor="custom-trim-start" className="block text-[11px] text-[#737373]">
                    Start (sec)
                  </label>
                  <input
                    id="custom-trim-start"
                    type="number"
                    min={0}
                    max={Math.max(0, (uploadedVideo?.durationSeconds ?? 60) - 1)}
                    step={0.5}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="custom-trim-end" className="block text-[11px] text-[#737373]">
                    End (sec)
                  </label>
                  <input
                    id="custom-trim-end"
                    type="number"
                    min={1}
                    max={uploadedVideo?.durationSeconds ?? 60}
                    step={0.5}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="custom-trim-duration" className="block text-[11px] text-[#737373]">
                    Duration (sec)
                  </label>
                  <input
                    id="custom-trim-duration"
                    type="number"
                    min={1}
                    max={uploadedVideo?.durationSeconds ?? 60}
                    step={0.5}
                    value={Number.isFinite(currentTrimDuration) ? currentTrimDuration : 0}
                    onChange={(e) => handleTrimDurationInput(Number(e.target.value))}
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
              </div>
              {trimValidation && !trimValidation.valid && (
                <p
                  role="alert"
                  data-testid="trim-timestamp-error"
                  className="text-[11px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-2.5 py-1.5"
                >
                  {trimValidation.error}
                </p>
              )}
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-[#171717]">Duration</legend>
                <div className="grid grid-cols-4 gap-2">
                  {CLIP_DURATIONS.map((sec) => {
                    const active = duration === sec;
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setDuration(sec)}
                        className={`py-2 px-2 rounded-xl text-xs font-mono font-semibold tabular-nums transition-colors border whitespace-nowrap ${
                          active
                            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:bg-[#FAFAFA] hover:text-[#171717]'
                        }`}
                      >
                        {sec}s
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-[#171717]">Clips</legend>
                <div className="grid grid-cols-3 gap-2">
                  {CLIP_COUNTS.map((cnt) => {
                    const active = clipCount === cnt;
                    return (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setClipCount(cnt)}
                        className={`py-2 px-3 rounded-xl text-xs font-mono font-semibold tabular-nums transition-colors border whitespace-nowrap ${
                          active
                            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:bg-[#FAFAFA] hover:text-[#171717]'
                        }`}
                      >
                        {cnt} clips
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {/* Aspect Ratio */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-[#171717]">Aspect Ratio</legend>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ratio) => {
                const active = aspectRatio === ratio.value;
                return (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className={`py-2.5 px-2.5 rounded-xl text-left transition-colors border ${
                      active
                        ? 'bg-[#FEF2F2] border-[#DC2626]'
                        : 'bg-[#FFFFFF] border-[#E5E5E5] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <p
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        active ? 'text-[#DC2626]' : 'text-[#171717]'
                      }`}
                    >
                      {ratio.value}
                    </p>
                    <p className="text-[11px] text-[#737373] truncate mt-0.5">{ratio.platforms}</p>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Summary + Primary Red CTA */}
          <div className="pt-4 border-t border-[#E5E5E5] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#737373]">
              <span>Estimated credit usage</span>
              <span className="font-mono tabular-nums text-[#171717] font-semibold">
                {uploadedVideo ? `${estimatedCredits} min` : '—'} · {availableCreditsMinutes} min left
              </span>
            </div>

            {!uploadedVideo && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] px-3.5 py-2.5 text-xs">
                <span className="text-[#737373] leading-snug">
                  Upload a video in Step 1 to enable clip generation.
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose Video</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleGenerate(false)}
              disabled={
                isBusy ||
                !uploadedVideo ||
                (useCustomTrim && Boolean(trimValidation && !trimValidation.valid))
              }
              data-testid="generate-clips-cta"
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-tight transition-colors shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            >
              {activeOperation === 'generate' || activeOperation === 'ai' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{status.stage}...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {useCustomTrim
                      ? uploadedVideo?.sourceType === 'youtube'
                        ? 'Save YouTube Trim Clip'
                        : 'Cut & Render MP4 Clip'
                      : uploadedVideo?.aiAnalysis?.status === 'ok' && selectedAiClipIndices.length > 0
                        ? uploadedVideo.sourceType === 'youtube'
                          ? `Save ${selectedAiClipIndices.length} AI YouTube ${
                              selectedAiClipIndices.length === 1 ? 'Clip' : 'Clips'
                            }`
                          : `Cut & Render ${selectedAiClipIndices.length} AI ${
                              selectedAiClipIndices.length === 1 ? 'Clip' : 'Clips'
                            }`
                        : 'Generate Clips with AI'}
                  </span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#737373]">
              <Film className="h-3.5 w-3.5 shrink-0" />
              <span className="text-center">
                {uploadedVideo?.sourceType === 'youtube'
                  ? useCustomTrim
                    ? 'Saves exact YouTube clip timestamps with live preview & editable captions'
                    : 'Analyzes YouTube video via server-side Gemini AI and creates timestamped clips'
                  : useCustomTrim
                    ? 'Cuts exact manual timestamps via FFmpeg.wasm in Web Worker'
                    : 'Analyzes speech via server-side Gemini AI, then cuts real MP4 clips via FFmpeg.wasm'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
