import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Scissors,
  Volume2,
  X,
} from 'lucide-react';
import { CaptionTemplateId } from '../types/clipforge';
import { CAPTION_TEMPLATES } from '../data/templates';
import {
  computeReelOrbitPose,
  getFrontReelIndex,
  getOrbitAngleForIndex,
  normalizeAngle,
  shortestAngularDelta,
} from '../utils/reelOrbit';
import { CaptionRenderer } from './CaptionRenderer';

import podcastImg from '../assets/images/reel_podcast_creator_1795371603409.jpg';
import techImg from '../assets/images/reel_tech_creator_1795371590277.jpg';
import gamingImg from '../assets/images/reel_gaming_streamer_1795371676066.jpg';
import comedyImg from '../assets/images/reel_comedy_creator_1795371591699.jpg';
import filmmakerImg from '../assets/images/reel_filmmaker_creator_1795371596007.jpg';

export interface CreatorReelItem {
  id: string;
  creatorName: string;
  handle: string;
  category: string;
  title: string;
  durationSec: number;
  durationLabel: string;
  viewsLabel: string;
  imageUrl: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  templateId: CaptionTemplateId;
  captionLines: string[];
}

export const CREATOR_REELS: CreatorReelItem[] = [
  {
    id: 'reel-podcast',
    creatorName: 'Maya Chen',
    handle: '@mayapodcasts',
    category: 'Podcast',
    title: 'The exact moment the live mic caught our plot twist',
    durationSec: 34,
    durationLabel: '0:34',
    viewsLabel: '1.4M views',
    imageUrl: podcastImg,
    youtubeVideoId: 'l-oEKLu4Y3w',
    youtubeUrl: 'https://www.youtube.com/live/l-oEKLu4Y3w',
    templateId: 'podcast-pro',
    captionLines: [
      'We thought the recording light was off until the whole studio laughed.',
      'That unscripted 12-second reaction beat every planned hook.',
    ],
  },
  {
    id: 'reel-tech',
    creatorName: 'Devon Brooks',
    handle: '@devontech',
    category: 'Tech Review',
    title: 'Why 90% of Shorts lose viewers in the first 3 seconds',
    durationSec: 28,
    durationLabel: '0:28',
    viewsLabel: '890K views',
    imageUrl: techImg,
    youtubeVideoId: 'LXb3EKWsInQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    templateId: 'bold-viral',
    captionLines: [
      'FIX THE FIRST THREE SECONDS BEFORE ANYTHING ELSE',
      'CUT THE INTRO AND START RIGHT ON THE PAYOFF',
    ],
  },
  {
    id: 'reel-gaming',
    creatorName: 'Kaira Live',
    handle: '@kairagaming',
    category: 'Gaming VOD',
    title: 'Zero-health clutch reaction straight from a 4-hour stream',
    durationSec: 22,
    durationLabel: '0:22',
    viewsLabel: '2.1M views',
    imageUrl: gamingImg,
    youtubeVideoId: 'l-oEKLu4Y3w',
    youtubeUrl: 'https://www.youtube.com/live/l-oEKLu4Y3w',
    templateId: 'gaming',
    captionLines: [
      'NO WAY THAT ACTUALLY LANDED ON ONE HP',
      'CHAT CLIP THAT RIGHT NOW',
    ],
  },
  {
    id: 'reel-comedy',
    creatorName: 'Nina Morales',
    handle: '@ninastandup',
    category: 'Comedy',
    title: 'Crowd-work punchline clipped cleanly without cutting the laugh',
    durationSec: 31,
    durationLabel: '0:31',
    viewsLabel: '1.8M views',
    imageUrl: comedyImg,
    youtubeVideoId: 'aqz-KE-bpKQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    templateId: 'karaoke',
    captionLines: [
      'Never ask the front row what they actually do for a living',
      'Watch the timing hold right through the punchline',
    ],
  },
  {
    id: 'reel-filmmaker',
    creatorName: 'Claire Novak',
    handle: '@clairecinema',
    category: 'Filmmaking',
    title: 'One window light trick that upgrades every talking-head reel',
    durationSec: 38,
    durationLabel: '0:38',
    viewsLabel: '640K views',
    imageUrl: filmmakerImg,
    youtubeVideoId: 'YE7VzlLtp-4',
    youtubeUrl: 'https://www.youtube.com/watch?v=YE7VzlLtp-4',
    templateId: 'color-highlight',
    captionLines: [
      'Turn 45 degrees from the window for instant cinema contrast',
      'Reframe to 9:16 without losing eye-line composition',
    ],
  },
];

