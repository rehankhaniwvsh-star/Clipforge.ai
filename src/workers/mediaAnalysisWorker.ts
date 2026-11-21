/// <reference lib="webworker" />

export interface AnalyzeWavChunkRequest {
  id: string;
  chunkIndex: number;
  startSec: number;
  wavBuffer: ArrayBuffer;
}

export interface AnalyzeWavChunkResponse {
  id: string;
  chunkIndex: number;
  rmsEnergy: number;
  peakAmplitude: number;
  peakOffsetSec: number;
  sampleRate: number;
  channels: number;
  durationSec: number;
}

/**
 * Parses a standard 16-bit PCM WAV buffer off the main thread and computes
 * real RMS energy, peak amplitude, and peak timestamp offset.
 */
function analyzePcmWav(buffer: ArrayBuffer): {
  rmsEnergy: number;
  peakAmplitude: number;
  peakOffsetSec: number;
  sampleRate: number;
  channels: number;
  durationSec: number;
} {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) {
    return {
      rmsEnergy: 0,
      peakAmplitude: 0,
      peakOffsetSec: 0,
      sampleRate: 16000,
      channels: 1,
      durationSec: 0,
    };
  }

  const channels = view.getUint16(22, true) || 1;
  const sampleRate = view.getUint32(24, true) || 16000;
  const bitsPerSample = view.getUint16(34, true) || 16;

  // Locate the 'data' subchunk safely (WAV headers may contain LIST/INFO chunks before 'data')
  let offset = 12;
  let dataOffset = 44;
  let dataSize = Math.max(0, buffer.byteLength - 44);
  while (offset + 8 <= buffer.byteLength) {
    const chunkId =
      String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buffer.byteLength - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const totalSamples = Math.floor(dataSize / bytesPerSample);
  if (totalSamples <= 0) {
    return {
      rmsEnergy: 0,
      peakAmplitude: 0,
      peakOffsetSec: 0,
      sampleRate,
      channels,
      durationSec: 0,
    };
  }

  let sumSq = 0;
  let peak = 0;
  let peakSampleIndex = 0;

  // Compute real RMS and peak across 16-bit signed PCM samples
  const step = totalSamples > 240_000 ? 2 : 1;
  let counted = 0;
  for (let i = 0; i < totalSamples; i += step) {
    const bytePos = dataOffset + i * bytesPerSample;
    if (bytePos + 1 >= buffer.byteLength) break;
    const sample =
      bitsPerSample === 16
        ? view.getInt16(bytePos, true) / 32768
        : (view.getUint8(bytePos) - 128) / 128;
    const abs = Math.abs(sample);
    sumSq += sample * sample;
    if (abs > peak) {
      peak = abs;
      peakSampleIndex = i;
    }
    counted += 1;
  }

  const rmsEnergy = counted > 0 ? Math.sqrt(sumSq / counted) : 0;
  const durationSec = totalSamples / (sampleRate * channels);
  const peakOffsetSec = peakSampleIndex / (sampleRate * channels);

  return {
    rmsEnergy: Math.round(rmsEnergy * 1000) / 1000,
    peakAmplitude: Math.round(peak * 1000) / 1000,
    peakOffsetSec: Math.round(peakOffsetSec * 100) / 100,
    sampleRate,
    channels,
    durationSec: Math.round(durationSec * 100) / 100,
  };
}

self.onmessage = (event: MessageEvent<AnalyzeWavChunkRequest>) => {
  const { id, chunkIndex, wavBuffer } = event.data;
  const stats = analyzePcmWav(wavBuffer);
  const response: AnalyzeWavChunkResponse = {
    id,
    chunkIndex,
    ...stats,
  };
  self.postMessage(response);
};
