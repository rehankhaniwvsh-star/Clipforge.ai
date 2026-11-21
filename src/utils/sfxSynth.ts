import { ReactionEffectItem, SoundEffectId } from '../types/clipforge';

const SAMPLE_RATE = 22050;

function generateSfxSamples(sfx: SoundEffectId, volumeScale: number): Float32Array {
  if (sfx === 'none') return new Float32Array(0);
  const amp = Math.max(0.05, Math.min(1, volumeScale)) * 0.45;

  if (sfx === 'pop') {
    const len = Math.floor(SAMPLE_RATE * 0.14);
    const out = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / SAMPLE_RATE;
      const freq = 320 * Math.pow(760 / 320, Math.min(1, t / 0.08));
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      const env = Math.exp(-t * 28);
      out[i] = Math.sin(phase) * env * amp;
    }
    return out;
  }

  if (sfx === 'whoosh') {
    const len = Math.floor(SAMPLE_RATE * 0.36);
    const out = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < len; i += 1) {
      const frac = i / len;
      const noise = Math.random() * 2 - 1;
      // Simple moving-average smoothing whose cutoff sweeps up then down
      const alpha = 0.08 + Math.sin(frac * Math.PI) * 0.35;
      prev = prev + alpha * (noise - prev);
      const env = Math.sin(frac * Math.PI);
      out[i] = prev * env * amp * 1.4;
    }
    return out;
  }

  if (sfx === 'riser') {
    const len = Math.floor(SAMPLE_RATE * 0.5);
    const out = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / SAMPLE_RATE;
      const freq = 160 * Math.pow(880 / 160, Math.min(1, t / 0.45));
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
      const env = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.1);
      out[i] = tri * env * amp;
    }
    return out;
  }

  if (sfx === 'bass-drop' || sfx === 'vine-boom') {
    const dur = sfx === 'vine-boom' ? 0.65 : 0.48;
    const len = Math.floor(SAMPLE_RATE * dur);
    const out = new Float32Array(len);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / SAMPLE_RATE;
      const startFreq = sfx === 'vine-boom' ? 120 : 145;
      const endFreq = sfx === 'vine-boom' ? 32 : 38;
      const freq = startFreq * Math.pow(endFreq / startFreq, Math.min(1, t / (dur * 0.85)));
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;
      const env = Math.exp(-t * (sfx === 'vine-boom' ? 4.5 : 6.2));
      const punch = sfx === 'vine-boom' && t < 0.03 ? (Math.random() * 2 - 1) * 0.3 : 0;
      out[i] = Math.tanh((Math.sin(phase) * 1.6 + punch) * env) * amp * 1.35;
    }
    return out;
  }

  if (sfx === 'shutter') {
    const len = Math.floor(SAMPLE_RATE * 0.08);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i += 1) {
      const t = i / SAMPLE_RATE;
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 70);
      const tone = Math.sin(2 * Math.PI * (1100 - t * 9000) * t) * Math.exp(-t * 55);
      out[i] = (click * 0.6 + tone * 0.4) * amp;
    }
    return out;
  }

  // record-scratch
  const len = Math.floor(SAMPLE_RATE * 0.42);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 950 * Math.exp(-t * 5.5) + 140 * Math.sin(t * 48);
    phase += (2 * Math.PI * Math.max(80, freq)) / SAMPLE_RATE;
    const saw = ((phase / Math.PI) % 2) - 1;
    const env = Math.sin(Math.min(1, t / 0.42) * Math.PI);
    out[i] = saw * env * amp * 0.85;
  }
  return out;
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

/**
 * Builds a clip-length mono PCM WAV track containing any active intro SFX and
 * accepted reaction sound effects placed at their exact timestamps so FFmpeg.wasm
 * can genuinely mix them into the exported MP4 audio stream.
 * Returns null when no SFX are enabled.
 */
export function buildClipSfxMixWav(params: {
  clipDurationSeconds: number;
  introSoundEffect: SoundEffectId;
  sfxVolumePercent: number;
  reactionEffects: ReactionEffectItem[];
}): Uint8Array | null {
  const events: Array<{ sfx: SoundEffectId; atSec: number; vol: number }> = [];
  const baseVol = Math.max(0.1, Math.min(1, (params.sfxVolumePercent || 65) / 100));

  if (params.introSoundEffect && params.introSoundEffect !== 'none') {
    events.push({ sfx: params.introSoundEffect, atSec: 0.05, vol: baseVol });
  }

  for (const fx of params.reactionEffects) {
    if (fx.status !== 'accepted') continue;
    const sfx = fx.soundEffect;
    if (sfx && sfx !== 'none') {
      events.push({
        sfx,
        atSec: Math.max(0, fx.startTime),
        vol: baseVol * ((fx.intensity ?? 75) / 100),
      });
    } else if (fx.type === 'freeze-frame') {
      events.push({ sfx: 'shutter', atSec: Math.max(0, fx.startTime), vol: baseVol * 0.85 });
    }
  }

  if (events.length === 0) return null;

  const totalSamples = Math.max(SAMPLE_RATE, Math.ceil(params.clipDurationSeconds * SAMPLE_RATE));
  const mix = new Float32Array(totalSamples);

  for (const ev of events) {
    const sfxBuf = generateSfxSamples(ev.sfx, ev.vol);
    const startSample = Math.floor(ev.atSec * SAMPLE_RATE);
    for (let i = 0; i < sfxBuf.length; i += 1) {
      const idx = startSample + i;
      if (idx >= 0 && idx < totalSamples) {
        mix[idx] = Math.max(-0.98, Math.min(0.98, mix[idx] + sfxBuf[i]));
      }
    }
  }

  return encodeMonoWav(mix, SAMPLE_RATE);
}
