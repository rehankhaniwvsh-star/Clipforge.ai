export type AppView = 'landing' | 'app';

export type WorkspaceTab =
  | 'dashboard'
  | 'create'
  | 'live'
  | 'projects'
  | 'editor'
  | 'templates'
  | 'saved'
  | 'exports'
  | 'settings'
  | 'billing'
  | 'help';

export type ClipCategory =
  | 'Funny Moments'
  | 'Interesting Moments'
  | 'Educational'
  | 'Podcast'
  | 'Gaming'
  | 'Reactions'
  | 'Automatic Selection';

export type ClipDurationOption = 15 | 30 | 45 | 60;

export type ClipCountOption = 3 | 5 | 10;

export type AspectRatio = '9:16' | '1:1' | '16:9';

export type CaptionTemplateId =
  | 'bold-viral'
  | 'podcast-pro'
  | 'color-highlight'
  | 'karaoke'
  | 'minimal-white'
  | 'meme-style'
  | 'gaming'
  | 'neon'
  | 'cinematic'
  | 'word-by-word';

export type TextPosition = 'top' | 'center' | 'bottom';

export type CaptionFontFamily =
  | 'Plus Jakarta Sans'
  | 'Inter'
  | 'Montserrat'
  | 'Space Grotesk'
  | 'Oswald'
  | 'Georgia'
  | 'Noto Sans Devanagari';

export type CaptionAlignment = 'left' | 'center' | 'right';

export type CaptionShadowStyle = 'none' | 'soft' | 'strong';

export type CaptionAnimationSpeed = 'slow' | 'normal' | 'fast';

export type CaptionLanguageMode = 'auto' | 'english' | 'hindi' | 'hinglish';

export type VideoCropMode =
  | 'center'
  | 'smart'
  | 'background-blur'
  | 'manual'
  | 'face-centered';

export type SoundEffectId =
  | 'none'
  | 'whoosh'
  | 'pop'
  | 'riser'
  | 'bass-drop'
  | 'shutter'
  | 'vine-boom'
  | 'record-scratch';

export interface CaptionWord {
  word: string;
  start: number; // seconds relative to clip start (0..clipDuration)
  end: number; // seconds relative to clip start
  isKeyword?: boolean;
  color?: string;
}

export interface CaptionSegment {
  id: string;
  start: number; // seconds relative to clip start
  end: number; // seconds relative to clip start
  text: string;
  speaker?: string;
  language?: 'en' | 'hi' | 'hinglish';
  words?: CaptionWord[];
}

export type ReactionEffectType =
  | 'quick-zoom'
  | 'dramatic-zoom'
  | 'freeze-frame'
  | 'slow-motion'
  | 'reaction-emphasis'
  | 'comedic-pause'
  | 'meme-text'
  | 'emoji-overlay'
  | 'sound-effect';

export type ReactionEffectStatus = 'suggested' | 'accepted' | 'rejected';

export interface ReactionEffectItem {
  id: string;
  type: ReactionEffectType;
  startTime: number; // seconds relative to clip start
  endTime: number; // seconds relative to clip start
  reason: string;
  status: ReactionEffectStatus;
  intensity?: number; // 1..100
  text?: string; // for meme-text or reaction label
  emoji?: string; // for emoji-overlay
  soundEffect?: SoundEffectId; // for sound-effect or paired comedic SFX
  source: 'ai' | 'manual';
}

export interface CaptionReactionResponse {
  status: 'ok' | 'no_speech';
  model: string;
  detectedLanguage: 'en' | 'hi' | 'hinglish';
  hasWordTimestamps: boolean;
  captions: CaptionSegment[];
  reactionEffects: ReactionEffectItem[];
  reactionNote: string;
  warnings: string[];
}

export type ProcessingStage =
  | 'idle'
  | 'Loading video'
  | 'Reading metadata'
  | 'Preparing audio'
  | 'Analyzing with Gemini AI'
  | 'Generating captions'
  | 'Processing clip'
  | 'Rendering'
  | 'Exporting'
  | 'Completed'
  | 'Failed';

export interface ProcessingStatus {
  stage: ProcessingStage;
  progress: number | null; // 0-100 from real processing callback, or null when indeterminate
  detail: string;
  error?: string;
  fallbackAvailable?: boolean;
}

export interface AudioChunkSummary {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  rmsEnergy: number;
  peakAmplitude: number;
  byteSize: number;
  storageKey?: string;
}

export interface AudioPreparationResult {
  sampleRate: number;
  channels: number;
  totalDurationAnalyzed: number;
  truncatedByLimit: boolean;
  hasAudioTrack: boolean;
  chunks: AudioChunkSummary[];
  suggestedPeaksSec: number[];
}

export type AiClipCategory =
  | 'funny'
  | 'interesting'
  | 'educational'
  | 'podcast'
  | 'gaming'
  | 'reactions'
  | 'emotional'
  | 'hook';

export interface AiClipSuggestion {
  title: string;
  category: AiClipCategory;
  startTime: number;
  endTime: number;
  duration: number;
  hook: string;
  reason: string;
  score: number;
  caption: string;
}

export interface TranscriptChunkResult {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  hasSpeech: boolean;
}

export interface AiAudioAnalysisResponse {
  status: 'ok' | 'insufficient_data';
  model: string;
  transcriptionModel: string;
  transcript: string;
  transcriptChunks: TranscriptChunkResult[];
  insufficiencyReason?: string;
  clips: AiClipSuggestion[];
  droppedCount: number;
  warnings: string[];
}

