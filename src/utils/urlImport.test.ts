import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampYouTubeAnalysisWindow,
  classifyVideoUrl,
  parseIso8601Duration,
  parseYouTubeTimestampParam,
} from './urlImport';
import { isPrivateOrReservedIp } from '../../server/urlSecurity';

test('classifyVideoUrl recognizes YouTube watch, live, shorts, embed, and youtu.be URLs', () => {
  const live = classifyVideoUrl('https://www.youtube.com/live/l-oEKLu4Y3w?si=FX-ZArBdjPCUKv2t');
  assert.equal(live.status, 'youtube');
  assert.equal(live.youtubeVideoId, 'l-oEKLu4Y3w');
  assert.equal(live.canonicalUrl, 'https://www.youtube.com/watch?v=l-oEKLu4Y3w');

  const watch = classifyVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m15s');
  assert.equal(watch.status, 'youtube');
  assert.equal(watch.youtubeVideoId, 'dQw4w9WgXcQ');
  assert.equal(watch.startSeconds, 135);

  const shortLink = classifyVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=45');
  assert.equal(shortLink.status, 'youtube');
  assert.equal(shortLink.youtubeVideoId, 'dQw4w9WgXcQ');
  assert.equal(shortLink.startSeconds, 45);

  const shorts = classifyVideoUrl('https://www.youtube.com/shorts/l-oEKLu4Y3w');
  assert.equal(shorts.status, 'youtube');
  assert.equal(shorts.youtubeVideoId, 'l-oEKLu4Y3w');

  const invalidYt = classifyVideoUrl('https://www.youtube.com/watch?v=too_short');
  assert.equal(invalidYt.status, 'invalid');

  const unsafeScheme = classifyVideoUrl('javascript:alert(1)');
  assert.equal(unsafeScheme.status, 'invalid');
});

test('parseIso8601Duration and parseYouTubeTimestampParam parse hours, minutes, and seconds', () => {
  assert.equal(parseIso8601Duration('PT240M10S'), 14410);
  assert.equal(parseIso8601Duration('PT1H2M3S'), 3723);
  assert.equal(parseIso8601Duration('PT45S'), 45);
  assert.equal(parseIso8601Duration('invalid'), 0);

  assert.equal(parseYouTubeTimestampParam('90'), 90);
  assert.equal(parseYouTubeTimestampParam('1h02m05s'), 3725);
  assert.equal(parseYouTubeTimestampParam('invalid'), undefined);
});

test('clampYouTubeAnalysisWindow enforces max 20-minute window inside video bounds', () => {
  const longStream = clampYouTubeAnalysisWindow(14410, 0, undefined);
  assert.equal(longStream.startSec, 0);
  assert.equal(longStream.endSec, 600);
  assert.equal(longStream.isWindowed, true);

  const capped = clampYouTubeAnalysisWindow(14410, 1200, 5000);
  assert.equal(capped.startSec, 1200);
  assert.equal(capped.endSec, 2400);

  const shortVid = clampYouTubeAnalysisWindow(180, 0, 180);
  assert.equal(shortVid.startSec, 0);
  assert.equal(shortVid.endSec, 180);
  assert.equal(shortVid.isWindowed, false);
});

test('isPrivateOrReservedIp blocks loopback, RFC1918, cloud metadata, and IPv6 local addresses', () => {
  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIp('10.0.0.5'), true);
  assert.equal(isPrivateOrReservedIp('172.16.10.2'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.10'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('fe80::1'), true);
  assert.equal(isPrivateOrReservedIp('fc00::1'), true);
  assert.equal(isPrivateOrReservedIp('93.184.216.34'), false);
});
