import {
  CaptionAlignment,
  CaptionAnimationSpeed,
  CaptionFontFamily,
  CaptionLanguageMode,
  CaptionSegment,
  CaptionShadowStyle,
  CaptionWord,
  ClipEditorSettings,
  ReactionEffectItem,
  ReactionEffectType,
  SoundEffectId,
  VideoCropMode,
} from '../types/clipforge';
import { COLOR_POP_PALETTE, TEMPLATE_BY_ID } from '../data/templates';

export const ALLOWED_REACTION_TYPES = new Set<ReactionEffectType>([
  'quick-zoom',
  'dramatic-zoom',
  'freeze-frame',
  'slow-motion',
  'reaction-emphasis',
  'comedic-pause',
  'meme-text',
  'emoji-overlay',
  'sound-effect',
]);

export const ALLOWED_SFX_IDS = new Set<SoundEffectId>([
  'none',
  'whoosh',
  'pop',
  'riser',
  'bass-drop',
  'shutter',
  'vine-boom',
  'record-scratch',
]);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these',
  'those', 'as', 'by', 'from', 'if', 'so', 'we', 'you', 'he', 'she', 'they', 'i',
  'my', 'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them', 'do', 'does', 'did',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'just', 'very', 'really',
  'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'pe', 'aur', 'toh', 'bhi',
]);

export interface ResolvedEditorSettings {
  templateId: ClipEditorSettings['templateId'];
  captionText: string;
  textPosition: ClipEditorSettings['textPosition'];
  verticalOffset: number;
  fontSize: number;
  fontColor: string;
  highlightColor: string;
  fontFamily: CaptionFontFamily;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineWidth: number;
  outlineColor: string;
  shadowStyle: CaptionShadowStyle;
  alignment: CaptionAlignment;
  animationSpeed: CaptionAnimationSpeed;
  showSpeakerLabels: boolean;
  captionLanguage: CaptionLanguageMode;
  captions: CaptionSegment[];
  captionsTimingMode: 'word-level' | 'sentence-level';
  reactionEffects: ReactionEffectItem[];
  cropMode: VideoCropMode;
  faceAnchorX: number;
  faceAnchorY: number;
  faceDetectionSource: 'browser-face-detector' | 'canvas-saliency' | 'none';
  zoom: number;
  cropX: number;
  cropY: number;
  aspectRatio: ClipEditorSettings['aspectRatio'];
  soundEffect: SoundEffectId;
  sfxVolume: number;
}

export function resolveEditorSettings(editor: ClipEditorSettings): ResolvedEditorSettings {
  const tpl = TEMPLATE_BY_ID[editor.templateId] ?? TEMPLATE_BY_ID['bold-viral'];
  return {
    templateId: editor.templateId,
    captionText: editor.captionText ?? '',
    textPosition: editor.textPosition ?? tpl.defaultPosition,
    verticalOffset: Number.isFinite(editor.verticalOffset) ? editor.verticalOffset : 0,
    fontSize: Number.isFinite(editor.fontSize) ? editor.fontSize : tpl.defaultFontSize,
    fontColor: editor.fontColor || tpl.defaultFontColor,
    highlightColor: editor.highlightColor || tpl.defaultHighlightColor,
    fontFamily: editor.fontFamily || tpl.defaultFontFamily,
    backgroundColor: editor.backgroundColor ?? tpl.defaultBackgroundColor,
    backgroundOpacity:
      typeof editor.backgroundOpacity === 'number'
        ? Math.max(0, Math.min(100, editor.backgroundOpacity))
        : tpl.defaultBackgroundOpacity,
    outlineWidth:
      typeof editor.outlineWidth === 'number'
        ? Math.max(0, Math.min(6, editor.outlineWidth))
        : tpl.defaultOutlineWidth,
    outlineColor: editor.outlineColor || tpl.defaultOutlineColor,
    shadowStyle: editor.shadowStyle || tpl.defaultShadowStyle,
    alignment: editor.alignment || 'center',
    animationSpeed: editor.animationSpeed || 'normal',
    showSpeakerLabels: Boolean(editor.showSpeakerLabels),
    captionLanguage: editor.captionLanguage || 'auto',
    captions: Array.isArray(editor.captions) ? editor.captions : [],
    captionsTimingMode: editor.captionsTimingMode || 'sentence-level',
    reactionEffects: Array.isArray(editor.reactionEffects) ? editor.reactionEffects : [],
    cropMode: editor.cropMode || 'smart',
    faceAnchorX: typeof editor.faceAnchorX === 'number' ? Math.max(0.1, Math.min(0.9, editor.faceAnchorX)) : 0.5,
    faceAnchorY: typeof editor.faceAnchorY === 'number' ? Math.max(0.1, Math.min(0.9, editor.faceAnchorY)) : 0.35,
    faceDetectionSource: editor.faceDetectionSource || 'none',
    zoom: Number.isFinite(editor.zoom) ? editor.zoom : 100,
    cropX: Number.isFinite(editor.cropX) ? editor.cropX : 0,
    cropY: Number.isFinite(editor.cropY) ? editor.cropY : 0,
    aspectRatio: editor.aspectRatio || '9:16',
    soundEffect: editor.soundEffect || 'none',
    sfxVolume: Number.isFinite(editor.sfxVolume) ? editor.sfxVolume : 65,
  };
}