export interface CaptionTemplateConfig {
  id: CaptionTemplateId;
  name: string;
  subtitle: string;
  bestFor: string;
  defaultFontFamily: CaptionFontFamily;
  defaultFontColor: string;
  defaultHighlightColor: string;
  defaultBackgroundColor: string;
  defaultBackgroundOpacity: number; // 0..100
  defaultOutlineWidth: number; // 0..6 px
  defaultOutlineColor: string;
  defaultShadowStyle: CaptionShadowStyle;
  defaultFontSize: number;
  defaultPosition: TextPosition;
  sampleLine: string;
}

export interface ClipEditorSettings {
  templateId: CaptionTemplateId;
  captionText: string;
  textPosition: TextPosition;
  verticalOffset: number; // -20 to 20 percentage adjustment
  fontSize: number; // px (14 to 44)
  fontColor: string;
  highlightColor: string;
  fontFamily?: CaptionFontFamily;
  backgroundColor?: string;
  backgroundOpacity?: number; // 0 to 100
  outlineWidth?: number; // 0 to 6
  outlineColor?: string;
  shadowStyle?: CaptionShadowStyle;
  alignment?: CaptionAlignment;
  animationSpeed?: CaptionAnimationSpeed;
  showSpeakerLabels?: boolean;
  captionLanguage?: CaptionLanguageMode;
  captions?: CaptionSegment[];
  captionsTimingMode?: 'word-level' | 'sentence-level';
  reactionEffects?: ReactionEffectItem[];
  cropMode?: VideoCropMode;
  faceAnchorX?: number; // 0..1 normalized horizontal face center
  faceAnchorY?: number; // 0..1 normalized vertical face center
  faceDetectionSource?: 'browser-face-detector' | 'canvas-saliency' | 'none';
  zoom: number; // 100 to 180 (%)
  cropX: number; // -30 to 30 (%)
  cropY: number; // -30 to 30 (%)
  aspectRatio: AspectRatio;
  soundEffect: SoundEffectId;
  sfxVolume: number; // 0 to 100
}

export interface ClipItem {
  id: string;
  projectId: string;
  title: string;
  startTime: number; // seconds in original video
  endTime: number; // seconds in original video
  sourceDuration: number; // seconds of original video
  category: ClipCategory;
  engagementScore: number; // 0-100 estimated score
  thumbnailUrl: string;
  thumbnailStorageKey?: string;
  videoUrl?: string; // Blob URL of real cut clip or source video
  mediaStorageKey?: string; // IndexedDB key for persisted cut clip Blob
  sourceMediaStorageKey?: string; // IndexedDB key for original uploaded video Blob
  renderedMimeType?: string;
  renderedFileSizeBytes?: number;
  isRealProcessedClip?: boolean; // True when videoUrl is an actual trimmed video Blob (0..duration)
  isLocalMedia?: boolean;
  aiGenerated?: boolean;
  aiHook?: string;
  aiReason?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeChannel?: string;
  saved?: boolean;
  createdAt: string;
  editor: ClipEditorSettings;
}

export type ProjectStatus = 'Ready' | 'Processing' | 'Draft';

export interface VideoProject {
  id: string;
  name: string;
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: string;
  mimeType?: string;
  sourceType: 'local-upload' | 'sample-studio' | 'direct-url' | 'youtube';
  videoUrl?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeChannel?: string;
  mediaStorageKey?: string;
  thumbnailUrl: string;
  thumbnailStorageKey?: string;
  audioPrep?: AudioPreparationResult;
  category: ClipCategory;
  aspectRatio: AspectRatio;
  status: ProjectStatus;
  clipCount: number;
  createdAt: string;
  pipelineNote: string;
}

export interface ExportRecord {
  id: string;
  clipId: string;
  clipTitle: string;
  projectName: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  templateName: string;
  format: 'MP4 Video' | 'WebM Video' | 'PNG + SRT Bundle' | 'SRT + Cut Package';
  mimeType?: string;
  resolution: string;
  fileSizeBytes: number;
  mediaStorageKey?: string;
  exportedAt: string;
  status: 'Completed';
}

export interface UserSettings {
  creatorName: string;
  creatorEmail: string;
  channelHandle: string;
  defaultAspectRatio: AspectRatio;
  defaultTemplateId: CaptionTemplateId;
  exportQuality: '1080p' | '720p';
  autoAddSfx: boolean;
  availableCreditsMinutes: number;
  maxUploadSizeMB: number; // Default 300 MB, configurable
}

export interface UploadedVideoInfo {
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  mimeType: string;
  objectUrl: string;
  sourceType: 'local-upload' | 'sample-studio' | 'direct-url' | 'youtube';
  thumbnailUrl: string;
  fileBlob?: Blob;
  thumbnailBlob?: Blob;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeChannel?: string;
  youtubeIsLiveArchive?: boolean;
  youtubeStartSec?: number;
  audioPrep?: AudioPreparationResult;
  aiAnalysis?: AiAudioAnalysisResponse;
}

export interface CustomTrimSelection {
  enabled: boolean;
  startTime: number;
  endTime: number;
}

export interface ClipGenerationConfig {
  category: ClipCategory;
  duration: ClipDurationOption;
  count: ClipCountOption;
  aspectRatio: AspectRatio;
  customTrim?: CustomTrimSelection;
  aiSelectedClips?: AiClipSuggestion[];
}
