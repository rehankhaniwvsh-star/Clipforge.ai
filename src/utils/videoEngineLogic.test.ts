import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAspectFilterExpression,
  buildFfmpegAudioChunkArgs,
  buildFfmpegTrimArgs,
  checkBrowserMemoryBudget,
  classifyProcessingError,
  planAudioChunks,
  validateTrimTimestamps,
  validateUploadFile,
} from './videoEngineLogic';

test('validateUploadFile accepts MP4, WebM, and MOV within size limit and warns on MOV', () => {
  const mp4 = validateUploadFile({ name: 'podcast.mp4', size: 12_000_000, type: 'video/mp4' }, 300);
  assert.equal(mp4.valid, true);
  assert.equal(mp4.normalizedMime, 'video/mp4');
  assert.equal(mp4.warning, undefined);

  const webm = validateUploadFile({ name: 'capture.webm', size: 5_000_000, type: 'video/webm' }, 300);
  assert.equal(webm.valid, true);

  const mov = validateUploadFile({ name: 'iphone.mov', size: 25_000_000, type: 'video/quicktime' }, 300);
  assert.equal(mov.valid, true);
  assert.ok(mov.warning && mov.warning.includes('MOV'));
});

test('validateUploadFile enforces configurable file size limit and rejects invalid formats', () => {
  const tooLarge = validateUploadFile(
    { name: 'huge.mp4', size: 350 * 1024 * 1024, type: 'video/mp4' },
    300
  );
  assert.equal(tooLarge.valid, false);
  assert.ok(tooLarge.error?.includes('300 MB'));

  const allowedWhenIncreased = validateUploadFile(
    { name: 'huge.mp4', size: 350 * 1024 * 1024, type: 'video/mp4' },
    500
  );
  assert.equal(allowedWhenIncreased.valid, true);

  const badType = validateUploadFile(
    { name: 'notes.pdf', size: 100_000, type: 'application/pdf' },
    300
  );
  assert.equal(badType.valid, false);
  assert.ok(badType.error?.includes('Unsupported format'));

  const empty = validateUploadFile({ name: 'empty.mp4', size: 0, type: 'video/mp4' }, 300);
  assert.equal(empty.valid, false);
});

test('planAudioChunks partitions videos into bounded chunks and respects resource cap', () => {
  const shortPlan = planAudioChunks(75, { chunkDurationSec: 30, maxTotalDurationSec: 600 });
  assert.equal(shortPlan.truncatedByLimit, false);
  assert.equal(shortPlan.chunks.length, 3);
  assert.deepEqual(
    shortPlan.chunks.map((c) => [c.startSec, c.endSec]),
    [
      [0, 30],
      [30, 60],
      [60, 75],
    ]
  );

  const longPlan = planAudioChunks(1800, { chunkDurationSec: 30, maxTotalDurationSec: 300 });
  assert.equal(longPlan.truncatedByLimit, true);
  assert.equal(longPlan.analyzedDuration, 300);
  assert.equal(longPlan.chunks.length, 10);
});

test('buildFfmpegTrimArgs and buildFfmpegAudioChunkArgs produce valid FFmpeg arguments', () => {
  const args = buildFfmpegTrimArgs({
    inputName: 'input.mp4',
    outputName: 'clip.mp4',
    startTime: 4.5,
    endTime: 19.5,
    aspectRatio: '9:16',
    applyReframe: true,
    quality: '720p',
    zoom: 110,
    cropX: 5,
    cropY: -5,
  });

  assert.equal(args[0], '-ss');
  assert.equal(args[1], '4.50');
  assert.ok(args.includes('-t'));
  assert.ok(args.includes('15.00'));
  assert.ok(args.includes('-vf'));
  assert.ok(args.includes('libx264'));
  assert.ok(args.includes('+faststart'));

  const filter = buildAspectFilterExpression('9:16', { quality: '720p', zoom: 100 });
  assert.ok(filter.includes('scale='));
  assert.ok(filter.includes('crop=w='));
  assert.ok(filter.includes("x='max(0,min("));
  assert.ok(filter.includes("y='max(0,min("));

  const audioArgs = buildFfmpegAudioChunkArgs({
    inputName: 'input.mp4',
    outputName: 'chunk_0.wav',
    startSec: 30,
    durationSec: 30,
  });
  assert.ok(audioArgs.includes('-vn'));
  assert.ok(audioArgs.includes('16000'));
  assert.ok(audioArgs.includes('wav'));
});

test('validateTrimTimestamps rejects negative, inverted, out-of-range, and too-short ranges', () => {
  assert.equal(validateTrimTimestamps(-1, 5, 20).valid, false);
  assert.equal(validateTrimTimestamps(10, 5, 20).valid, false);
  assert.equal(validateTrimTimestamps(2, 25, 20).valid, false);
  assert.equal(validateTrimTimestamps(2, 2.2, 20, 1).valid, false);
  assert.equal(validateTrimTimestamps(Number.NaN, 5, 20).valid, false);

  const ok = validateTrimTimestamps(1.5, 6.5, 20, 1);
  assert.equal(ok.valid, true);
  assert.equal(ok.duration, 5);
});

test('checkBrowserMemoryBudget flags files exceeding WASM cap or constrained heap', () => {
  assert.equal(checkBrowserMemoryBudget(20 * 1024 * 1024).ok, true);
  assert.equal(checkBrowserMemoryBudget(600 * 1024 * 1024).ok, false);
  const lowHeap = checkBrowserMemoryBudget(120 * 1024 * 1024, {
    usedJSHeapSize: 1_900_000_000,
    jsHeapSizeLimit: 2_000_000_000,
  });
  assert.equal(lowHeap.ok, false);
});

test('classifyProcessingError categorizes abort, memory, corrupted, codec, network, api, and timestamp errors', () => {
  assert.equal(classifyProcessingError(new DOMException('aborted', 'AbortError')).kind, 'cancelled');
  assert.equal(classifyProcessingError(new Error('RuntimeError: memory access out of bounds')).kind, 'memory');
  assert.equal(classifyProcessingError(new Error('QuotaExceededError: IndexedDB full')).suggestFallback, false);
  assert.equal(classifyProcessingError(new Error('moov atom not found in corrupted file')).kind, 'corrupted');
  assert.equal(classifyProcessingError(new Error('Unsupported codec while encoding')).kind, 'codec');
  assert.equal(classifyProcessingError(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(classifyProcessingError(new TypeError('Failed to fetch')).suggestFallback, false);
  assert.equal(classifyProcessingError(new Error('Gemini API rate limit exceeded')).kind, 'api');
  assert.equal(classifyProcessingError(new Error('Invalid timestamps: end time exceeds duration')).kind, 'timestamp');
  assert.equal(classifyProcessingError(new Error('Unknown pipeline error')).suggestFallback, true);
});