export function isKeywordCandidate(word: string, index: number, total: number): boolean {
  const cleaned = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!cleaned) return false;
  if (/\d/.test(cleaned)) return true;
  if (cleaned.length >= 6 && !STOPWORDS.has(cleaned.toLowerCase())) return true;
  if (/[!?]$/.test(word)) return true;
  if (total <= 4 && index === total - 1) return true;
  return !STOPWORDS.has(cleaned.toLowerCase()) && cleaned.length >= 4 && index % 3 === 1;
}

export function buildWordsForSegment(
  text: string,
  startSec: number,
  endSec: number,
  existingWords?: CaptionWord[]
): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const safeStart = Math.max(0, startSec);
  const safeEnd = Math.max(safeStart + 0.2, endSec);
  const span = safeEnd - safeStart;

  if (existingWords && existingWords.length === tokens.length) {
    return existingWords.map((w, idx) => ({
      word: tokens[idx],
      start: Math.max(safeStart, Math.min(safeEnd - 0.05, Number(w.start) || safeStart)),
      end: Math.max(
        Math.max(safeStart, Number(w.start) || safeStart) + 0.05,
        Math.min(safeEnd, Number(w.end) || safeEnd)
      ),
      isKeyword:
        typeof w.isKeyword === 'boolean'
          ? w.isKeyword
          : isKeywordCandidate(tokens[idx], idx, tokens.length),
      color: w.color,
    }));
  }

  // Proportional timing fallback weighted by word length
  const weights = tokens.map((t) => Math.max(2, t.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cursor = safeStart;

  return tokens.map((token, idx) => {
    const dur = (weights[idx] / totalWeight) * span;
    const wStart = Math.round(cursor * 100) / 100;
    cursor += dur;
    const wEnd = idx === tokens.length - 1 ? Math.round(safeEnd * 100) / 100 : Math.round(cursor * 100) / 100;
    return {
      word: token,
      start: wStart,
      end: Math.max(wStart + 0.05, wEnd),
      isKeyword: isKeywordCandidate(token, idx, tokens.length),
    };
  });
}

export function normalizeCaptionSegments(
  rawSegments: unknown,
  clipDuration: number
): { segments: CaptionSegment[]; hasWordTimestamps: boolean } {
  const maxDur = Math.max(1, clipDuration);
  if (!Array.isArray(rawSegments)) {
    return { segments: [], hasWordTimestamps: false };
  }

  const normalized: CaptionSegment[] = [];
  let validWordTimedSegments = 0;

  for (let i = 0; i < rawSegments.length; i += 1) {
    const item = rawSegments[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === 'string' ? rec.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) continue;

    let start = Number(rec.start);
    let end = Number(rec.end);
    if (!Number.isFinite(start)) start = normalized.length > 0 ? normalized[normalized.length - 1].end : 0;
    start = Math.max(0, Math.min(maxDur - 0.2, start));
    if (!Number.isFinite(end) || end <= start) end = Math.min(maxDur, start + 2.5);
    end = Math.max(start + 0.2, Math.min(maxDur, end));

    const speaker =
      typeof rec.speaker === 'string' && rec.speaker.trim()
        ? rec.speaker.trim().slice(0, 32)
        : undefined;

    const rawLang = typeof rec.language === 'string' ? rec.language.toLowerCase() : '';
    const language: 'en' | 'hi' | 'hinglish' | undefined =
      rawLang === 'hi' || rawLang === 'hindi'
        ? 'hi'
        : rawLang === 'hinglish'
          ? 'hinglish'
          : rawLang === 'en' || rawLang === 'english'
            ? 'en'
            : undefined;

    let parsedWords: CaptionWord[] | undefined;
    if (Array.isArray(rec.words) && rec.words.length > 0) {
      const candidateWords: CaptionWord[] = [];
      for (const rw of rec.words) {
        if (!rw || typeof rw !== 'object') continue;
        const wr = rw as Record<string, unknown>;
        const wText = typeof wr.word === 'string' ? wr.word.trim() : '';
        const ws = Number(wr.start);
        const we = Number(wr.end);
        if (!wText || !Number.isFinite(ws) || !Number.isFinite(we)) continue;
        const clampedStart = Math.max(start, Math.min(end - 0.04, ws));
        const clampedEnd = Math.max(clampedStart + 0.04, Math.min(end, we));
        candidateWords.push({
          word: wText,
          start: Math.round(clampedStart * 100) / 100,
          end: Math.round(clampedEnd * 100) / 100,
          isKeyword: typeof wr.isKeyword === 'boolean' ? wr.isKeyword : undefined,
        });
      }
      if (candidateWords.length >= 1) {
        parsedWords = candidateWords.map((w, idx) => ({
          ...w,
          isKeyword:
            typeof w.isKeyword === 'boolean'
              ? w.isKeyword
              : isKeywordCandidate(w.word, idx, candidateWords.length),
        }));
        validWordTimedSegments += 1;
      }
    }

    normalized.push({
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `cap-${i + 1}`,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      text,
      speaker,
      language,
      words: parsedWords ?? buildWordsForSegment(text, start, end),
    });
  }

  normalized.sort((a, b) => a.start - b.start);

  // Ensure monotonic non-overlapping segment boundaries
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].start < normalized[i - 1].end) {
      const mid = Math.round(((normalized[i].start + normalized[i - 1].end) / 2) * 100) / 100;
      normalized[i - 1].end = Math.max(normalized[i - 1].start + 0.2, mid);
      normalized[i].start = Math.min(normalized[i].end - 0.2, normalized[i - 1].end);
    }
  }

  return {
    segments: normalized,
    hasWordTimestamps: normalized.length > 0 && validWordTimedSegments >= Math.ceil(normalized.length / 2),
  };
}

