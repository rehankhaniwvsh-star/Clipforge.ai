import {
  AspectRatio,
  CaptionTemplateId,
  ClipCategory,
  ClipGenerationConfig,
  ClipItem,
  VideoProject,
} from '../types/clipforge';
import { clampTrimRange } from './timecode';
import { classifyVideoUrl, ClassifiedVideoUrl } from './urlImport';

export type UrlValidationResult = ClassifiedVideoUrl;

export function validateVideoUrl(rawUrl: string): UrlValidationResult {
  return classifyVideoUrl(rawUrl);
}

const CATEGORY_TITLE_SEEDS: Record<ClipCategory, string[]> = {
  'Funny Moments': [
    'Unexpected Studio Laugh Break',
    'When the Plan Goes Completely Sideways',
    'Unfiltered Hot Take Caught on Mic',
    'Deadpan Comeback That Stole the Room',
    'Off-Script Moment Everyone Replayed',
    'The Punchline Nobody Saw Coming',
    'Host Loses It Mid-Sentence',
    'Instant Regret After Saying That Live',
    'Chaotic Tangent Worth Every Second',
    'Mic-Drop Reaction in Real Time',
  ],
  'Interesting Moments': [
    'The Counterintuitive Shift Most Creators Miss',
    'Why Small Tweaks Beat Big Overhauls',
    'Behind-the-Scenes Breakdown of the Process',
    'A Surprising Metric That Changed Strategy',
    'The Turning Point in the Conversation',
    'Hidden Pattern Revealed in 30 Seconds',
    'One Story That Reframed the Whole Topic',
    'Rare Honest Take on Building Consistency',
    'The Question That Made Everyone Pause',
    'Key Insight From the Second Half',
  ],
  Educational: [
    '3-Step Framework Explained Simply',
    'Common Mistake and How to Fix It Fast',
    'Core Principle Broken Down Clearly',
    'Practical Checklist You Can Apply Today',
    'Why Most Workflows Bottleneck Here',
    'Visual Walkthrough of the Core System',
    'Quick Mental Model for Faster Decisions',
    'Step-by-Step Guide in Under a Minute',
    'Essential Rule Every Beginner Should Know',
    'Before-and-After Breakdown Explained',
  ],
  Podcast: [
    'Candid Founder Story on Scaling Up',
    'Deep-Dive Exchange Between Both Hosts',
    'Most Quotable Minute of the Episode',
    'Honest Debate on Creative Trade-Offs',
    'Audience Q&A Highlight Segment',
    'Guest Shares Their Hardest Lesson',
    'Unedited Insight From the Studio Table',
    'Rapid-Fire Advice Worth Bookmarking',
    'Defining Moment of Episode Discussion',
    'Closing Takeaway That Landed Hard',
  ],
  Gaming: [
    'Clutch Last-Second Play Breakdown',
    'Impossible Comeback Under Pressure',
    'Split-Second Decision That Won the Round',
    'Live Comms Reaction to the Play',
    'High-Speed Sequence Caught Frame by Frame',
    'Why That Rotation Caught Everyone Off Guard',
    'Zero-Margin Endgame Finish',
    'Tactical Callout That Flipped Momentum',
    'Unbelievable Timing on the Final Push',
    'Post-Match Breakdown of the Highlight',
  ],
  Reactions: [
    'First-Time Live Reaction to the Reveal',
    'Jaw-Drop Moment Caught in Real Time',
    'Honest Unfiltered First Impressions',
    'Immediate Breakdown After Watching That',
    'Wait Until You See the Twist Here',
    'Genuine Surprise Halfway Through',
    'Pausing to Process What Just Happened',
    'Instant Commentary on the Big Moment',
    'Live Audience Energy Spikes Right Here',
    'Unscripted Reaction Worth Rewatching',
  ],
  'Automatic Selection': [
    'High-Pacing Opening Hook Segment',
    'Peak Conversation Energy Window',
    'Strongest Standalone Story Arc',
    'Mid-Video Highlight Cut',
    'Punchy Exchange With Clear Payoff',
    'Clean Topical Summary Segment',
    'High-Clarity Key Takeaway Cut',
    'Dynamic Pacing Transition Window',
    'Memorable Closing Highlight',
    'Balanced Standalone Short Cut',
  ],
};

const CATEGORY_CAPTIONS: Record<ClipCategory, string[]> = {
  'Funny Moments': [
    'Wait, did we actually just record that on the main mic?',
    'I promised myself I would stay professional for at least five minutes.',
    'Nobody in the studio saw that comeback coming.',
  ],
  'Interesting Moments': [
    'The biggest shift happened when we stopped chasing vanity metrics.',
    'Most teams overcomplicate step one and skip the feedback loop.',
    'Once you see this pattern, you cannot unsee it.',
  ],
  Educational: [
    'Here is the exact three-step checklist we use before publishing.',
    'Fix your opening three seconds first before touching anything else.',
    'Keep one clear idea per clip so viewers actually finish it.',
  ],
  Podcast: [
    'The hardest part of building in public is staying consistent on quiet weeks.',
    'Every great episode has one three-minute stretch that carries the show.',
    'We tested this format for thirty days and tracked every retention drop.',
  ],
  Gaming: [
    'One health left, zero utility, and somehow the angle still held.',
    'Listen to the comms right as the timer hits three seconds.',
    'That single rotation completely flipped the final round.',
  ],
  Reactions: [
    'Hold on—rewind that five seconds, I missed the detail the first time.',
    'That transition was way cleaner than I expected.',
    'Okay, I genuinely did not think they were going to pull that off.',
  ],
  'Automatic Selection': [
    'Start with the payoff first, then walk back through how it happened.',
    'Short clips work best when every sentence earns the next second.',
    'This segment stands completely on its own without extra context.',
  ],
};

