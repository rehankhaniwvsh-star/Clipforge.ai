import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Crop,
  Download,
  Link2,
  Pause,
  Play,
  Radio,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
} from 'lucide-react';
import { AspectRatio, CaptionTemplateId } from '../types/clipforge';
import { CAPTION_TEMPLATES } from '../data/templates';
import { classifyVideoUrl } from '../utils/urlImport';
import { BrandMark } from './BrandMark';
import { CaptionRenderer } from './CaptionRenderer';
import { DemoModal } from './DemoModal';
import { ReelCircleShowcase } from './ReelCircleShowcase';

interface LandingPageProps {
  onStartCreating: () => void;
  onOpenTemplates: (templateId?: CaptionTemplateId) => void;
  onGenerateFromYouTubeUrl: (url: string) => void;
}

const STUDIO_DEMO_CLIPS: Array<{
  id: string;
  title: string;
  category: string;
  timecode: string;
  duration: string;
  score: number;
  caption: string;
  templateId: CaptionTemplateId;
}> = [
  {
    id: 'demo-1',
    title: 'Why 90% of Shorts Lose Viewers in 3 Seconds',
    category: 'Strong Hook',
    timecode: '04:12 – 04:44',
    duration: '0:32',
    score: 96,
    caption: 'FIX THE FIRST THREE SECONDS BEFORE ANYTHING ELSE',
    templateId: 'bold-viral',
  },
  {
    id: 'demo-2',
    title: 'Unexpected Punchline on Live Podcast Mic',
    category: 'Funny Moment',
    timecode: '18:05 – 18:35',
    duration: '0:30',
    score: 93,
    caption: 'We forgot to hit record on the main studio track.',
    templateId: 'podcast-pro',
  },
  {
    id: 'demo-3',
    title: 'The 3-Part Editing Framework Explained',
    category: 'Educational',
    timecode: '31:20 – 32:02',
    duration: '0:42',
    score: 91,
    caption: 'Watch how the timing shifts right on the beat',
    templateId: 'karaoke',
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI Moment Detection',
    description:
      'Gemini AI analyzes spoken audio and transcript context to surface punchlines, hooks, and quotable moments with validated timestamps.',
  },
  {
    icon: Scissors,
    title: 'Frame-Accurate Browser Trimming',
    description:
      'Cut real, playable MP4 segments directly inside your browser via FFmpeg.wasm with zero desktop software installation.',
  },
  {
    icon: Subtitles,
    title: 'Word-Synced Captions',
    description:
      'Generate punctuated English, Hindi, and Hinglish captions with 10 customizable studio templates and speaker labels.',
  },
  {
    icon: Crop,
    title: 'Smart 9:16 Reframing',
    description:
      'Switch cleanly between vertical Shorts, square feeds, and widescreen layouts with face-centered tracking and background blur.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Multi-Track Video Editor',
    description:
      'Fine-tune video, audio, and caption tracks, preview optional reaction effects, and undo or redo edits effortlessly.',
  },
  {
    icon: Radio,
    title: 'Live Clipper Workspace',
    description:
      'Capture live browser streams or camera sessions, mark standout moments in real time, and bring clips straight into the studio.',
  },
];