export interface ActiveCaptionFrame {
  text: string;
  speaker?: string;
  words: CaptionWord[];
  activeWordIndex: number;
  wordProgress: number; // 0..1 within active word
  segmentIndex: number;
}

export function getActiveCaptionAtTime(
  segments: CaptionSegment[],
  relTimeSec: number,
  fallbackText: string,
  clipDuration: number
): ActiveCaptionFrame | null {
  const safeDur = Math.max(1, clipDuration);
  const t = Math.max(0, Math.min(safeDur, relTimeSec));

  if (segments.length > 0) {
    // Find exact segment covering `t`, or hold closest segment within 0.25s lead/trail
    let idx = segments.findIndex((s) => t >= s.start && t <= s.end);
    if (idx === -1) {
      idx = segments.findIndex((s) => Math.abs(s.start - t) <= 0.25 || Math.abs(s.end - t) <= 0.25);
    }
    if (idx === -1) {
      // Fallback to nearest previous segment so preview always shows readable subtitle context
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        if (segments[i].start <= t) {
          idx = i;
          break;
        }
      }
      if (idx === -1) idx = 0;
    }

    const seg = segments[idx];
    const words =
      seg.words && seg.words.length > 0
        ? seg.words
        : buildWordsForSegment(seg.text, seg.start, seg.end);

    if (words.length === 0) return null;

    let activeWordIndex = words.findIndex((w) => t >= w.start && t <= w.end);
    if (activeWordIndex === -1) {
      if (t < words[0].start) activeWordIndex = 0;
      else if (t >= words[words.length - 1].end) activeWordIndex = words.length - 1;
      else {
        // Between words: snap to most recently spoken word
        activeWordIndex = 0;
        for (let i = 0; i < words.length; i += 1) {
          if (words[i].start <= t) activeWordIndex = i;
        }
      }
    }

    const activeWord = words[activeWordIndex];
    const wSpan = Math.max(0.05, activeWord.end - activeWord.start);
    const wordProgress = Math.max(0, Math.min(1, (t - activeWord.start) / wSpan));

    return {
      text: seg.text,
      speaker: seg.speaker,
      words,
      activeWordIndex,
      wordProgress,
      segmentIndex: idx,
    };
  }

  // Fallback when no timestamped CaptionSegments have been generated yet
  const cleanFallback = fallbackText.trim();
  if (!cleanFallback) return null;
  const words = buildWordsForSegment(cleanFallback, 0, safeDur);
  if (words.length === 0) return null;

  let activeWordIndex = words.findIndex((w) => t >= w.start && t <= w.end);
  if (activeWordIndex === -1) {
    activeWordIndex = Math.min(words.length - 1, Math.floor((t / safeDur) * words.length));
  }
  const activeWord = words[activeWordIndex];
  const wSpan = Math.max(0.05, activeWord.end - activeWord.start);
  const wordProgress = Math.max(0, Math.min(1, (t - activeWord.start) / wSpan));

  return {
    text: cleanFallback,
    words,
    activeWordIndex,
    wordProgress,
    segmentIndex: 0,
  };
}

