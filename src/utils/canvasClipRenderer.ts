import { ClipEditorSettings } from '../types/clipforge';
import { GAMING_PALETTE } from '../data/templates';
import {
  ActiveCaptionFrame,
  computeCropGeometry,
  EvaluatedReactionFrame,
  evaluateReactionEffectsAtTime,
  getActiveCaptionAtTime,
  pickColorPopForWord,
  ResolvedEditorSettings,
  resolveEditorSettings,
} from './captionReactionLogic';

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function applyShadow(
  ctx: CanvasRenderingContext2D,
  shadowStyle: ResolvedEditorSettings['shadowStyle'],
  overrideGlowColor?: string
) {
  if (overrideGlowColor) {
    ctx.shadowColor = overrideGlowColor;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  if (shadowStyle === 'none') {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else if (shadowStyle === 'soft') {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  }
}

function getFontStack(fontFamily: string): string {
  if (fontFamily === 'Georgia') return 'Georgia, serif';
  return `"${fontFamily}", "Noto Sans Devanagari", "Plus Jakarta Sans", system-ui, sans-serif`;
}

interface WordTokenDraw {
  text: string;
  rawIndex: number;
  isKeyword: boolean;
  isActive: boolean;
  isSpoken: boolean;
}

function wrapTokensIntoLines(
  ctx: CanvasRenderingContext2D,
  tokens: WordTokenDraw[],
  maxLineWidth: number,
  spaceWidth: number
): WordTokenDraw[][] {
  const lines: WordTokenDraw[][] = [];
  let current: WordTokenDraw[] = [];
  let currentWidth = 0;

  for (const tok of tokens) {
    const w = ctx.measureText(tok.text).width;
    const nextWidth = current.length === 0 ? w : currentWidth + spaceWidth + w;
    if (current.length > 0 && nextWidth > maxLineWidth) {
      lines.push(current);
      current = [tok];
      currentWidth = w;
    } else {
      current.push(tok);
      currentWidth = nextWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function drawCaptionOverlayOnCanvas(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  settings: ResolvedEditorSettings,
  caption: ActiveCaptionFrame
) {
  const scaleRef = Math.min(outW / 360, outH / 640);
  const scaledFontPx = Math.max(14, Math.round(settings.fontSize * Math.max(0.85, scaleRef * 1.08)));
  const tpl = settings.templateId;
  const fontStack = getFontStack(settings.fontFamily);

  const isUppercase =
    tpl === 'bold-viral' || tpl === 'gaming' || tpl === 'neon' || tpl === 'word-by-word';
  const isItalic = tpl === 'gaming';
  const fontWeight =
    tpl === 'bold-viral' || tpl === 'gaming' || tpl === 'word-by-word' || tpl === 'meme-style'
      ? 800
      : tpl === 'cinematic' || tpl === 'minimal-white'
        ? 500
        : 700;

  // Vertical anchor matching DOM CaptionRenderer positions
  const baseYRatio =
    settings.textPosition === 'top'
      ? 0.16
      : settings.textPosition === 'center'
        ? 0.5
        : 0.82;
  const anchorY = outH * baseYRatio + (settings.verticalOffset / 100) * outH * 0.45;

  const padX = Math.round(outW * 0.08);
  const maxTextWidth = outW - padX * 2;

  ctx.save();
  ctx.textBaseline = 'middle';

  const drawSpeakerBadgeAbove = (captionTopY: number) => {
    if (!settings.showSpeakerLabels || !caption.speaker) return;
    ctx.save();
    const spFont = Math.max(11, Math.round(scaledFontPx * 0.44));
    ctx.font = `700 ${spFont}px ${fontStack}`;
    const labelText = caption.speaker.toUpperCase();
    const lw = ctx.measureText(labelText).width + 18;
    const lh = spFont + 10;
    const lx =
      settings.alignment === 'left'
        ? padX
        : settings.alignment === 'right'
          ? outW - padX - lw
          : (outW - lw) / 2;
    const ly = Math.max(16, captionTopY - lh - 10);

    ctx.fillStyle = 'rgba(139, 92, 246, 0.92)';
    drawRoundedRect(ctx, lx, ly, lw, lh, 6);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, lx + lw / 2, ly + lh / 2 + 1);
    ctx.restore();
  };

  // Template 10: Word by Word (single animated word)
  if (tpl === 'word-by-word') {
    const active = caption.words[caption.activeWordIndex] || caption.words[0];
    const displayWord = isUppercase ? active.word.toUpperCase() : active.word;
    const speedMult =
      settings.animationSpeed === 'fast' ? 1.4 : settings.animationSpeed === 'slow' ? 0.6 : 1.0;
    const popScale = 1 + Math.sin(Math.min(1, caption.wordProgress * speedMult) * Math.PI) * 0.12;
    const wordFont = Math.round(scaledFontPx * 1.25);

    drawSpeakerBadgeAbove(anchorY - (wordFont * 1.35) / 2);

    ctx.font = `800 ${wordFont}px ${fontStack}`;
    ctx.translate(outW / 2, anchorY);
    ctx.scale(popScale, popScale);
    ctx.textAlign = 'center';

    if (settings.backgroundOpacity > 0) {
      const tw = ctx.measureText(displayWord).width + 26;
      const th = wordFont * 1.35;
      ctx.fillStyle = hexToRgba(settings.backgroundColor, settings.backgroundOpacity);
      drawRoundedRect(ctx, -tw / 2, -th / 2, tw, th, 10);
      ctx.fill();
    }

    applyShadow(ctx, settings.shadowStyle);
    if (settings.outlineWidth > 0) {
      ctx.lineWidth = settings.outlineWidth * 2;
      ctx.strokeStyle = settings.outlineColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(displayWord, 0, 0);
    }
    ctx.fillStyle = settings.highlightColor;
    ctx.fillText(displayWord, 0, 0);
    ctx.restore();
    return;
  }

  // Multi-word templates
  const effectiveFontSize =
    tpl === 'cinematic'
      ? Math.max(13, Math.round(scaledFontPx * 0.82))
      : tpl === 'minimal-white'
        ? Math.max(14, Math.round(scaledFontPx * 0.86))
        : scaledFontPx;

  ctx.font = `${isItalic ? 'italic ' : ''}${fontWeight} ${effectiveFontSize}px ${fontStack}`;
  const spaceWidth = ctx.measureText(' ').width * (tpl === 'color-highlight' ? 1.5 : 1.05);

  const tokens: WordTokenDraw[] = caption.words.map((w, idx) => ({
    text: isUppercase ? w.word.toUpperCase() : w.word,
    rawIndex: idx,
    isKeyword: Boolean(w.isKeyword),
    isActive: idx === caption.activeWordIndex,
    isSpoken: idx <= caption.activeWordIndex,
  }));

  const lines = wrapTokensIntoLines(ctx, tokens, maxTextWidth, spaceWidth);
  const lineHeight = Math.round(effectiveFontSize * (tpl === 'color-highlight' ? 1.48 : 1.32));
  const totalHeight = lines.length * lineHeight;
  const startY = anchorY - totalHeight / 2 + lineHeight / 2;

  // Measure bounding box for background bar (Podcast Pro, Meme, Cinematic, Karaoke, or custom opacity)
  const lineWidths = lines.map((line) =>
    line.reduce((sum, tok, i) => sum + ctx.measureText(tok.text).width + (i > 0 ? spaceWidth : 0), 0)
  );
  const maxRenderedWidth = Math.max(...lineWidths, 40);

  const shouldDrawBox =
    settings.backgroundOpacity > 0 || tpl === 'meme-style' || tpl === 'podcast-pro';
  const boxPadY = 10;
  const captionBlockTopY = shouldDrawBox
    ? anchorY - (totalHeight + boxPadY * 2) / 2
    : anchorY - totalHeight / 2;

  drawSpeakerBadgeAbove(captionBlockTopY);

  if (shouldDrawBox) {
    const boxBgColor = tpl === 'meme-style' && settings.backgroundOpacity === 0 ? '#FFFFFF' : settings.backgroundColor;
    const boxOpacity =
      tpl === 'meme-style'
        ? Math.max(85, settings.backgroundOpacity)
        : settings.backgroundOpacity > 0
          ? settings.backgroundOpacity
          : tpl === 'podcast-pro'
            ? 80
            : 0;

    if (boxOpacity > 0) {
      const boxPadX = tpl === 'meme-style' ? 18 : 16;
      const boxW = Math.min(outW - 24, maxRenderedWidth + boxPadX * 2);
      const boxH = totalHeight + boxPadY * 2;
      const boxX =
        settings.alignment === 'left'
          ? Math.max(12, padX - boxPadX)
          : settings.alignment === 'right'
            ? Math.min(outW - 12 - boxW, outW - padX - maxRenderedWidth - boxPadX)
            : (outW - boxW) / 2;
      const boxY = anchorY - boxH / 2;

      ctx.save();
      ctx.fillStyle = hexToRgba(boxBgColor, boxOpacity);
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, tpl === 'meme-style' ? 8 : 10);
      ctx.fill();
      if (tpl === 'podcast-pro') {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Draw each line word-by-word so highlights, Color Pop boxes, Karaoke sweeps, and Neon glows match 1:1
  lines.forEach((line, lineIdx) => {
    const lw = lineWidths[lineIdx];
    const lineY = startY + lineIdx * lineHeight;
    let cursorX =
      settings.alignment === 'left'
        ? padX
        : settings.alignment === 'right'
          ? outW - padX - lw
          : (outW - lw) / 2;

    for (const tok of line) {
      const tw = ctx.measureText(tok.text).width;
      const centerX = cursorX + tw / 2;

      ctx.save();
      ctx.textAlign = 'center';

      // Determine word color & badge style per template
      let fillColor = settings.fontColor;
      let pillBg: string | null = null;
      let glowColor: string | undefined;

      if (tpl === 'bold-viral') {
        fillColor = tok.isActive || tok.isKeyword ? settings.highlightColor : settings.fontColor;
      } else if (tpl === 'podcast-pro') {
        // Clean white subtitles with selected yellow (or custom highlight) keywords
        fillColor = tok.isActive || tok.isKeyword ? settings.highlightColor : settings.fontColor;
      } else if (tpl === 'color-highlight') {
        // Color Pop: different vibrant highlight colors for active/important words
        if (tok.isActive) {
          pillBg = pickColorPopForWord(tok.rawIndex, settings.highlightColor);
          fillColor = '#FFFFFF';
        } else if (tok.isKeyword) {
          fillColor = pickColorPopForWord(tok.rawIndex + 1, settings.highlightColor);
        } else {
          fillColor = settings.fontColor;
        }
      } else if (tpl === 'karaoke') {
        fillColor = tok.isSpoken ? settings.highlightColor : settings.fontColor;
      } else if (tpl === 'minimal-white') {
        fillColor = settings.fontColor;
      } else if (tpl === 'meme-style') {
        fillColor = tok.isActive ? settings.highlightColor : settings.fontColor;
      } else if (tpl === 'gaming') {
        if (tok.isActive) {
          fillColor = GAMING_PALETTE[tok.rawIndex % GAMING_PALETTE.length];
          glowColor = fillColor;
        } else if (tok.isKeyword) {
          fillColor = settings.highlightColor;
        } else {
          fillColor = settings.fontColor;
        }
      } else if (tpl === 'neon') {
        fillColor = tok.isActive ? '#FFFFFF' : settings.fontColor;
        glowColor = settings.highlightColor;
      } else if (tpl === 'cinematic') {
        fillColor = tok.isActive ? settings.highlightColor : settings.fontColor;
      }

      if (pillBg) {
        const px = 7;
        const py = 4;
        ctx.fillStyle = pillBg;
        drawRoundedRect(
          ctx,
          cursorX - px,
          lineY - effectiveFontSize * 0.58 - py / 2,
          tw + px * 2,
          effectiveFontSize * 1.16 + py,
          6
        );
        ctx.fill();
      }

      if (tpl === 'gaming') {
        ctx.translate(centerX, lineY);
        ctx.transform(1, 0, -0.12, 1, 0, 0); // italic esports skew
      } else {
        ctx.translate(centerX, lineY);
      }

      if (tok.isActive && (tpl === 'bold-viral' || tpl === 'gaming')) {
        ctx.scale(1.06, 1.06);
      }

      applyShadow(ctx, settings.shadowStyle, glowColor);

      if (settings.outlineWidth > 0 && tpl !== 'meme-style' && tpl !== 'minimal-white') {
        ctx.lineWidth = settings.outlineWidth * 1.8;
        ctx.strokeStyle = settings.outlineColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(tok.text, 0, 0);
      }

      ctx.fillStyle = fillColor;
      ctx.fillText(tok.text, 0, 0);
      ctx.restore();

      cursorX += tw + spaceWidth;
    }
  });

  ctx.restore();
}

function drawReactionOverlaysOnCanvas(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  reaction: EvaluatedReactionFrame
) {
  // Subtle dramatic vignette for freeze-frame, dramatic zoom, reaction emphasis, comedic pause
  if (reaction.vignetteAlpha > 0.01) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      outW / 2,
      outH / 2,
      Math.min(outW, outH) * 0.25,
      outW / 2,
      outH / 2,
      Math.max(outW, outH) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(0.75, reaction.vignetteAlpha)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  // Camera shutter white flash on freeze-frame entry
  if (reaction.flashAlpha > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, reaction.flashAlpha)})`;
    ctx.fillRect(0, 0, outW, outH);
    ctx.restore();
  }

  // Meme Text Callout (top-upper safe area)
  if (reaction.memeText) {
    ctx.save();
    const fontSize = Math.max(18, Math.round(outW * 0.068));
    ctx.font = `800 ${fontSize}px "Oswald", "Montserrat", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = reaction.memeText.toUpperCase();
    const y = Math.round(outH * 0.14);

    ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.16));
    ctx.strokeStyle = '#09090B';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;
    ctx.strokeText(text, outW / 2, y, outW * 0.88);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, outW / 2, y, outW * 0.88);
    ctx.restore();
  }

  // Emoji Overlay (upper-right energetic pop)
  if (reaction.emojiOverlay) {
    ctx.save();
    const emojiSize = Math.max(36, Math.round(outW * 0.14));
    ctx.translate(outW * 0.82, outH * 0.24);
    ctx.scale(reaction.emojiOverlay.scale, reaction.emojiOverlay.scale);
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(reaction.emojiOverlay.emoji, 0, 0);
    ctx.restore();
  }
}

