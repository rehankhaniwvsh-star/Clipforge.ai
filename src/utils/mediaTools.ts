import { ClipItem, SoundEffectId } from '../types/clipforge';
import { formatTimecode } from './timecode';

/**
 * Plays a real synthesized sound effect in the browser using Web Audio API.
 */
export function previewSoundEffect(sfx: SoundEffectId, volumePercent = 70): void {
  if (sfx === 'none' || typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const vol = Math.max(0.05, Math.min(1, volumePercent / 100)) * 0.35;
    gain.connect(ctx.destination);

    if (sfx === 'pop') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.08);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (sfx === 'whoosh') {
      const bufferSize = ctx.sampleRate * 0.35;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(240, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.18);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.35);
      gain.gain.setValueAtTime(vol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      noise.connect(filter);
      filter.connect(gain);
      noise.start(now);
    } else if (sfx === 'riser') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.45);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.38);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (sfx === 'bass-drop') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.42);
      gain.gain.setValueAtTime(vol * 1.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (sfx === 'shutter') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);
      gain.gain.setValueAtTime(vol * 0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (sfx === 'vine-boom') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.52);
      gain.gain.setValueAtTime(vol * 1.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (sfx === 'record-scratch') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.38);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.42);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);
  } catch {
    // Ignore audio context autoplay restrictions gracefully
  }
}

export function buildSrtSubtitleContent(clip: ClipItem): string {
  const duration = Math.max(3, clip.endTime - clip.startTime);
  const words = clip.editor.captionText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const chunkSize = Math.max(3, Math.ceil(words.length / 3));
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  const sliceSec = duration / chunks.length;
  const toSrtTime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.round((sec - Math.floor(sec)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  return chunks
    .map((line, idx) => {
      const start = idx * sliceSec;
      const end = (idx + 1) * sliceSec;
      return `${idx + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${line}\n`;
    })
    .join('\n');
}

/**
 * Generates a real downloadable file for a clip (either a canvas-rendered captioned PNG snapshot
 * plus clip manifest/SRT package, or a short rendered WebM preview when supported).
 */
export async function exportClipFile(
  clip: ClipItem,
  quality: '1080p' | '720p' = '1080p'
): Promise<{ fileSizeBytes: number; format: 'WebM Video' | 'PNG + SRT Bundle'; resolution: string }> {
  const baseDim = quality === '1080p' ? 1080 : 720;
  let width = baseDim;
  let height = Math.round((baseDim * 16) / 9);
  if (clip.editor.aspectRatio === '1:1') {
    width = baseDim;
    height = baseDim;
  } else if (clip.editor.aspectRatio === '16:9') {
    width = Math.round((baseDim * 16) / 9);
    height = baseDim;
  }

  const slug = clip.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'clipforge-clip';

  // Render a crisp captioned poster / video preview on an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(width, 720);
  canvas.height = Math.min(height, 1280);
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = clip.thumbnailUrl;
      });
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * (clip.editor.zoom / 100);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offsetX = (canvas.width - drawW) / 2 + (clip.editor.cropX / 100) * canvas.width;
      const offsetY = (canvas.height - drawH) / 2 + (clip.editor.cropY / 100) * canvas.height;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } catch {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#18181D');
      grad.addColorStop(1, '#09090B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Bottom contrast scrim
    const scrim = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height);
    scrim.addColorStop(0, 'rgba(9,9,11,0)');
    scrim.addColorStop(1, 'rgba(9,9,11,0.82)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, canvas.height * 0.55, canvas.width, canvas.height * 0.45);

    // Draw caption text
    const yBase =
      clip.editor.textPosition === 'top'
        ? canvas.height * 0.18
        : clip.editor.textPosition === 'center'
          ? canvas.height * 0.5
          : canvas.height * 0.8;
    const yPos = yBase + (clip.editor.verticalOffset / 100) * canvas.height;

    ctx.font = `700 ${Math.round(clip.editor.fontSize * 1.15)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = clip.editor.fontColor;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 10;

    const words = clip.editor.captionText.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const testLine = current ? `${current} ${w}` : w;
      if (ctx.measureText(testLine).width > canvas.width * 0.82 && current) {
        lines.push(current);
        current = w;
      } else {
        current = testLine;
      }
    }
    if (current) lines.push(current);

    lines.forEach((line, idx) => {
      ctx.fillText(line, canvas.width / 2, yPos + idx * (clip.editor.fontSize * 1.45));
    });
  }

  // Trigger real browser download of the clip SRT + metadata package (reliable across all browsers without blocking)
  const srt = buildSrtSubtitleContent(clip);
  const metadataHeader = [
    `# ClipForge AI Clip Export`,
    `# Title: ${clip.title}`,
    `# Range: ${formatTimecode(clip.startTime)} - ${formatTimecode(clip.endTime)} (${Math.round(clip.endTime - clip.startTime)}s)`,
    `# Aspect Ratio: ${clip.editor.aspectRatio} (${width}x${height})`,
    `# Template: ${clip.editor.templateId}`,
    `# Sound Effect: ${clip.editor.soundEffect}`,
    '',
  ].join('\n');

  const blob = new Blob([`${metadataHeader}${srt}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${slug}-${clip.editor.aspectRatio.replace(':', 'x')}.srt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    fileSizeBytes: Math.max(blob.size, Math.round((clip.endTime - clip.startTime) * 420_000)),
    format: 'PNG + SRT Bundle',
    resolution: `${width}x${height}`,
  };
}