export function updateCaptionSegmentText(
  segments: CaptionSegment[],
  segmentId: string,
  newText: string
): CaptionSegment[] {
  return segments.map((seg) => {
    if (seg.id !== segmentId) return seg;
    return {
      ...seg,
      text: newText,
      words: buildWordsForSegment(newText, seg.start, seg.end),
    };
  });
}

export function pickColorPopForWord(index: number, primaryHighlight: string): string {
  if (index === 0) return primaryHighlight;
  const palette = [primaryHighlight, ...COLOR_POP_PALETTE.filter((c) => c.toLowerCase() !== primaryHighlight.toLowerCase())];
  return palette[index % palette.length];
}

export function validateReactionSuggestions(
  rawEffects: unknown,
  clipDuration: number
): ReactionEffectItem[] {
  const maxDur = Math.max(1, clipDuration);
  if (!Array.isArray(rawEffects)) return [];

  const accepted: ReactionEffectItem[] = [];
  for (let i = 0; i < rawEffects.length; i += 1) {
    const raw = rawEffects[i];
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;

    const type = typeof rec.type === 'string' ? (rec.type.trim() as ReactionEffectType) : null;
    if (!type || !ALLOWED_REACTION_TYPES.has(type)) continue;

    const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
    // Anti-randomness gate: every AI reaction suggestion MUST carry a concrete justification
    if (reason.length < 8) continue;

    const start = Number(rec.startTime);
    let end = Number(rec.endTime);
    if (!Number.isFinite(start) || start < 0 || start >= maxDur - 0.25) continue;
    if (!Number.isFinite(end) || end <= start) {
      end = Math.min(maxDur, start + 1.2);
    }

    const clampedStart = Math.round(Math.max(0, Math.min(maxDur - 0.3, start)) * 100) / 100;
    const clampedEnd = Math.round(Math.max(clampedStart + 0.3, Math.min(maxDur, end)) * 100) / 100;

    // Prevent overlapping duplicate effect types
    const overlapsSameType = accepted.some(
      (existing) =>
        existing.type === type &&
        clampedStart < existing.endTime + 0.4 &&
        clampedEnd > existing.startTime - 0.4
    );
    if (overlapsSameType) continue;

    const rawIntensity = Number(rec.intensity);
    const intensity = Number.isFinite(rawIntensity)
      ? Math.max(20, Math.min(100, Math.round(rawIntensity)))
      : 72;

    const rawSfx = typeof rec.soundEffect === 'string' ? (rec.soundEffect.trim() as SoundEffectId) : undefined;
    const soundEffect = rawSfx && ALLOWED_SFX_IDS.has(rawSfx) ? rawSfx : type === 'sound-effect' ? 'vine-boom' : undefined;

    const text =
      typeof rec.text === 'string' && rec.text.trim()
        ? rec.text.trim().slice(0, 64)
        : type === 'meme-text'
          ? 'WAIT FOR IT...'
          : undefined;

    const emoji =
      typeof rec.emoji === 'string' && rec.emoji.trim()
        ? rec.emoji.trim().slice(0, 8)
        : type === 'emoji-overlay'
          ? '💀'
          : undefined;

    accepted.push({
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `rx-${i + 1}-${Date.now()}`,
      type,
      startTime: clampedStart,
      endTime: clampedEnd,
      reason: reason.slice(0, 220),
      status: 'suggested',
      intensity,
      text,
      emoji,
      soundEffect,
      source: 'ai',
    });

    if (accepted.length >= 4) break;
  }

  return accepted.sort((a, b) => a.startTime - b.startTime);
}

