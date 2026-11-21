import { CSSProperties } from 'react';
import {
  CaptionAlignment,
  CaptionAnimationSpeed,
  CaptionFontFamily,
  CaptionShadowStyle,
  CaptionTemplateId,
  CaptionWord,
  TextPosition,
} from '../types/clipforge';
import { GAMING_PALETTE, TEMPLATE_BY_ID } from '../data/templates';
import { isKeywordCandidate, pickColorPopForWord } from '../utils/captionReactionLogic';

interface CaptionRendererProps {
  templateId: CaptionTemplateId;
  text: string;
  words?: CaptionWord[];
  speaker?: string;
  showSpeakerLabels?: boolean;
  fontSize: number;
  fontFamily?: CaptionFontFamily;
  fontColor: string;
  highlightColor: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  outlineWidth?: number;
  outlineColor?: string;
  shadowStyle?: CaptionShadowStyle;
  alignment?: CaptionAlignment;
  animationSpeed?: CaptionAnimationSpeed;
  position: TextPosition;
  verticalOffset?: number;
  activeWordIndex?: number;
  compact?: boolean;
}

function hexToRgba(hex: string, opacityPercent: number): string {
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(9,9,11,${alpha})`;
}

function getShadowCss(shadowStyle: CaptionShadowStyle, glowColor?: string): string {
  if (glowColor) {
    return `0 0 10px ${glowColor}, 0 0 22px ${glowColor}, 0 2px 6px rgba(0,0,0,0.95)`;
  }
  if (shadowStyle === 'none') return 'none';
  if (shadowStyle === 'soft') return '0 2px 8px rgba(0,0,0,0.85)';
  return '0 3px 0 rgba(0,0,0,0.95), 0 6px 18px rgba(0,0,0,0.9)';
}

function getTransitionMs(speed: CaptionAnimationSpeed): string {
  if (speed === 'fast') return '80ms';
  if (speed === 'slow') return '280ms';
  return '150ms';
}

export function CaptionRenderer({
  templateId,
  text,
  words: providedWords,
  speaker,
  showSpeakerLabels = false,
  fontSize,
  fontFamily,
  fontColor,
  highlightColor,
  backgroundColor,
  backgroundOpacity,
  outlineWidth,
  outlineColor,
  shadowStyle,
  alignment = 'center',
  animationSpeed = 'normal',
  position,
  verticalOffset = 0,
  activeWordIndex = 1,
  compact = false,
}: CaptionRendererProps) {
  const tpl = TEMPLATE_BY_ID[templateId] ?? TEMPLATE_BY_ID['bold-viral'];

  const resolvedFont = fontFamily || tpl.defaultFontFamily;
  const resolvedBgColor = backgroundColor ?? tpl.defaultBackgroundColor;
  const resolvedBgOpacity =
    typeof backgroundOpacity === 'number' ? backgroundOpacity : tpl.defaultBackgroundOpacity;
  const resolvedOutlineWidth =
    typeof outlineWidth === 'number' ? outlineWidth : tpl.defaultOutlineWidth;
  const resolvedOutlineColor = outlineColor || tpl.defaultOutlineColor;
  const resolvedShadow = shadowStyle || tpl.defaultShadowStyle;

  const fallbackTokens = text.trim().split(/\s+/).filter(Boolean);
  const wordsList: Array<{ word: string; isKeyword: boolean }> =
    providedWords && providedWords.length > 0
      ? providedWords.map((w, idx) => ({
          word: w.word,
          isKeyword:
            typeof w.isKeyword === 'boolean'
              ? w.isKeyword
              : isKeywordCandidate(w.word, idx, providedWords.length),
        }))
      : fallbackTokens.map((w, idx) => ({
          word: w,
          isKeyword: isKeywordCandidate(w, idx, fallbackTokens.length),
        }));

  if (wordsList.length === 0) return null;

  const safeIndex = activeWordIndex % wordsList.length;
  const scaledFontSize = compact ? Math.max(12, Math.round(fontSize * 0.62)) : fontSize;
  const transitionDuration = getTransitionMs(animationSpeed);

  const fontStack =
    resolvedFont === 'Georgia'
      ? 'Georgia, serif'
      : `"${resolvedFont}", "Noto Sans Devanagari", "Plus Jakarta Sans", system-ui, sans-serif`;

  const positionClass =
    position === 'top'
      ? 'top-[12%]'
      : position === 'center'
        ? 'top-1/2 -translate-y-1/2'
        : 'bottom-[12%]';

  const alignJustifyClass =
    alignment === 'left'
      ? 'items-start text-left'
      : alignment === 'right'
        ? 'items-end text-right'
        : 'items-center text-center';

  const flexWrapAlignClass =
    alignment === 'left'
      ? 'justify-start'
      : alignment === 'right'
        ? 'justify-end'
        : 'justify-center';

  const offsetStyle: CSSProperties | undefined =
    verticalOffset !== 0 ? { transform: `translateY(${verticalOffset * 2}px)` } : undefined;

  const strokeStyle: CSSProperties =
    resolvedOutlineWidth > 0 && templateId !== 'meme-style' && templateId !== 'minimal-white'
      ? {
          WebkitTextStroke: `${Math.min(3, resolvedOutlineWidth * 0.55)}px ${resolvedOutlineColor}`,
          paintOrder: 'stroke fill',
        }
      : {};

  const customBgStyle: CSSProperties =
    resolvedBgOpacity > 0
      ? { backgroundColor: hexToRgba(resolvedBgColor, resolvedBgOpacity) }
      : {};

  const speakerBadge =
    showSpeakerLabels && speaker ? (
      <span
        className="mb-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white bg-[#DC2626]/95 shadow"
        style={{ fontFamily: fontStack }}
      >
        {speaker}
      </span>
    ) : null;

  // 10. Word by Word — animated single word
  if (templateId === 'word-by-word') {
    const currentWord = wordsList[safeIndex]?.word || wordsList[0].word;
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <span
          className="font-extrabold uppercase tracking-tight px-3 py-1 rounded-md"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.round(scaledFontSize * 1.15)}px`,
            color: highlightColor,
            textShadow: getShadowCss(resolvedShadow),
            transitionDuration,
            ...strokeStyle,
            ...customBgStyle,
          }}
        >
          {currentWord}
        </span>
      </div>
    );
  }

  // 6. Meme — bold text with expressive emphasis
  if (templateId === 'meme-style') {
    const bgAlpha = Math.max(85, resolvedBgOpacity);
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <div
          className="w-full max-w-[92%] rounded-md px-3 py-2 shadow-lg border border-black/10"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.85))}px`,
            color: fontColor,
            backgroundColor: hexToRgba(resolvedBgColor || '#FFFFFF', bgAlpha),
            lineHeight: 1.25,
          }}
        >
          <span className="font-extrabold tracking-wide">
            {wordsList.map((item, idx) => (
              <span
                key={`${item.word}-${idx}`}
                style={{
                  color: idx === safeIndex || item.isKeyword ? highlightColor : fontColor,
                  transitionDuration,
                }}
              >
                {item.word}
                {idx < wordsList.length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
        </div>
      </div>
    );
  }

  // 9. Cinematic — elegant subtitles near the bottom
  if (templateId === 'cinematic') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-4 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className="tracking-[0.06em] font-normal px-3 py-1 rounded backdrop-blur-[2px]"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(11, Math.round(scaledFontSize * 0.8))}px`,
            color: fontColor,
            backgroundColor:
              resolvedBgOpacity > 0
                ? hexToRgba(resolvedBgColor, resolvedBgOpacity)
                : 'rgba(0,0,0,0.42)',
            lineHeight: 1.4,
            textShadow: getShadowCss(resolvedShadow),
          }}
        >
          {wordsList.map((item, idx) => (
            <span
              key={`${item.word}-${idx}`}
              style={{
                color: idx === safeIndex ? highlightColor : fontColor,
                transitionDuration,
              }}
            >
              {item.word}
              {idx < wordsList.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // 5. Minimal — simple white text with subtle shadow
  if (templateId === 'minimal-white') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-4 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className="font-medium tracking-normal px-2.5 py-1 rounded"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.85))}px`,
            color: fontColor,
            lineHeight: 1.35,
            textShadow: getShadowCss(resolvedShadow === 'none' ? 'soft' : resolvedShadow),
            ...customBgStyle,
          }}
        >
          {wordsList.map((item, idx) => (
            <span
              key={`${item.word}-${idx}`}
              className="transition-opacity"
              style={{
                opacity: idx === safeIndex ? 1 : 0.82,
                transitionDuration,
              }}
            >
              {item.word}
              {idx < wordsList.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // 2. Podcast Pro — clean white subtitles with selected yellow keywords
  if (templateId === 'podcast-pro') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <div
          className="max-w-[94%] backdrop-blur-md border border-white/10 rounded-lg px-3.5 py-2 shadow-lg"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.86))}px`,
            lineHeight: 1.32,
            backgroundColor: hexToRgba(
              resolvedBgColor || '#09090B',
              resolvedBgOpacity > 0 ? resolvedBgOpacity : 82
            ),
            textShadow: getShadowCss(resolvedShadow),
          }}
        >
          {wordsList.map((item, idx) => (
            <span
              key={`${item.word}-${idx}`}
              className="font-semibold transition-colors"
              style={{
                color: idx === safeIndex || item.isKeyword ? highlightColor : fontColor,
                transitionDuration,
              }}
            >
              {item.word}
              {idx < wordsList.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // 3. Color Pop — different highlight colors for important words
  if (templateId === 'color-highlight') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className={`flex flex-wrap ${flexWrapAlignClass} items-center gap-x-1.5 gap-y-1 font-bold leading-snug px-2 py-1 rounded`}
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.88))}px`,
            textShadow: getShadowCss(resolvedShadow),
            ...customBgStyle,
          }}
        >
          {wordsList.map((item, idx) => {
            const wordColor = pickColorPopForWord(idx, highlightColor);
            const isActive = idx === safeIndex;
            return (
              <span
                key={`${item.word}-${idx}`}
                className="inline-block px-1.5 py-0.5 rounded transition-transform"
                style={{
                  backgroundColor: isActive ? wordColor : 'transparent',
                  color: isActive ? '#FFFFFF' : item.isKeyword ? wordColor : fontColor,
                  transform: isActive ? 'scale(1.06)' : 'scale(1)',
                  transitionDuration,
                  ...strokeStyle,
                }}
              >
                {item.word}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  // 4. Karaoke — word-by-word highlighting synchronized with speech
  if (templateId === 'karaoke') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className="font-bold leading-snug px-2.5 py-1 rounded"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(12, Math.round(scaledFontSize * 0.9))}px`,
            textShadow: getShadowCss(resolvedShadow),
            backgroundColor:
              resolvedBgOpacity > 0
                ? hexToRgba(resolvedBgColor, resolvedBgOpacity)
                : 'rgba(9,9,11,0.48)',
            ...strokeStyle,
          }}
        >
          {wordsList.map((item, idx) => (
            <span
              key={`${item.word}-${idx}`}
              className="transition-colors"
              style={{
                color: idx <= safeIndex ? highlightColor : fontColor,
                transitionDuration,
              }}
            >
              {item.word}
              {idx < wordsList.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // 7. Gaming — high-energy captions with colorful highlights
  if (templateId === 'gaming') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className="font-extrabold italic uppercase tracking-tight leading-tight -skew-x-6 px-2.5 py-1 rounded"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(13, Math.round(scaledFontSize * 0.92))}px`,
            textShadow: `0 3px 0 #09090B, 0 0 14px ${highlightColor}88`,
            ...strokeStyle,
            ...customBgStyle,
          }}
        >
          {wordsList.map((item, idx) => {
            const activeColor = GAMING_PALETTE[idx % GAMING_PALETTE.length];
            return (
              <span
                key={`${item.word}-${idx}`}
                style={{
                  color:
                    idx === safeIndex
                      ? activeColor
                      : item.isKeyword
                        ? highlightColor
                        : fontColor,
                  transitionDuration,
                }}
              >
                {item.word}
                {idx < wordsList.length - 1 ? ' ' : ''}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  // 8. Neon — glowing text and subtle effects
  if (templateId === 'neon') {
    return (
      <div
        data-testid="caption-overlay"
        data-template-id={templateId}
        className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
        style={offsetStyle}
      >
        {speakerBadge}
        <p
          className="font-bold uppercase tracking-wide leading-tight px-2 py-1 rounded"
          style={{
            fontFamily: fontStack,
            fontSize: `${Math.max(13, Math.round(scaledFontSize * 0.9))}px`,
            color: fontColor,
            textShadow: getShadowCss(resolvedShadow, highlightColor),
            ...strokeStyle,
            ...customBgStyle,
          }}
        >
          {wordsList.map((item, idx) => (
            <span
              key={`${item.word}-${idx}`}
              style={{
                color: idx === safeIndex ? '#FFFFFF' : fontColor,
                opacity: idx === safeIndex ? 1 : 0.9,
                transitionDuration,
              }}
            >
              {item.word}
              {idx < wordsList.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // 1. Bold Viral — large bold white text with highlighted keywords
  return (
    <div
      data-testid="caption-overlay"
      data-template-id={templateId}
      className={`pointer-events-none absolute inset-x-3 flex flex-col ${alignJustifyClass} ${positionClass}`}
      style={offsetStyle}
    >
      {speakerBadge}
      <p
        className={`flex flex-wrap ${flexWrapAlignClass} items-baseline gap-x-2 gap-y-0.5 font-extrabold uppercase tracking-tight leading-[1.15] px-2 py-1 rounded`}
        style={{
          fontFamily: fontStack,
          fontSize: `${Math.max(13, Math.round(scaledFontSize * 0.96))}px`,
          textShadow: getShadowCss(resolvedShadow),
          ...strokeStyle,
          ...customBgStyle,
        }}
      >
        {wordsList.map((item, idx) => (
          <span
            key={`${item.word}-${idx}`}
            className="inline-block transition-transform"
            style={{
              color: idx === safeIndex || item.isKeyword ? highlightColor : fontColor,
              transform: idx === safeIndex ? 'scale(1.07)' : 'scale(1)',
              transitionDuration,
            }}
          >
            {item.word}
          </span>
        ))}
      </p>
    </div>
  );
}