/**
 * Deterministic Canvas 2D compositor for rendering a single video frame with:
 * - Video formatting (Center, Smart, Background Blur, Face-Centered, Manual Crop)
 * - Accepted Funny Reaction Effects (Zoom, Freeze, Slow-Mo, Pause, Emphasis, Meme Text, Emoji)
 * - Synced Automatic Captions in all 10 templates & customization styles (EN / HI / Hinglish)
 */
export function renderClipFrameToCanvas(params: {
  ctx: CanvasRenderingContext2D;
  source: HTMLVideoElement | HTMLImageElement;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  editor: ClipEditorSettings;
  relTimeSec: number;
  clipDurationSec: number;
}): { reaction: EvaluatedReactionFrame; caption: ActiveCaptionFrame | null } {
  const { ctx, source, sourceWidth, sourceHeight, outputWidth, outputHeight, relTimeSec, clipDurationSec } =
    params;

  const settings = resolveEditorSettings(params.editor);
  const reaction = evaluateReactionEffectsAtTime(settings.reactionEffects, relTimeSec, clipDurationSec);
  const caption = getActiveCaptionAtTime(
    settings.captions,
    relTimeSec,
    settings.captionText,
    clipDurationSec
  );

  const geo = computeCropGeometry({
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    cropMode: settings.cropMode,
    zoomPercent: settings.zoom,
    cropXPercent: settings.cropX,
    cropYPercent: settings.cropY,
    faceAnchorX: settings.faceAnchorX,
    faceAnchorY: settings.faceAnchorY,
    extraZoomScale: reaction.extraZoomScale,
  });

  // Base fill
  ctx.save();
  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  // 1. Background Blur backdrop when enabled
  if (geo.drawBackgroundBlur && geo.bgRect) {
    ctx.save();
    ctx.filter = 'blur(22px) brightness(0.68)';
    ctx.drawImage(source, geo.bgRect.dx, geo.bgRect.dy, geo.bgRect.dw, geo.bgRect.dh);
    ctx.restore();

    ctx.fillStyle = 'rgba(9, 9, 11, 0.25)';
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  }

  // 2. Crisp Foreground Video Frame
  ctx.save();
  if (reaction.freezeActive) {
    ctx.filter = 'contrast(1.08) saturate(0.82)';
  }
  ctx.drawImage(source, geo.fgRect.dx, geo.fgRect.dy, geo.fgRect.dw, geo.fgRect.dh);
  ctx.restore();

  // 3. Measured readability scrim for captions
  const scrim = ctx.createLinearGradient(0, outputHeight * 0.58, 0, outputHeight);
  scrim.addColorStop(0, 'rgba(9,9,11,0)');
  scrim.addColorStop(1, 'rgba(9,9,11,0.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, outputHeight * 0.58, outputWidth, outputHeight * 0.42);

  // 4. Reaction overlays (vignette, freeze flash, meme text, emoji)
  drawReactionOverlaysOnCanvas(ctx, outputWidth, outputHeight, reaction);

  // 5. Synced Caption Template overlay
  if (caption) {
    drawCaptionOverlayOnCanvas(ctx, outputWidth, outputHeight, settings, caption);
  }

  ctx.restore();
  return { reaction, caption };
}