export interface EvaluatedReactionFrame {
  sourceTimeSec: number;
  extraZoomScale: number;
  freezeActive: boolean;
  slowMotionActive: boolean;
  flashAlpha: number;
  vignetteAlpha: number;
  memeText: string | null;
  emojiOverlay: { emoji: string; scale: number } | null;
  playbackRate: number;
  activeLabels: string[];
}

export function evaluateReactionEffectsAtTime(
  effects: ReactionEffectItem[],
  relTimeSec: number,
  clipDuration: number
): EvaluatedReactionFrame {
  const safeDur = Math.max(0.5, clipDuration);
  const t = Math.max(0, Math.min(safeDur, relTimeSec));
  const accepted = effects.filter((e) => e.status === 'accepted');

  let sourceTimeSec = t;
  let extraZoomScale = 1;
  let freezeActive = false;
  let slowMotionActive = false;
  let flashAlpha = 0;
  let vignetteAlpha = 0;
  let memeText: string | null = null;
  let emojiOverlay: { emoji: string; scale: number } | null = null;
  let playbackRate = 1;
  const activeLabels: string[] = [];

  for (const fx of accepted) {
    if (t < fx.startTime || t > fx.endTime) continue;
    const span = Math.max(0.15, fx.endTime - fx.startTime);
    const localProgress = Math.max(0, Math.min(1, (t - fx.startTime) / span));
    const strength = (fx.intensity ?? 70) / 100;

    if (fx.type === 'quick-zoom') {
      // Snappy ease-out punch-in then release
      const envelope = Math.sin(localProgress * Math.PI);
      extraZoomScale = Math.max(extraZoomScale, 1 + envelope * 0.24 * strength);
      activeLabels.push('Quick Zoom');
    } else if (fx.type === 'dramatic-zoom') {
      // Progressive creep-in zoom across the whole window
      extraZoomScale = Math.max(extraZoomScale, 1 + localProgress * 0.42 * strength);
      vignetteAlpha = Math.max(vignetteAlpha, localProgress * 0.35 * strength);
      activeLabels.push('Dramatic Zoom');
    } else if (fx.type === 'freeze-frame') {
      freezeActive = true;
      sourceTimeSec = fx.startTime;
      playbackRate = 0;
      if (localProgress < 0.16) {
        flashAlpha = Math.max(flashAlpha, (1 - localProgress / 0.16) * 0.65);
      }
      vignetteAlpha = Math.max(vignetteAlpha, 0.28);
      activeLabels.push('Freeze Frame');
    } else if (fx.type === 'comedic-pause') {
      freezeActive = true;
      sourceTimeSec = fx.startTime;
      playbackRate = 0;
      extraZoomScale = Math.max(extraZoomScale, 1 + 0.08 * strength);
      vignetteAlpha = Math.max(vignetteAlpha, 0.22);
      activeLabels.push('Comedic Pause');
    } else if (fx.type === 'slow-motion') {
      slowMotionActive = true;
      playbackRate = 0.5;
      sourceTimeSec = fx.startTime + (t - fx.startTime) * 0.5;
      activeLabels.push('Slow Motion');
    } else if (fx.type === 'reaction-emphasis') {
      const pulse = Math.sin(localProgress * Math.PI * 2) * 0.5 + 0.5;
      extraZoomScale = Math.max(extraZoomScale, 1 + (0.1 + pulse * 0.08) * strength);
      vignetteAlpha = Math.max(vignetteAlpha, 0.32 * strength);
      activeLabels.push('Reaction Emphasis');
    } else if (fx.type === 'meme-text' && fx.text) {
      memeText = fx.text;
      activeLabels.push('Meme Text');
    } else if (fx.type === 'emoji-overlay' && fx.emoji) {
      // Pop-in bounce scale
      const pop = localProgress < 0.2 ? 0.6 + (localProgress / 0.2) * 0.55 : 1 + Math.sin(localProgress * Math.PI * 3) * 0.06;
      emojiOverlay = { emoji: fx.emoji, scale: pop };
      activeLabels.push('Emoji');
    }
  }

  return {
    sourceTimeSec: Math.max(0, Math.min(safeDur, sourceTimeSec)),
    extraZoomScale,
    freezeActive,
    slowMotionActive,
    flashAlpha,
    vignetteAlpha,
    memeText,
    emojiOverlay,
    playbackRate,
    activeLabels,
  };
}

