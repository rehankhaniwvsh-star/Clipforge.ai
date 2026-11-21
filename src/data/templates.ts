import {
  AspectRatio,
  CaptionFontFamily,
  CaptionLanguageMode,
  CaptionTemplateConfig,
  CaptionTemplateId,
  ClipCategory,
  ClipCountOption,
  ClipDurationOption,
  ReactionEffectType,
  SoundEffectId,
  VideoCropMode,
} from '../types/clipforge';

export const CLIP_CATEGORIES: Array<{ value: ClipCategory; description: string }> = [
  { value: 'Funny Moments', description: 'Punchlines, laughter spikes, and light banter' },
  { value: 'Interesting Moments', description: 'Surprising claims, stories, and memorable insights' },
  { value: 'Educational', description: 'Actionable steps, frameworks, and clear explanations' },
  { value: 'Podcast', description: 'Host-guest exchanges and quotable studio dialogue' },
  { value: 'Gaming', description: 'Fast plays, clutch sequences, and live comms' },
  { value: 'Reactions', description: 'Expressive commentary and live first impressions' },
  { value: 'Automatic Selection', description: 'Balanced pacing across the full video timeline' },
];

export const CLIP_DURATIONS: ClipDurationOption[] = [15, 30, 45, 60];

export const CLIP_COUNTS: ClipCountOption[] = [3, 5, 10];

export const ASPECT_RATIOS: Array<{ value: AspectRatio; label: string; platforms: string }> = [
  { value: '9:16', label: '9:16 Vertical', platforms: 'Shorts, Reels, TikTok' },
  { value: '1:1', label: '1:1 Square', platforms: 'LinkedIn, X, Feeds' },
  { value: '16:9', label: '16:9 Landscape', platforms: 'YouTube, Web Embeds' },
];

export const VIDEO_CROP_MODES: Array<{
  value: VideoCropMode;
  label: string;
  description: string;
}> = [
  { value: 'smart', label: 'Smart Crop', description: 'Auto-balanced subject framing with subtle headroom' },
  { value: 'center', label: 'Center Crop', description: 'Exact geometric center fill across the output frame' },
  { value: 'background-blur', label: 'Background Blur', description: 'Full uncropped video centered over a blurred backdrop' },
  { value: 'face-centered', label: 'Face-Centered', description: 'Locks framing onto detected speaker face anchor' },
  { value: 'manual', label: 'Manual Crop', description: 'Custom zoom scale with horizontal and vertical pan' },
];