interface ReelCircleShowcaseProps {
  onGenerateFromYouTubeUrl: (url: string) => void;
}

export function ReelCircleShowcase({ onGenerateFromYouTubeUrl }: ReelCircleShowcaseProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const orbitAngleRef = useRef<number>(0);
  const targetAngleRef = useRef<number | null>(null);
  const isHoveredRef = useRef<boolean>(false);
  const isOrbitPlayingRef = useRef<boolean>(true);
  const liveVideoIdRef = useRef<string | null>(null);
  const activeIdxRef = useRef<number>(0);

  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [isOrbitPlaying, setIsOrbitPlaying] = useState<boolean>(true);
  const [liveReelId, setLiveReelId] = useState<string | null>(null);
  const [captionTick, setCaptionTick] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(6);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    isOrbitPlayingRef.current = isOrbitPlaying;
  }, [isOrbitPlaying]);

  useEffect(() => {
    liveVideoIdRef.current = liveReelId;
  }, [liveReelId]);

  // Real-time word-synced caption + playback timecode heartbeat for the front reel
  useEffect(() => {
    const id = window.setInterval(() => {
      setCaptionTick((prev) => prev + 1);
      setElapsedSec((prev) => {
        const dur = CREATOR_REELS[activeIdxRef.current]?.durationSec ?? 30;
        return prev + 1 >= dur ? 1 : prev + 1;
      });
    }, 520);
    return () => window.clearInterval(id);
  }, []);

  // Reset elapsed counter cleanly when switching front reel
  useEffect(() => {
    setElapsedSec(4);
    setCaptionTick(0);
  }, [activeIdx]);

  // Smooth 60fps compositor-only 3D circular orbital animation (graceful glide + centered dwell)
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastTime = performance.now();
    let dwellElapsedSec = 0;
    const STEP_RAD = (Math.PI * 2) / CREATOR_REELS.length;
    const DWELL_SECONDS = 2.6;

    const applyPoses = (angleRad: number) => {
      const stageWidth = stageRef.current?.clientWidth ?? 1080;
      const isCompact = stageWidth < 640;
      const radiusX = isCompact
        ? Math.max(96, Math.min(148, stageWidth * 0.32))
        : Math.min(355, stageWidth * 0.31);
      const radiusY = isCompact ? 14 : 22;

      for (let i = 0; i < CREATOR_REELS.length; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const pose = computeReelOrbitPose(i, CREATOR_REELS.length, angleRad, radiusX, radiusY);
        el.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale}) perspective(1100px) rotateY(${pose.rotateY}deg)`;
        el.style.opacity = String(pose.opacity);
        el.style.zIndex = String(pose.zIndex);
      }

      const nextFront = getFrontReelIndex(CREATOR_REELS.length, angleRad);
      if (nextFront !== activeIdxRef.current) {
        activeIdxRef.current = nextFront;
        setActiveIdx(nextFront);
      }
    };

    applyPoses(orbitAngleRef.current);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (targetAngleRef.current !== null) {
        dwellElapsedSec = 0;
        const delta = shortestAngularDelta(orbitAngleRef.current, targetAngleRef.current);
        if (Math.abs(delta) < 0.003) {
          orbitAngleRef.current = normalizeAngle(targetAngleRef.current);
          targetAngleRef.current = null;
        } else {
          orbitAngleRef.current = normalizeAngle(
            orbitAngleRef.current + delta * Math.min(1, dt * 6.8)
          );
        }
      } else if (
        !prefersReducedMotion &&
        isOrbitPlayingRef.current &&
        !isHoveredRef.current &&
        !liveVideoIdRef.current
      ) {
        dwellElapsedSec += dt;
        if (dwellElapsedSec >= DWELL_SECONDS) {
          dwellElapsedSec = 0;
          targetAngleRef.current = normalizeAngle(orbitAngleRef.current + STEP_RAD);
        }
      } else {
        dwellElapsedSec = 0;
      }

      applyPoses(orbitAngleRef.current);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const focusReelByIndex = (index: number) => {
    const normalizedIdx = ((index % CREATOR_REELS.length) + CREATOR_REELS.length) % CREATOR_REELS.length;
    setLiveReelId(null);
    targetAngleRef.current = getOrbitAngleForIndex(normalizedIdx, CREATOR_REELS.length);
  };

  const handleStep = (direction: -1 | 1) => {
    focusReelByIndex(activeIdx + direction);
  };

  const activeReel = CREATOR_REELS[activeIdx] || CREATOR_REELS[0];
  const formattedElapsed = `0:${String(Math.min(activeReel.durationSec, elapsedSec)).padStart(2, '0')}`;
  const progressPct = Math.min(100, Math.round((elapsedSec / activeReel.durationSec) * 100));

  return (
    <div
      data-testid="reel-circle-showcase"
      className="mt-12 sm:mt-14 rounded-3xl bg-[#FAFAFA] border border-[#E5E5E5] px-4 py-8 sm:px-8 sm:py-10 overflow-hidden"
    >
      {/* Clean Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 max-w-6xl mx-auto">
        <div className="space-y-1 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
            Live Creator Reels · 9:16 Vertical
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#171717]">
            Real creator shorts orbiting in real time
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            aria-label="Previous creator reel"
            data-testid="reel-orbit-prev"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (liveReelId) setLiveReelId(null);
              setIsOrbitPlaying((prev) => !prev);
            }}
            aria-label={isOrbitPlaying && !liveReelId ? 'Pause reel circle' : 'Play reel circle'}
            data-testid="reel-orbit-toggle"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors whitespace-nowrap"
          >
            {isOrbitPlaying && !liveReelId ? (
              <>
                <Pause className="h-3.5 w-3.5 text-[#DC2626]" />
                <span>Pause Orbit</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-[#DC2626]" />
                <span>Resume Orbit</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleStep(1)}
            aria-label="Next creator reel"
            data-testid="reel-orbit-next"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 3D Circular Orbital Stage */}
      <div
        ref={stageRef}
        onMouseEnter={() => {
          isHoveredRef.current = true;
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
        }}
        className="relative mt-6 h-[430px] sm:h-[490px] w-full flex items-center justify-center select-none"
      >
        {/* Subtle Architectural Circular Perspective Track */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[820px] h-[155px] sm:h-[190px] rounded-full border border-[#E5E5E5]/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[74%] max-w-[660px] h-[105px] sm:h-[130px] rounded-full border border-dashed border-[#E5E5E5]/70"
        />

        {CREATOR_REELS.map((reel, idx) => {
          const isFront = idx === activeIdx;
          const isLiveEmbed = liveReelId === reel.id;
          const tpl = CAPTION_TEMPLATES.find((t) => t.id === reel.templateId) || CAPTION_TEMPLATES[0];
          const captionLine =
            reel.captionLines[Math.floor(captionTick / 7) % reel.captionLines.length] ||
            reel.captionLines[0];

          return (
            <div
              key={reel.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              data-testid={`reel-orbit-card-${idx}`}
              data-active={isFront ? 'true' : 'false'}
              style={{ willChange: 'transform, opacity' }}
              className="absolute top-1/2 left-1/2 -ml-[102px] sm:-ml-[118px] -mt-[182px] sm:-mt-[210px] w-[204px] sm:w-[236px]"
            >
              <div
                className={`relative aspect-[9/16] w-full overflow-hidden rounded-[22px] bg-[#141414] transition-shadow duration-300 ${
                  isFront
                    ? 'ring-2 ring-[#DC2626] shadow-[0_24px_48px_-18px_rgba(23,23,23,0.42)]'
                    : 'ring-1 ring-[#E5E5E5] shadow-[0_14px_30px_-18px_rgba(23,23,23,0.28)]'
                }`}
              >
                {isLiveEmbed ? (
                  <>
                    <iframe
                      src={`https://www.youtube.com/embed/${reel.youtubeVideoId}?autoplay=1&mute=0&playsinline=1&rel=0&modestbranding=1`}
                      title={`${reel.creatorName} — ${reel.title}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="reel-live-youtube-iframe"
                      className="absolute inset-0 h-full w-full border-0 bg-black"
                    />
                    <button
                      type="button"
                      onClick={() => setLiveReelId(null)}
                      aria-label="Close live YouTube preview"
                      className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-black/75 hover:bg-[#DC2626] text-white transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    {/* 9:16 Creator Visual Frame with Real-Time Motion */}
                    {!failedImages[reel.id] ? (
                      <img
                        src={reel.imageUrl}
                        alt={`${reel.creatorName} vertical 9:16 creator video`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({
                            ...prev,
                            [reel.id]: true,
                          }))
                        }
                        className={`h-full w-full object-cover ${
                          isFront ? 'cf-reel-live-motion' : ''
                        }`}
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-b from-[#262626] to-[#111111] flex flex-col items-center justify-center p-4 text-center">
                        <Volume2 className="h-6 w-6 text-[#DC2626] mb-2" />
                        <p className="text-xs font-semibold text-white">{reel.creatorName}</p>
                        <p className="text-[11px] text-white/65 mt-1">{reel.category}</p>
                      </div>
                    )}

                    {/* Measured Contrast Scrims */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/55 to-transparent"
                    />

                    {/* Top Real-Time Progress Track & Metadata */}
                    <div className="absolute top-2.5 inset-x-3 space-y-2 z-10">
                      <div className="h-0.5 w-full rounded-full bg-white/25 overflow-hidden">
                        <div
                          className="h-full bg-[#DC2626] transition-[width] duration-500 ease-linear"
                          style={{ width: isFront ? `${progressPct}%` : '28%' }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-white/90">
                        <span>{reel.category} · 9:16</span>
                        <span>
                          {isFront ? `${formattedElapsed} / ${reel.durationLabel}` : reel.durationLabel}
                        </span>
                      </div>
                    </div>

                    {/* Real-Time Synced Captions in Lower-Third Safe Zone (keeps creator face clear) */}
                    {isFront && (
                      <div className="pointer-events-none absolute inset-x-2 bottom-[104px] z-10">
                        <CaptionRenderer
                          templateId={tpl.id}
                          text={captionLine}
                          fontFamily={tpl.defaultFontFamily}
                          fontSize={tpl.defaultFontSize}
                          fontColor={tpl.defaultFontColor}
                          highlightColor={tpl.defaultHighlightColor}
                          backgroundColor={tpl.defaultBackgroundColor}
                          backgroundOpacity={tpl.defaultBackgroundOpacity}
                          outlineWidth={tpl.defaultOutlineWidth}
                          outlineColor={tpl.defaultOutlineColor}
                          shadowStyle={tpl.defaultShadowStyle}
                          position="bottom"
                          activeWordIndex={captionTick}
                          compact
                        />
                      </div>
                    )}

                    {/* Click overlay for non-front orbiting cards to bring into focus */}
                    {!isFront && (
                      <button
                        type="button"
                        onClick={() => focusReelByIndex(idx)}
                        aria-label={`Bring ${reel.creatorName}'s reel to front`}
                        className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded-[22px]"
                      />
                    )}

                    {/* Bottom Creator Info & Actions */}
                    <div className="absolute bottom-3 inset-x-3 z-20 space-y-2.5 text-left">
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                          <span className="font-semibold text-white truncate">
                            {reel.creatorName}
                          </span>
                          <span className="font-mono tabular-nums shrink-0 text-[10px] text-white/75">
                            {reel.viewsLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/85 leading-snug line-clamp-2">
                          {reel.title}
                        </p>
                      </div>

                      {isFront && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setLiveReelId(reel.id)}
                            data-testid="reel-watch-live-btn"
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-[11px] font-semibold transition-colors whitespace-nowrap"
                          >
                            <Play className="h-3 w-3" />
                            <span>Watch Live</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onGenerateFromYouTubeUrl(reel.youtubeUrl)}
                            data-testid="reel-clip-this-btn"
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[11px] font-semibold transition-colors whitespace-nowrap"
                          >
                            <Scissors className="h-3 w-3" />
                            <span>Clip Video</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Active Creator Strip & Direct Studio Handoff */}
      <div className="mt-4 pt-4 border-t border-[#E5E5E5] max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="font-mono tabular-nums font-semibold text-[#DC2626]">
            0{activeIdx + 1} / 0{CREATOR_REELS.length}
          </span>
          <span aria-hidden="true" className="text-[#D4D4D4]">
            ·
          </span>
          <span className="font-semibold text-[#171717]">{activeReel.creatorName}</span>
          <span className="text-[#737373]">{activeReel.handle}</span>
          <span aria-hidden="true" className="text-[#D4D4D4]">
            ·
          </span>
          <span className="text-[#737373] truncate max-w-xs sm:max-w-md">{activeReel.title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Select creator reel">
            {CREATOR_REELS.map((reel, idx) => (
              <button
                key={reel.id}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                aria-label={`Select ${reel.creatorName} reel`}
                onClick={() => focusReelByIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === activeIdx
                    ? 'w-6 bg-[#DC2626]'
                    : 'w-2 bg-[#D4D4D4] hover:bg-[#A3A3A3]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
