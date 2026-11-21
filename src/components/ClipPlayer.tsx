import { useEffect, useRef, useState } from 'react';
import {
  Film,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ClipItem } from '../types/clipforge';
import { formatTimecode } from '../utils/timecode';
import { getAspectRatioClass } from '../utils/clipGenerator';
import {
  evaluateReactionEffectsAtTime,
  getActiveCaptionAtTime,
  resolveEditorSettings,
} from '../utils/captionReactionLogic';
import { CaptionRenderer } from './CaptionRenderer';
import { previewSoundEffect } from '../utils/mediaTools';

interface ClipPlayerProps {
  clip: ClipItem;
  compact?: boolean;
  externalPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  externalProgress?: number; // 0..1
  onProgressChange?: (progress: number) => void;
  previewReactionId?: string | null;
  showControls?: boolean;
  maxHeightClass?: string;
}

export function ClipPlayer({
  clip,
  compact = false,
  externalPlaying,
  onPlayingChange,
  externalProgress,
  onProgressChange,
  previewReactionId = null,
  showControls = true,
  maxHeightClass = '',
}: ClipPlayerProps) {
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [internalProgress, setInternalProgress] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [decodedDuration, setDecodedDuration] = useState<number | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const triggeredSfxRef = useRef<Set<string>>(new Set());

  const isPlaying = externalPlaying !== undefined ? externalPlaying : internalPlaying;
  const progress = externalProgress !== undefined ? externalProgress : internalProgress;

  const isStandaloneCut = Boolean(clip.isRealProcessedClip && clip.videoUrl);
  const clipDuration =
    isStandaloneCut && decodedDuration && decodedDuration > 0
      ? decodedDuration
      : Math.max(1, clip.endTime - clip.startTime);

  const settings = resolveEditorSettings(clip.editor);
  const relTimeSec = Math.max(0, Math.min(clipDuration, progress * clipDuration));
  const activeCaption = getActiveCaptionAtTime(
    settings.captions,
    relTimeSec,
    settings.captionText,
    clipDuration
  );
  const effectiveEffects = previewReactionId
    ? settings.reactionEffects.map((fx) =>
        fx.id === previewReactionId ? { ...fx, status: 'accepted' as const } : fx
      )
    : settings.reactionEffects;
  const reactionFrame = evaluateReactionEffectsAtTime(
    effectiveEffects,
    relTimeSec,
    clipDuration
  );

  const setPlaying = (next: boolean) => {
    if (onPlayingChange) onPlayingChange(next);
    else setInternalPlaying(next);
  };

  const setProgress = (next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    if (onProgressChange) onProgressChange(clamped);
    else setInternalProgress(clamped);
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Sync HTML5 video volume & mute
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  // Apply live slow-motion playbackRate during accepted slow-motion reaction effects
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextRate = reactionFrame.slowMotionActive ? 0.5 : 1.0;
    if (Math.abs(video.playbackRate - nextRate) > 0.05) {
      video.playbackRate = nextRate;
    }
    if (bgVideoRef.current && Math.abs(bgVideoRef.current.playbackRate - nextRate) > 0.05) {
      bgVideoRef.current.playbackRate = nextRate;
    }
  }, [reactionFrame.slowMotionActive]);

  // Trigger accepted reaction SFX cues when playhead crosses them
  useEffect(() => {
    if (!isPlaying || muted) {
      if (!isPlaying) triggeredSfxRef.current.clear();
      return;
    }
    for (const fx of settings.reactionEffects) {
      if (fx.status !== 'accepted') continue;
      const sfx = fx.soundEffect || (fx.type === 'freeze-frame' ? 'shutter' : undefined);
      if (!sfx || sfx === 'none') continue;
      if (relTimeSec >= fx.startTime && relTimeSec <= fx.startTime + 0.35) {
        if (!triggeredSfxRef.current.has(fx.id)) {
          triggeredSfxRef.current.add(fx.id);
          previewSoundEffect(sfx, settings.sfxVolume);
        }
      }
    }
  }, [isPlaying, muted, relTimeSec, settings.reactionEffects, settings.sfxVolume]);

  // Sync external seek updates to HTML5 video when paused (e.g., clicking Preview on a reaction suggestion)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip.videoUrl || isPlaying) return;
    const target = isStandaloneCut
      ? progress * clipDuration
      : clip.startTime + progress * clipDuration;
    if (Math.abs(video.currentTime - target) > 0.15) {
      try {
        video.currentTime = target;
        if (bgVideoRef.current) bgVideoRef.current.currentTime = target;
      } catch {
        // ignore seek before loadedmetadata
      }
    }
  }, [progress, isPlaying, clip.videoUrl, clip.startTime, clipDuration, isStandaloneCut]);

  // Sync HTML5 video playback when videoUrl exists
  useEffect(() => {
    const video = videoRef.current;
    const bgVideo = bgVideoRef.current;
    if (!video || !clip.videoUrl) return;

    if (isPlaying) {
      if (!isStandaloneCut) {
        if (video.currentTime < clip.startTime || video.currentTime >= clip.endTime) {
          video.currentTime = clip.startTime;
        }
      } else if (video.ended || video.currentTime >= clipDuration) {
        video.currentTime = 0;
      }
      if (bgVideo) {
        bgVideo.currentTime = video.currentTime;
        bgVideo.play().catch(() => {});
      }
      video.play().catch(() => {
        setPlaying(false);
      });
    } else {
      video.pause();
      bgVideo?.pause();
    }
  }, [isPlaying, clip.videoUrl, clip.startTime, clip.endTime, isStandaloneCut, clipDuration]);

  // Playback clock for seeded studio image previews without an underlying video Blob
  useEffect(() => {
    if (!isPlaying || clip.videoUrl) return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setInternalProgress((prev) => {
        const next = prev + dt / clipDuration;
        const wrapped = next >= 1 ? 0 : next;
        if (onProgressChange) onProgressChange(wrapped);
        return wrapped;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, clip.videoUrl, clipDuration, onProgressChange]);

  const handleTogglePlay = () => {
    const next = !isPlaying;
    if (next && clip.editor.soundEffect !== 'none' && !muted) {
      previewSoundEffect(clip.editor.soundEffect, clip.editor.sfxVolume);
    }
    setPlaying(next);
  };

  const handleToggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (typeof el.requestFullscreen === 'function') {
        await el.requestFullscreen();
      }
    } catch {
      // Gracefully ignore fullscreen errors in restricted iframes
    }
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isStandaloneCut) {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : clipDuration;
      setProgress(video.currentTime / dur);
      return;
    }

    if (video.currentTime >= clip.endTime) {
      video.currentTime = clip.startTime;
      triggeredSfxRef.current.clear();
    }
    const rel = (video.currentTime - clip.startTime) / clipDuration;
    setProgress(rel);
  };

  const currentElapsed = isStandaloneCut
    ? progress * clipDuration
    : clip.startTime + progress * clipDuration;

  const totalZoom = (settings.zoom / 100) * reactionFrame.extraZoomScale;
  const isBlurMode = settings.cropMode === 'background-blur';
  const objectPosition =
    settings.cropMode === 'face-centered'
      ? `${Math.round(settings.faceAnchorX * 100)}% ${Math.round(settings.faceAnchorY * 100)}%`
      : settings.cropMode === 'smart'
        ? '50% 40%'
        : '50% 50%';

  const panX = settings.cropMode === 'manual' || isBlurMode ? settings.cropX : 0;
  const panY = settings.cropMode === 'manual' || isBlurMode ? settings.cropY : 0;
  const mediaTransform = `scale(${totalZoom.toFixed(3)}) translate(${panX}%, ${panY}%)`;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl bg-[#111111] border border-[#E5E5E5] select-none shadow-xs ${
        isFullscreen ? 'h-screen w-screen rounded-none border-0' : getAspectRatioClass(settings.aspectRatio)
      } ${maxHeightClass}`}
      data-testid="clip-player"
      data-real-clip={isStandaloneCut ? 'true' : 'false'}
      data-crop-mode={settings.cropMode}
      data-decoded-duration={decodedDuration !== null ? decodedDuration.toFixed(2) : ''}
    >
      {/* Background Blur Layer when Background Blur framing is enabled */}
      {isBlurMode && clip.videoUrl && (
        <video
          ref={bgVideoRef}
          src={clip.videoUrl}
          muted
          playsInline
          loop={isStandaloneCut}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover scale-125 blur-xl brightness-70"
        />
      )}
      {isBlurMode && !clip.videoUrl && clip.thumbnailUrl && !imgFailed && (
        <img
          src={clip.thumbnailUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover scale-125 blur-xl brightness-70"
        />
      )}

      {/* Primary Video, YouTube Segment, or Studio Frame */}
      {clip.videoUrl ? (
        <video
          ref={videoRef}
          src={clip.videoUrl}
          poster={clip.thumbnailUrl || undefined}
          muted={muted}
          playsInline
          loop={isStandaloneCut}
          onTimeUpdate={handleVideoTimeUpdate}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (!v) return;
            if (Number.isFinite(v.duration) && v.duration > 0) {
              setDecodedDuration(v.duration);
            }
            if (!isStandaloneCut) {
              v.currentTime = clip.startTime;
            }
          }}
          className={`relative h-full w-full transition-transform duration-150 ${
            isBlurMode ? 'object-contain' : 'object-cover'
          }`}
          style={{
            transform: mediaTransform,
            objectPosition,
            filter: reactionFrame.freezeActive ? 'contrast(1.08) saturate(0.82)' : undefined,
          }}
        />
      ) : clip.youtubeVideoId ? (
        isPlaying ? (
          <iframe
            key={`yt-clip-${clip.youtubeVideoId}-${Math.floor(clip.startTime)}-${Math.ceil(clip.endTime)}`}
            src={`https://www.youtube.com/embed/${clip.youtubeVideoId}?start=${Math.max(
              0,
              Math.floor(clip.startTime)
            )}&end=${Math.max(Math.floor(clip.startTime) + 1, Math.ceil(clip.endTime))}&autoplay=1&mute=${
              muted ? 1 : 0
            }&rel=0&modestbranding=1`}
            title={clip.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="relative h-full w-full border-0 bg-black"
          />
        ) : (
          <img
            src={clip.thumbnailUrl || `https://i.ytimg.com/vi/${clip.youtubeVideoId}/hqdefault.jpg`}
            alt={clip.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`relative h-full w-full transition-transform duration-200 ${
              isBlurMode ? 'object-contain' : 'object-cover'
            }`}
            style={{
              transform: mediaTransform,
              objectPosition,
              filter: reactionFrame.freezeActive ? 'contrast(1.08) saturate(0.82)' : undefined,
            }}
          />
        )
      ) : clip.thumbnailUrl && !imgFailed ? (
        <img
          src={clip.thumbnailUrl}
          alt={clip.title}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`relative h-full w-full transition-transform duration-200 ${
            isBlurMode ? 'object-contain' : 'object-cover'
          }`}
          style={{
            transform: mediaTransform,
            objectPosition,
            filter: reactionFrame.freezeActive ? 'contrast(1.08) saturate(0.82)' : undefined,
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#171717] p-4 text-center">
          <Film className="h-8 w-8 text-[#DC2626] mb-2" />
          <span className="text-xs text-[#D4D4D4] line-clamp-2">{clip.title}</span>
        </div>
      )}

      {/* Measured contrast scrim for captions & controls */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/30" />

      {/* Live Reaction Vignette / Shutter Flash */}
      {reactionFrame.vignetteAlpha > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle, transparent 42%, rgba(0,0,0,${Math.min(0.75, reactionFrame.vignetteAlpha)}) 100%)`,
          }}
        />
      )}
      {reactionFrame.flashAlpha > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0 bg-white"
          style={{ opacity: Math.min(0.65, reactionFrame.flashAlpha) }}
        />
      )}

      {/* Live Reaction Meme Text Overlay */}
      {reactionFrame.memeText && (
        <div
          data-testid="reaction-meme-overlay"
          className="pointer-events-none absolute inset-x-3 top-[13%] flex justify-center"
        >
          <span
            className="font-extrabold uppercase text-center text-white tracking-wide leading-tight px-2"
            style={{
              fontFamily: '"Oswald", "Montserrat", sans-serif',
              fontSize: compact ? '15px' : '22px',
              WebkitTextStroke: '1.5px #09090B',
              paintOrder: 'stroke fill',
              textShadow: '0 3px 10px rgba(0,0,0,0.95)',
            }}
          >
            {reactionFrame.memeText}
          </span>
        </div>
      )}

      {/* Live Reaction Emoji Overlay */}
      {reactionFrame.emojiOverlay && (
        <div
          data-testid="reaction-emoji-overlay"
          className="pointer-events-none absolute right-[10%] top-[20%] transition-transform duration-100"
          style={{
            fontSize: compact ? '28px' : '44px',
            transform: `scale(${reactionFrame.emojiOverlay.scale.toFixed(2)})`,
            filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.65))',
          }}
        >
          {reactionFrame.emojiOverlay.emoji}
        </div>
      )}

      {/* Live Synced Caption Overlay */}
      {activeCaption && (
        <CaptionRenderer
          templateId={settings.templateId}
          text={activeCaption.text}
          words={activeCaption.words}
          speaker={activeCaption.speaker}
          showSpeakerLabels={settings.showSpeakerLabels}
          fontSize={settings.fontSize}
          fontFamily={settings.fontFamily}
          fontColor={settings.fontColor}
          highlightColor={settings.highlightColor}
          backgroundColor={settings.backgroundColor}
          backgroundOpacity={settings.backgroundOpacity}
          outlineWidth={settings.outlineWidth}
          outlineColor={settings.outlineColor}
          shadowStyle={settings.shadowStyle}
          alignment={settings.alignment}
          animationSpeed={settings.animationSpeed}
          position={settings.textPosition}
          verticalOffset={settings.verticalOffset}
          activeWordIndex={activeCaption.activeWordIndex}
          compact={compact && !isFullscreen}
        />
      )}

      {/* Top Timecode & Aspect Bar */}
      <div
        className={`pointer-events-none absolute top-2 inset-x-2.5 flex items-center justify-between gap-1.5 font-mono tabular-nums text-white/90 ${
          compact && !isFullscreen ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        <span
          className={`bg-black/60 backdrop-blur-sm rounded whitespace-nowrap shrink-0 ${
            compact && !isFullscreen ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
          }`}
        >
          {formatTimecode(currentElapsed)} / {formatTimecode(clipDuration)}
        </span>
        <span
          className={`bg-black/60 backdrop-blur-sm rounded text-white/80 whitespace-nowrap shrink-0 ${
            compact && !isFullscreen ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
          }`}
        >
          {isStandaloneCut ? 'MP4 · ' : clip.youtubeVideoId ? 'YT · ' : ''}
          {settings.aspectRatio}
        </span>
      </div>

      {/* Play / Pause, Seek, Volume, and Fullscreen Controls */}
      {showControls && (
        <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-center gap-2 bg-gradient-to-t from-black/90 to-transparent">
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? `Pause ${clip.title}` : `Play ${clip.title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 hover:bg-[#DC2626] text-white backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          <div className="flex-1 flex items-center min-w-0">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(progress * 100)}
              aria-label={`Seek preview for ${clip.title}`}
              onChange={(e) => {
                const nextFrac = Number(e.target.value) / 100;
                setProgress(nextFrac);
                if (videoRef.current && clip.videoUrl) {
                  const targetSec = isStandaloneCut
                    ? nextFrac * clipDuration
                    : clip.startTime + nextFrac * clipDuration;
                  videoRef.current.currentTime = targetSec;
                  if (bgVideoRef.current) bgVideoRef.current.currentTime = targetSec;
                }
              }}
              className="cf-range-dark w-full"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? `Unmute ${clip.title}` : `Mute ${clip.title}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </button>
            {!compact && (
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : Math.round(volume * 100)}
                aria-label={`Volume for ${clip.title}`}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setVolume(v);
                  if (v > 0 && muted) setMuted(false);
                }}
                className="cf-range-dark w-14 hidden sm:block"
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen preview' : `Fullscreen preview for ${clip.title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          >
            {isFullscreen ? (
              <Minimize className="h-3.5 w-3.5" />
            ) : (
              <Maximize className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