const WORKFLOW_STEPS = [
  {
    number: '01',
    icon: Link2,
    title: 'Paste a YouTube Link',
    description:
      'Drop any public YouTube video, Shorts, or Live VOD link. ClipForge loads the video metadata, thumbnail, and player instantly—no file uploads needed.',
  },
  {
    number: '02',
    icon: Sparkles,
    title: 'AI Finds the Best Moments',
    description:
      'Select your content style, clip duration, and aspect ratio. Gemini AI isolates complete hooks and punchlines with validated timestamps.',
  },
  {
    number: '03',
    icon: Download,
    title: 'Refine Captions & Export',
    description:
      'Customize captions, framing, and reaction cues inside the light-theme studio, then export ready-to-share clips and cut packages.',
  },
];

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '$0',
    cadence: 'forever',
    description: 'For creators testing AI short-form workflows.',
    cta: 'Start Free',
    featured: false,
    points: [
      'Instant YouTube video, Shorts & Live VOD links',
      'All 10 caption templates included',
      'Gemini AI viral moment detection',
      'Browser project persistence & Live Clipper',
    ],
  },
  {
    name: 'Creator Pro',
    price: '$29',
    cadence: 'per month',
    description: 'For daily YouTube, podcast, and social creators.',
    cta: 'Get Started',
    featured: true,
    points: [
      '180 AI analysis minutes / month',
      '9:16 vertical, 1:1 square & 16:9 framing',
      'Word-level English, Hindi & Hinglish captions',
      'Optional reaction effects & licensed SFX cues',
    ],
  },
  {
    name: 'Studio Team',
    price: '$79',
    cadence: 'per month',
    description: 'For agencies and multi-channel editing desks.',
    cta: 'Start Creating',
    featured: false,
    points: [
      '600 AI analysis minutes / month',
      'Live Clipper & Saved Clips library',
      'Brand typography & custom caption presets',
      'Priority queue & workspace export archive',
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'Do I need to install desktop editing software?',
    a: 'No. ClipForge AI runs completely in modern desktop and mobile browsers—just paste a YouTube link and start generating clips right away.',
  },
  {
    q: 'How does the AI select clips from a YouTube video?',
    a: 'When you paste a YouTube URL, our server inspects video metadata and sends the requested time window to Gemini AI to identify hooks, funny moments, and clean start/end timestamps.',
  },
  {
    q: 'Can I customize caption colors, fonts, and positions?',
    a: 'Yes. You can switch across 10 studio templates and independently customize font family, font size, text color, keyword highlight color, background box, outline, shadow, alignment, and vertical position.',
  },
  {
    q: 'What YouTube link formats are supported?',
    a: 'ClipForge AI supports standard YouTube watch URLs, shortened youtu.be links, YouTube Shorts, and archived YouTube Live VODs.',
  },
];