export function estimateCreditCostMinutes(durationSeconds: number, clipCount: number): number {
  const sourceMins = Math.max(1, Math.ceil(durationSeconds / 60));
  return Math.max(1, Math.min(sourceMins + Math.floor(clipCount / 3), 30));
}

export function generateSegmentsFromVideo(params: {
  projectId: string;
  sourceDuration: number;
  config: ClipGenerationConfig;
  thumbnailUrl: string;
  videoUrl?: string;
  isLocalMedia?: boolean;
  defaultTemplateId: CaptionTemplateId;
  createdAt?: string;
}): ClipItem[] {
  const {
    projectId,
    sourceDuration,
    config,
    thumbnailUrl,
    videoUrl,
    isLocalMedia,
    defaultTemplateId,
    createdAt = new Date().toISOString(),
  } = params;

  const safeSource = Math.max(15, Number.isFinite(sourceDuration) ? sourceDuration : 120);
  const clipLength = Math.min(config.duration, safeSource);
  const count = config.count;
  const maxStart = Math.max(0, safeSource - clipLength);

  const titles = CATEGORY_TITLE_SEEDS[config.category];
  const captions = CATEGORY_CAPTIONS[config.category];

  const clips: ClipItem[] = [];
  for (let i = 0; i < count; i += 1) {
    // Space clips evenly across the video timeline with subtle offset away from exact 0s if room allows
    let rawStart = 0;
    if (maxStart > 0) {
      const margin = Math.min(maxStart * 0.08, 6);
      const span = Math.max(0, maxStart - margin * 2);
      const denominator = Math.max(1, count - 1);
      rawStart = margin + (span * i) / denominator;
    }

    const clamped = clampTrimRange(rawStart, rawStart + clipLength, safeSource, Math.min(5, safeSource));
    // Deterministic ranking score between 76 and 96 (descending with gentle variation)
    const engagementScore = Math.max(72, Math.min(97, 95 - i * 2 + (i % 2 === 0 ? 1 : -1)));

    clips.push({
      id: `${projectId}-clip-${i + 1}`,
      projectId,
      title: titles[i % titles.length],
      startTime: clamped.startTime,
      endTime: clamped.endTime,
      sourceDuration: safeSource,
      category: config.category,
      engagementScore,
      thumbnailUrl,
      videoUrl,
      isLocalMedia,
      createdAt,
      editor: {
        templateId: defaultTemplateId,
        captionText: captions[i % captions.length],
        textPosition: 'bottom',
        verticalOffset: 0,
        fontSize: 24,
        fontColor: '#FFFFFF',
        highlightColor: '#8B5CF6',
        zoom: 100,
        cropX: 0,
        cropY: 0,
        aspectRatio: config.aspectRatio,
        soundEffect: i === 0 ? 'whoosh' : 'none',
        sfxVolume: 65,
      },
    });
  }

  return clips;
}

export function filterAndSortClips(
  clips: ClipItem[],
  options: {
    projectId?: string | 'all';
    category?: ClipCategory | 'all';
    search?: string;
    sortBy?: 'engagement' | 'timestamp' | 'duration';
  }
): ClipItem[] {
  const { projectId = 'all', category = 'all', search = '', sortBy = 'engagement' } = options;
  const query = search.trim().toLowerCase();

  const filtered = clips.filter((clip) => {
    if (projectId !== 'all' && clip.projectId !== projectId) return false;
    if (category !== 'all' && clip.category !== category) return false;
    if (query) {
      const haystack = `${clip.title} ${clip.category} ${clip.editor.captionText}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === 'engagement') return b.engagementScore - a.engagementScore;
    if (sortBy === 'timestamp') return a.startTime - b.startTime;
    return (b.endTime - b.startTime) - (a.endTime - a.startTime);
  });
}

export function computeDashboardMetrics(projects: VideoProject[], clips: ClipItem[], availableCreditsMinutes: number) {
  return {
    totalVideos: projects.length,
    generatedClips: clips.length,
    processingProjects: projects.filter((p) => p.status === 'Processing').length,
    availableCreditsMinutes,
  };
}

export function getAspectRatioClass(ratio: AspectRatio): string {
  switch (ratio) {
    case '9:16':
      return 'aspect-[9/16]';
    case '1:1':
      return 'aspect-square';
    case '16:9':
      return 'aspect-video';
  }
}