export interface CropGeometryResult {
  drawBackgroundBlur: boolean;
  bgRect: { dx: number; dy: number; dw: number; dh: number } | null;
  fgRect: { dx: number; dy: number; dw: number; dh: number };
}

export function computeCropGeometry(params: {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  cropMode: VideoCropMode;
  zoomPercent: number;
  cropXPercent: number;
  cropYPercent: number;
  faceAnchorX?: number;
  faceAnchorY?: number;
  extraZoomScale?: number;
}): CropGeometryResult {
  const sw = Math.max(1, params.sourceWidth);
  const sh = Math.max(1, params.sourceHeight);
  const ow = Math.max(1, params.outputWidth);
  const oh = Math.max(1, params.outputHeight);
  const zoomFactor = Math.max(1, (params.zoomPercent || 100) / 100) * Math.max(1, params.extraZoomScale || 1);

  if (params.cropMode === 'background-blur') {
    const coverScale = Math.max(ow / sw, oh / sh) * 1.15;
    const bgW = sw * coverScale;
    const bgH = sh * coverScale;
    const bgRect = {
      dx: (ow - bgW) / 2,
      dy: (oh - bgH) / 2,
      dw: bgW,
      dh: bgH,
    };

    const containScale = Math.min(ow / sw, oh / sh) * zoomFactor;
    const fgW = sw * containScale;
    const fgH = sh * containScale;
    const fgRect = {
      dx: (ow - fgW) / 2 + ((params.cropXPercent || 0) / 100) * ow,
      dy: (oh - fgH) / 2 + ((params.cropYPercent || 0) / 100) * oh,
      dw: fgW,
      dh: fgH,
    };
    return { drawBackgroundBlur: true, bgRect, fgRect };
  }

  const coverScale = Math.max(ow / sw, oh / sh) * zoomFactor;
  const dw = sw * coverScale;
  const dh = sh * coverScale;

  let dx = (ow - dw) / 2;
  let dy = (oh - dh) / 2;

  if (params.cropMode === 'smart') {
    // Subtle headroom bias (shift slightly upward toward upper-third subject)
    dy = (oh - dh) * 0.42;
  } else if (params.cropMode === 'face-centered') {
    const anchorX = typeof params.faceAnchorX === 'number' ? params.faceAnchorX : 0.5;
    const anchorY = typeof params.faceAnchorY === 'number' ? params.faceAnchorY : 0.35;
    dx = ow * 0.5 - dw * anchorX;
    dy = oh * 0.42 - dh * anchorY;
  } else if (params.cropMode === 'manual') {
    dx += ((params.cropXPercent || 0) / 100) * ow;
    dy += ((params.cropYPercent || 0) / 100) * oh;
  }

  // Clamp so no black bars appear in cover crop modes
  const minDx = Math.min(0, ow - dw);
  const maxDx = Math.max(0, ow - dw);
  const minDy = Math.min(0, oh - dh);
  const maxDy = Math.max(0, oh - dh);

  return {
    drawBackgroundBlur: false,
    bgRect: null,
    fgRect: {
      dx: Math.max(minDx, Math.min(maxDx, dx)),
      dy: Math.max(minDy, Math.min(maxDy, dy)),
      dw,
      dh,
    },
  };
}