export function LandingPage({
  onStartCreating,
  onOpenTemplates,
  onGenerateFromYouTubeUrl,
}: LandingPageProps) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroYtUrl, setHeroYtUrl] = useState('');
  const [heroYtError, setHeroYtError] = useState<string | null>(null);

  // Interactive studio product preview state
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [studioPlaying, setStudioPlaying] = useState(true);
  const [studioTick, setStudioTick] = useState(0);
  const [studioRatio, setStudioRatio] = useState<AspectRatio>('9:16');
  const [studioTemplateId, setStudioTemplateId] = useState<CaptionTemplateId>('bold-viral');
  const [playheadPct, setPlayheadPct] = useState(34);

  const activeDemoClip = STUDIO_DEMO_CLIPS[activeClipIdx];
  const activeTemplate =
    CAPTION_TEMPLATES.find((t) => t.id === studioTemplateId) || CAPTION_TEMPLATES[0];

  useEffect(() => {
    if (!studioPlaying) return;
    const id = window.setInterval(() => {
      setStudioTick((prev) => prev + 1);
      setPlayheadPct((prev) => (prev >= 94 ? 12 : prev + 2));
    }, 650);
    return () => window.clearInterval(id);
  }, [studioPlaying]);

  const handleSelectDemoClip = (idx: number) => {
    setActiveClipIdx(idx);
    setStudioTemplateId(STUDIO_DEMO_CLIPS[idx].templateId);
    setPlayheadPct(22 + idx * 24);
  };

  const handleHeroYouTubeSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = heroYtUrl.trim();
    if (!trimmed) {
      setHeroYtError('Paste a YouTube link (watch, Shorts, or Live VOD) to generate clips.');
      return;
    }
    const classified = classifyVideoUrl(trimmed);
    if (classified.status !== 'youtube') {
      setHeroYtError(
        'Enter a valid YouTube link such as youtube.com/watch?v=..., youtube.com/live/..., or youtu.be/...'
      );
      return;
    }
    setHeroYtError(null);
    onGenerateFromYouTubeUrl(trimmed);
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#171717]">
      {/* Sticky Minimal Navigation */}
      <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E5E5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a
            href="#top"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded-lg"
          >
            <BrandMark />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#525252]">
            <a href="#features" className="hover:text-[#171717] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#171717] transition-colors">
              How It Works
            </a>
            <a href="#templates" className="hover:text-[#171717] transition-colors">
              Templates
            </a>
            <a href="#pricing" className="hover:text-[#171717] transition-colors">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onStartCreating}
              className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-medium text-[#171717] hover:bg-[#F5F5F5] transition-colors whitespace-nowrap"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onStartCreating}
              data-testid="landing-get-started-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <span>Get Started</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO SECTION */}
        <section className="pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 bg-[#FFFFFF]">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
                AI YouTube Clipping Studio
              </p>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.08] text-[#171717] text-balance">
                Paste a YouTube Link.
                <br />
                Generate <span className="text-[#DC2626]">Viral Shorts.</span>
              </h1>
              <p className="text-base sm:text-lg text-[#737373] max-w-2xl mx-auto leading-relaxed">
                Drop any YouTube video, podcast, or livestream VOD link. Gemini AI finds the best
                hooks, funny moments, and punchlines with ready-to-edit captions—no file upload
                required.
              </p>

              {/* Hero YouTube Link Generator Form */}
              <form
                onSubmit={handleHeroYouTubeSubmit}
                className="max-w-2xl mx-auto pt-2 space-y-2.5"
                noValidate
              >
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] shadow-[0_10px_30px_-14px_rgba(23,23,23,0.12)] focus-within:border-[#DC2626] transition-colors">
                  <label htmlFor="landing-yt-url-input" className="sr-only">
                    YouTube Video Link
                  </label>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-1.5">
                    <Link2 className="h-4 w-4 text-[#DC2626] shrink-0" />
                    <input
                      id="landing-yt-url-input"
                      data-testid="landing-yt-url-input"
                      type="url"
                      value={heroYtUrl}
                      onChange={(e) => {
                        setHeroYtUrl(e.target.value);
                        if (heroYtError) setHeroYtError(null);
                      }}
                      placeholder="Paste a YouTube link (watch, live, or shorts)..."
                      className="w-full bg-transparent text-sm text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="landing-yt-generate-btn"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors shadow-xs whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Generate Clips</span>
                  </button>
                </div>

                {heroYtError ? (
                  <div
                    role="alert"
                    data-testid="landing-yt-error"
                    className="inline-flex items-center gap-2 text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-[#DC2626] shrink-0" />
                    <span>{heroYtError}</span>
                  </div>
                ) : (
                  <p className="text-xs text-[#737373]">
                    Supports YouTube watch, Shorts, and Live VOD links · No video upload required
                  </p>
                )}
              </form>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onStartCreating}
                  data-testid="landing-start-creating-btn"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#DC2626]" />
                </button>
                <button
                  type="button"
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-[#737373] hover:text-[#171717] transition-colors whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5 text-[#DC2626]" />
                  <span>Interactive Walkthrough</span>
                </button>
              </div>
            </div>

            {/* 9:16 REEL CIRCLE ANIMATION SHOWCASE — Real-Time Creator Reels */}
            <ReelCircleShowcase onGenerateFromYouTubeUrl={onGenerateFromYouTubeUrl} />

            {/* PRODUCT VISUAL SHOWCASE — Realistic Interactive ClipForge Studio */}
            <div className="mt-14 rounded-2xl bg-[#FAFAFA] border border-[#E5E5E5] shadow-[0_12px_40px_-16px_rgba(23,23,23,0.1)] overflow-hidden">
              {/* Studio Window Top Bar */}
              <div className="px-4 sm:px-5 py-3 bg-[#FFFFFF] border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E5E5E5]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E5E5E5]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E5E5E5]" />
                  </div>
                  <span className="text-xs font-medium text-[#171717] truncate">
                    youtube.com/watch?v=founder-podcast-ep42
                  </span>
                  <span className="hidden sm:inline text-xs text-[#737373] font-mono tabular-nums">
                    48:15 · YouTube VOD
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-lg bg-[#F5F5F5] p-0.5 border border-[#E5E5E5]">
                    {(['9:16', '1:1', '16:9'] as AspectRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setStudioRatio(ratio)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-colors ${
                          studioRatio === ratio
                            ? 'bg-[#FFFFFF] text-[#DC2626] shadow-2xs'
                            : 'text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={onStartCreating}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export MP4</span>
                  </button>
                </div>
              </div>

              {/* Studio Main Split */}
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Left: AI Clip Suggestions */}
                <div className="lg:col-span-4 bg-[#FFFFFF] border-b lg:border-b-0 lg:border-r border-[#E5E5E5] p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
                      AI Clip Suggestions
                    </p>
                    <span className="text-xs font-mono text-[#DC2626] font-medium">3 moments</span>
                  </div>

                  <div className="space-y-2">
                    {STUDIO_DEMO_CLIPS.map((item, idx) => {
                      const selected = idx === activeClipIdx;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectDemoClip(idx)}
                          className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                            selected
                              ? 'bg-[#FEF2F2] border-[#DC2626]'
                              : 'bg-[#FFFFFF] border-[#E5E5E5] hover:bg-[#FAFAFA]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                            <span className={selected ? 'text-[#DC2626] font-semibold' : 'text-[#737373]'}>
                              {item.category}
                            </span>
                            <span className="text-[#171717] font-semibold">
                              Score {item.score}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-[#171717] mt-1 leading-snug">
                            {item.title}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-[#737373] mt-1">
                            {item.timecode} · {item.duration}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Center: Vertical Video Canvas */}
                <div className="lg:col-span-4 bg-[#F5F5F5] p-6 flex flex-col items-center justify-center gap-4">
                  <div
                    className={`relative w-full overflow-hidden rounded-xl bg-[#171717] border border-[#E5E5E5] shadow-md transition-all ${
                      studioRatio === '9:16'
                        ? 'max-w-[216px] aspect-[9/16]'
                        : studioRatio === '1:1'
                          ? 'max-w-[280px] aspect-square'
                          : 'max-w-[340px] aspect-video'
                    }`}
                  >
                    {/* Minimal Studio Backdrop Graphic */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#262626] via-[#1C1C1C] to-[#0F0F0F]" />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-6 top-[18%] h-24 rounded-full bg-white/[0.04] blur-2xl"
                    />
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between text-[10px] font-mono tabular-nums text-white/80">
                      <span className="px-1.5 py-0.5 rounded bg-black/55">
                        {activeDemoClip.timecode}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-black/55">{studioRatio}</span>
                    </div>

                    <CaptionRenderer
                      templateId={activeTemplate.id}
                      text={activeDemoClip.caption}
                      fontFamily={activeTemplate.defaultFontFamily}
                      fontSize={activeTemplate.defaultFontSize}
                      fontColor={activeTemplate.defaultFontColor}
                      highlightColor={activeTemplate.defaultHighlightColor}
                      backgroundColor={activeTemplate.defaultBackgroundColor}
                      backgroundOpacity={activeTemplate.defaultBackgroundOpacity}
                      outlineWidth={activeTemplate.defaultOutlineWidth}
                      outlineColor={activeTemplate.defaultOutlineColor}
                      shadowStyle={activeTemplate.defaultShadowStyle}
                      position={studioRatio === '9:16' ? 'center' : 'bottom'}
                      activeWordIndex={studioTick}
                      compact
                    />

                    <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setStudioPlaying((p) => !p)}
                        aria-label={studioPlaying ? 'Pause studio preview' : 'Play studio preview'}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 hover:bg-[#DC2626] text-white backdrop-blur-sm transition-colors"
                      >
                        {studioPlaying ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5 ml-0.5" />
                        )}
                      </button>
                      <span className="text-[10px] font-mono text-white/80 bg-black/50 px-2 py-0.5 rounded">
                        {activeTemplate.name}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Live Editing Controls */}
                <div className="lg:col-span-4 bg-[#FFFFFF] border-t lg:border-t-0 lg:border-l border-[#E5E5E5] p-4 sm:p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#737373]">
                        Caption Style
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-2.5">
                        {(['bold-viral', 'podcast-pro', 'karaoke', 'minimal-white'] as CaptionTemplateId[]).map(
                          (tplId) => {
                            const tpl = CAPTION_TEMPLATES.find((t) => t.id === tplId)!;
                            const active = studioTemplateId === tplId;
                            return (
                              <button
                                key={tplId}
                                type="button"
                                onClick={() => setStudioTemplateId(tplId)}
                                className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-colors ${
                                  active
                                    ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                                    : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#171717] hover:bg-[#FAFAFA]'
                                }`}
                              >
                                {tpl.name}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#737373]">Framing Mode</span>
                        <span className="font-medium text-[#171717]">Face-Centered Smart Crop</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#737373]">Caption Sync</span>
                        <span className="font-mono text-[#171717]">Word-level</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#737373]">Export Output</span>
                        <span className="font-mono text-[#171717]">1080p MP4 (H.264)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onStartCreating}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors"
                  >
                    <span>Try With Your Own Video</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Studio Multi-Track Timeline Strip */}
              <div className="px-4 sm:px-5 py-3.5 bg-[#FFFFFF] border-t border-[#E5E5E5] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#737373]">
                  <span>TIMELINE · VIDEO / AUDIO / CAPTIONS</span>
                  <span>{activeDemoClip.timecode}</span>
                </div>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Interactive demo timeline scrubber"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={playheadPct}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(2, Math.min(98, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
                    setPlayheadPct(pct);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') setPlayheadPct((p) => Math.min(98, p + 4));
                    if (e.key === 'ArrowLeft') setPlayheadPct((p) => Math.max(2, p - 4));
                  }}
                  className="relative rounded-lg bg-[#FAFAFA] border border-[#E5E5E5] p-2 space-y-1.5 cursor-pointer select-none"
                >
                  <div className="h-3 rounded bg-[#E5E5E5]/80 overflow-hidden flex gap-1 px-0.5">
                    <div className="w-[26%] h-full bg-[#D4D4D4] rounded-xs" />
                    <div className="w-[44%] h-full bg-[#171717]/80 rounded-xs" />
                    <div className="w-[28%] h-full bg-[#D4D4D4] rounded-xs" />
                  </div>
                  <div className="h-2.5 rounded bg-[#F5F5F5] flex items-center gap-0.5 px-1">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <span
                        key={i}
                        className="flex-1 bg-[#A3A3A3] rounded-full"
                        style={{ height: `${30 + ((i * 37) % 65)}%` }}
                      />
                    ))}
                  </div>
                  <div className="h-2.5 rounded bg-[#FEF2F2] border border-[#FECACA] flex items-center gap-2 px-2">
                    <span className="h-1.5 w-1/4 rounded-full bg-[#DC2626]/70" />
                    <span className="h-1.5 w-1/3 rounded-full bg-[#DC2626]" />
                    <span className="h-1.5 w-1/5 rounded-full bg-[#DC2626]/70" />
                  </div>

                  {/* Playhead */}
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[#DC2626] transition-[left] duration-300"
                    style={{ left: `${playheadPct}%` }}
                  >
                    <span className="block -ml-[4px] -mt-0.5 h-2.5 w-2.5 rounded-full bg-[#DC2626] border-2 border-white shadow-xs" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES SECTION */}
        <section
          id="features"
          className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FAFAFA] border-y border-[#E5E5E5]"
        >
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
                Studio Capabilities
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#171717] text-balance">
                Everything you need to turn long recordings into ready-to-post shorts.
              </h2>
              <p className="text-sm sm:text-base text-[#737373] leading-relaxed">
                Built for creators, podcasters, and editing teams who want precision without bloated
                desktop timelines.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((feat) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-3 hover:border-[#D4D4D4] transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-[#FEF2F2] border border-[#FECACA]/70 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-[#DC2626]" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#171717]">
                      {feat.title}
                    </h3>
                    <p className="text-sm text-[#737373] leading-relaxed">{feat.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FFFFFF]">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
                How It Works
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#171717] text-balance">
                From raw recording to finished MP4 in three steps.
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {WORKFLOW_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="rounded-2xl bg-[#FAFAFA] border border-[#E5E5E5] p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-[#DC2626]">
                        STEP {step.number}
                      </span>
                      <Icon className="h-4 w-4 text-[#737373]" />
                    </div>
                    <h3 className="font-display text-lg font-semibold text-[#171717]">
                      {step.title}
                    </h3>
                    <p className="text-sm text-[#737373] leading-relaxed">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CAPTION TEMPLATES PREVIEW */}
        <section
          id="templates"
          className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FAFAFA] border-y border-[#E5E5E5]"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
                  Caption Templates
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#171717] text-balance">
                  10 studio caption styles, fully customizable.
                </h2>
                <p className="text-sm text-[#737373]">
                  Video subtitle colors remain independently customizable so every channel keeps its
                  signature look.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenTemplates()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] whitespace-nowrap self-start sm:self-auto transition-colors"
              >
                <span>Browse All 10 Templates</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#DC2626]" />
              </button>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {CAPTION_TEMPLATES.slice(0, 4).map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] overflow-hidden flex flex-col justify-between"
                >
                  <div className="relative h-44 bg-[#171717] overflow-hidden">
                    <CaptionRenderer
                      templateId={tpl.id}
                      text={tpl.sampleLine}
                      fontFamily={tpl.defaultFontFamily}
                      fontSize={tpl.defaultFontSize}
                      fontColor={tpl.defaultFontColor}
                      highlightColor={tpl.defaultHighlightColor}
                      backgroundColor={tpl.defaultBackgroundColor}
                      backgroundOpacity={tpl.defaultBackgroundOpacity}
                      outlineWidth={tpl.defaultOutlineWidth}
                      outlineColor={tpl.defaultOutlineColor}
                      shadowStyle={tpl.defaultShadowStyle}
                      position="center"
                      activeWordIndex={studioTick}
                      compact
                    />
                  </div>
                  <div className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-semibold text-[#171717] truncate">
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-[#737373] truncate">{tpl.bestFor}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenTemplates(tpl.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-[#FEF2F2] hover:text-[#DC2626] border border-[#E5E5E5] text-xs font-medium text-[#171717] whitespace-nowrap transition-colors"
                    >
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING PREVIEW */}
        <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FFFFFF]">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl mx-auto text-center space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">
                Pricing
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#171717] text-balance">
                Simple studio plans that scale with your output.
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-2xl p-6 flex flex-col justify-between border ${
                    tier.featured
                      ? 'bg-[#FFFFFF] border-[#DC2626] shadow-[0_10px_30px_-14px_rgba(220,38,38,0.18)]'
                      : 'bg-[#FAFAFA] border-[#E5E5E5]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-semibold text-[#171717]">
                        {tier.name}
                      </h3>
                      {tier.featured && (
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#DC2626]">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-3xl font-bold tabular-nums text-[#171717]">
                        {tier.price}
                      </span>
                      <span className="text-xs text-[#737373]">/ {tier.cadence}</span>
                    </div>
                    <p className="text-xs text-[#737373] leading-relaxed">{tier.description}</p>

                    <ul className="space-y-2.5 pt-2 border-t border-[#E5E5E5]">
                      {tier.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-xs text-[#171717]">
                          <Check className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={onStartCreating}
                    className={`mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors ${
                      tier.featured
                        ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white'
                        : 'bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717]'
                    }`}
                  >
                    {tier.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#FAFAFA] border-t border-[#E5E5E5]">
          <div className="max-w-3xl mx-auto">
            <div className="text-center space-y-2 mb-10">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#DC2626]">FAQ</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-[#171717]">
                Common questions
              </h2>
            </div>

            <div className="space-y-2.5">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={item.q}
                    className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-semibold text-[#171717] hover:bg-[#FAFAFA] transition-colors"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-[#737373] shrink-0 transition-transform ${
                          isOpen ? 'rotate-180 text-[#DC2626]' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 text-sm text-[#737373] leading-relaxed border-t border-[#F5F5F5] pt-3">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* QUIET EDITORIAL FOOTER */}
      <footer className="bg-[#FFFFFF] border-t border-[#E5E5E5] py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandMark size="sm" />
          <p className="text-xs text-[#737373]">
            © {new Date().getFullYear()} ClipForge AI · Browser-based AI video clipping studio.
          </p>
          <button
            type="button"
            onClick={onStartCreating}
            className="text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] transition-colors"
          >
            Open Workspace →
          </button>
        </div>
      </footer>

      <DemoModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onStartCreating={onStartCreating}
      />
    </div>
  );
}