export const CAPTION_FONTS: Array<{
  value: CaptionFontFamily;
  label: string;
  note: string;
}> = [
  { value: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', note: 'Modern SaaS bold' },
  { value: 'Montserrat', label: 'Montserrat', note: 'Viral Shorts punch' },
  { value: 'Oswald', label: 'Oswald Condensed', note: 'Tall meme / impact' },
  { value: 'Inter', label: 'Inter', note: 'Clean studio subtitles' },
  { value: 'Space Grotesk', label: 'Space Grotesk', note: 'Tech & gaming display' },
  { value: 'Georgia', label: 'Georgia Serif', note: 'Cinematic film look' },
  { value: 'Noto Sans Devanagari', label: 'Noto Sans Devanagari', note: 'Hindi & Hinglish crisp script' },
];

export const CAPTION_LANGUAGES: Array<{
  value: CaptionLanguageMode;
  label: string;
  sample: string;
}> = [
  { value: 'auto', label: 'Auto Detect', sample: 'Matches spoken language automatically' },
  { value: 'english', label: 'English', sample: 'Natural English with punctuation' },
  { value: 'hindi', label: 'Hindi (हिन्दी)', sample: 'Devanagari Hindi captions' },
  { value: 'hinglish', label: 'Hinglish', sample: 'Conversational Roman Hindi + English' },
];

export const COLOR_POP_PALETTE = [
  '#8B5CF6',
  '#FACC15',
  '#3B82F6',
  '#34D399',
  '#F43F5E',
  '#FB923C',
];

export const GAMING_PALETTE = ['#3B82F6', '#22D3EE', '#A855F7', '#FACC15', '#F43F5E'];

export const CAPTION_TEMPLATES: CaptionTemplateConfig[] = [
  {
    id: 'bold-viral',
    name: 'Bold Viral',
    subtitle: 'Large bold white text with highlighted keywords',
    bestFor: 'Hooks, Reactions, High-Energy Shorts',
    defaultFontFamily: 'Montserrat',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#FACC15',
    defaultBackgroundColor: '#000000',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 3,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'strong',
    defaultFontSize: 28,
    defaultPosition: 'center',
    sampleLine: 'THIS ONE CHANGE DOUBLED RETENTION',
  },
  {
    id: 'podcast-pro',
    name: 'Podcast Pro',
    subtitle: 'Clean white subtitles with selected yellow keywords',
    bestFor: 'Interviews, Video Podcasts, Founder Clips',
    defaultFontFamily: 'Inter',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#FACC15',
    defaultBackgroundColor: '#09090B',
    defaultBackgroundOpacity: 82,
    defaultOutlineWidth: 0,
    defaultOutlineColor: '#000000',
    defaultShadowStyle: 'soft',
    defaultFontSize: 22,
    defaultPosition: 'bottom',
    sampleLine: 'Consistency beats intensity every single week.',
  },
  {
    id: 'color-highlight',
    name: 'Color Pop',
    subtitle: 'Different highlight colors for important words',
    bestFor: 'Educational Walkthroughs, Lists, Explainers',
    defaultFontFamily: 'Montserrat',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#8B5CF6',
    defaultBackgroundColor: '#09090B',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 2,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'strong',
    defaultFontSize: 24,
    defaultPosition: 'bottom',
    sampleLine: 'Fix the first three seconds before anything else',
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    subtitle: 'Word-by-word highlighting synchronized with speech',
    bestFor: 'Storytelling, Comedy Bits, Music Commentary',
    defaultFontFamily: 'Plus Jakarta Sans',
    defaultFontColor: '#A1A1AA',
    defaultHighlightColor: '#3B82F6',
    defaultBackgroundColor: '#09090B',
    defaultBackgroundOpacity: 50,
    defaultOutlineWidth: 1,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'soft',
    defaultFontSize: 25,
    defaultPosition: 'bottom',
    sampleLine: 'Watch how the timing shifts right on the beat',
  },
  {
    id: 'minimal-white',
    name: 'Minimal',
    subtitle: 'Simple white text with subtle shadow',
    bestFor: 'Design Talks, Documentaries, Calm Narration',
    defaultFontFamily: 'Inter',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#E4E4E7',
    defaultBackgroundColor: '#000000',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 0,
    defaultOutlineColor: '#000000',
    defaultShadowStyle: 'soft',
    defaultFontSize: 20,
    defaultPosition: 'bottom',
    sampleLine: 'Good editing feels invisible to the viewer.',
  },
  {
    id: 'meme-style',
    name: 'Meme',
    subtitle: 'Bold text with expressive emphasis',
    bestFor: 'Funny Moments, Relatable Sketches, Social Feeds',
    defaultFontFamily: 'Oswald',
    defaultFontColor: '#09090B',
    defaultHighlightColor: '#8B5CF6',
    defaultBackgroundColor: '#FFFFFF',
    defaultBackgroundOpacity: 96,
    defaultOutlineWidth: 0,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'soft',
    defaultFontSize: 23,
    defaultPosition: 'top',
    sampleLine: 'POV: You forgot to hit record on the audio track',
  },
  {
    id: 'gaming',
    name: 'Gaming',
    subtitle: 'High-energy captions with colorful highlights',
    bestFor: 'Clutch Plays, Stream Highlights, Live Comms',
    defaultFontFamily: 'Space Grotesk',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#3B82F6',
    defaultBackgroundColor: '#09090B',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 3,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'strong',
    defaultFontSize: 26,
    defaultPosition: 'center',
    sampleLine: 'ONE HP LEFT AND HE STILL WON THE ROUND',
  },
  {
    id: 'neon',
    name: 'Neon',
    subtitle: 'Glowing text and subtle effects',
    bestFor: 'Late-Night Streams, Tech Drops, Music Reels',
    defaultFontFamily: 'Space Grotesk',
    defaultFontColor: '#F5F3FF',
    defaultHighlightColor: '#A78BFA',
    defaultBackgroundColor: '#09090B',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 1,
    defaultOutlineColor: '#4C1D95',
    defaultShadowStyle: 'strong',
    defaultFontSize: 25,
    defaultPosition: 'center',
    sampleLine: 'BUILT FOR CREATORS WHO SHIP DAILY',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    subtitle: 'Elegant subtitles near the bottom',
    bestFor: 'Mini-Docs, Trailers, Essay Films',
    defaultFontFamily: 'Georgia',
    defaultFontColor: '#F4F4F5',
    defaultHighlightColor: '#FDE68A',
    defaultBackgroundColor: '#000000',
    defaultBackgroundOpacity: 42,
    defaultOutlineWidth: 0,
    defaultOutlineColor: '#000000',
    defaultShadowStyle: 'soft',
    defaultFontSize: 18,
    defaultPosition: 'bottom',
    sampleLine: 'Every frame earns its place in the final cut.',
  },
  {
    id: 'word-by-word',
    name: 'Word by Word',
    subtitle: 'Animated individual words',
    bestFor: 'Fast Hooks, Debate Clips, Retention Sprints',
    defaultFontFamily: 'Montserrat',
    defaultFontColor: '#FFFFFF',
    defaultHighlightColor: '#8B5CF6',
    defaultBackgroundColor: '#000000',
    defaultBackgroundOpacity: 0,
    defaultOutlineWidth: 3,
    defaultOutlineColor: '#09090B',
    defaultShadowStyle: 'strong',
    defaultFontSize: 34,
    defaultPosition: 'center',
    sampleLine: 'Stop scrolling and listen closely to this.',
  },
];

export const TEMPLATE_BY_ID: Record<CaptionTemplateId, CaptionTemplateConfig> = CAPTION_TEMPLATES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<CaptionTemplateId, CaptionTemplateConfig>
);