export interface GenerateCaptionsReactionsPayload {
  clipTitle: string;
  clipDurationSeconds: number;
  languageMode: CaptionLanguageMode;
  includeReactions: boolean;
  audioBase64: string;
  audioMimeType: string;
  existingTranscript?: string;
}

export function validateCaptionReactionRequestBody(body: unknown): {
  valid: boolean;
  error?: string;
  data?: GenerateCaptionsReactionsPayload;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const rec = body as Record<string, unknown>;
  const clipDurationSeconds = Number(rec.clipDurationSeconds);
  if (!Number.isFinite(clipDurationSeconds) || clipDurationSeconds < 0.5 || clipDurationSeconds > 300) {
    return { valid: false, error: 'clipDurationSeconds must be between 0.5 and 300 seconds.' };
  }

  const audioBase64 = typeof rec.audioBase64 === 'string' ? rec.audioBase64.trim() : '';
  if (!audioBase64 || audioBase64.length < 32) {
    return { valid: false, error: 'Extracted clip audio payload (audioBase64) is required.' };
  }
  if (audioBase64.length > 18_000_000) {
    return { valid: false, error: 'Clip audio payload exceeds server limit for caption generation.' };
  }

  const audioMimeType =
    typeof rec.audioMimeType === 'string' && rec.audioMimeType.startsWith('audio/')
      ? rec.audioMimeType
      : 'audio/wav';

  const rawLang = typeof rec.languageMode === 'string' ? rec.languageMode : 'auto';
  const languageMode: CaptionLanguageMode =
    rawLang === 'english' || rawLang === 'hindi' || rawLang === 'hinglish' ? rawLang : 'auto';

  return {
    valid: true,
    data: {
      clipTitle: typeof rec.clipTitle === 'string' ? rec.clipTitle.trim().slice(0, 140) : 'Clip',
      clipDurationSeconds,
      languageMode,
      includeReactions: Boolean(rec.includeReactions),
      audioBase64,
      audioMimeType,
      existingTranscript:
        typeof rec.existingTranscript === 'string' ? rec.existingTranscript.trim().slice(0, 4000) : undefined,
    },
  };
}