export const REACTION_EFFECT_META: Record<
  ReactionEffectType,
  { label: string; shortDesc: string; defaultDuration: number; defaultIntensity: number }
> = {
  'quick-zoom': {
    label: 'Quick Zoom',
    shortDesc: 'Snappy 1.18x punch-in on a punchline or surprise word',
    defaultDuration: 1.0,
    defaultIntensity: 70,
  },
  'dramatic-zoom': {
    label: 'Dramatic Zoom',
    shortDesc: 'Slow comedic creep-in up to 1.38x on an awkward reveal',
    defaultDuration: 2.0,
    defaultIntensity: 80,
  },
  'freeze-frame': {
    label: 'Freeze Frame',
    shortDesc: 'Holds the reaction frame for a beat with subtle flash',
    defaultDuration: 1.2,
    defaultIntensity: 75,
  },
  'slow-motion': {
    label: 'Slow Motion',
    shortDesc: '0.5x temporal stretch for dramatic comedic emphasis',
    defaultDuration: 1.5,
    defaultIntensity: 65,
  },
  'reaction-emphasis': {
    label: 'Reaction Emphasis',
    shortDesc: 'Pulse zoom + subtle focus vignette on an expressive beat',
    defaultDuration: 1.1,
    defaultIntensity: 70,
  },
  'comedic-pause': {
    label: 'Comedic Pause',
    shortDesc: 'Brief deadpan hold beat before the payoff lands',
    defaultDuration: 0.9,
    defaultIntensity: 60,
  },
  'meme-text': {
    label: 'Meme Text',
    shortDesc: 'Expressive bold uppercase reaction callout on screen',
    defaultDuration: 2.0,
    defaultIntensity: 75,
  },
  'emoji-overlay': {
    label: 'Emoji Overlay',
    shortDesc: 'Pop-in reaction emoji synced to the funny beat',
    defaultDuration: 1.5,
    defaultIntensity: 75,
  },
  'sound-effect': {
    label: 'Licensed Sound Effect',
    shortDesc: 'Royalty-free synthesized comedy SFX mixed into the audio',
    defaultDuration: 0.7,
    defaultIntensity: 75,
  },
};

export const SOUND_EFFECTS: Array<{ id: SoundEffectId; name: string; cue: string }> = [
  { id: 'none', name: 'None', cue: 'Original audio only' },
  { id: 'whoosh', name: 'Transition Whoosh', cue: 'Smooth air sweep at clip intro' },
  { id: 'pop', name: 'Caption Pop', cue: 'Crisp bubble pop on hook word' },
  { id: 'riser', name: 'Tension Riser', cue: 'Subtle pitch build into punchline' },
  { id: 'bass-drop', name: 'Sub Bass Hit', cue: 'Low-end emphasis on reveal' },
  { id: 'shutter', name: 'Camera Shutter', cue: 'Mechanical click on freeze frame' },
  { id: 'vine-boom', name: 'Dramatic Boom', cue: 'Comedic low boom on deadpan reveal' },
  { id: 'record-scratch', name: 'Record Scratch', cue: 'Classic comedic halt on awkward turn' },
];

