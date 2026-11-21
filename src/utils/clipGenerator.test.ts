import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampTrimRange,
  formatDurationLabel,
  formatFileSize,
  formatTimecode,
} from './timecode';
import {
  computeDashboardMetrics,
  estimateCreditCostMinutes,
  filterAndSortClips,
  generateSegmentsFromVideo,
  validateVideoUrl,
} from './clipGenerator';

test('formatTimecode handles seconds, minutes, and hours accurately', () => {
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(65), '01:05');
  assert.equal(formatTimecode(3661), '01:01:01');
  assert.equal(formatTimecode(-10), '00:00');
});

test('formatDurationLabel and formatFileSize format readable metrics', () => {
  assert.equal(formatDurationLabel(45), '45s');
  assert.equal(formatDurationLabel(120), '2m');
  assert.equal(formatDurationLabel(155), '2m 35s');
  assert.equal(formatFileSize(1024 * 1024 * 42.5), '42.5 MB');
  assert.equal(formatFileSize(512), '512 B');
});

test('clampTrimRange enforces minimum clip duration and source bounds', () => {
  const clamped = clampTrimRange(95, 96, 100, 5);
  assert.equal(clamped.startTime, 95);
  assert.equal(clamped.endTime, 100);

  const inverted = clampTrimRange(50, 20, 120, 5);
  assert.equal(inverted.startTime, 50);
  assert.equal(inverted.endTime, 55);
});

test('validateVideoUrl distinguishes YouTube, direct media files, and unsupported platforms', () => {
  assert.equal(validateVideoUrl('').status, 'empty');
  assert.equal(validateVideoUrl('not-a-url').status, 'invalid');
  const yt = validateVideoUrl('https://www.youtube.com/live/l-oEKLu4Y3w?si=FX-ZArBdjPCUKv2t');
  assert.equal(yt.status, 'youtube');
  assert.equal(yt.youtubeVideoId, 'l-oEKLu4Y3w');
  assert.equal(validateVideoUrl('https://cdn.example.com/studio/clip.mp4').status, 'direct-media');
  const twitch = validateVideoUrl('https://twitch.tv/videos/12345');
  assert.equal(twitch.status, 'unsupported-platform');
  assert.equal(twitch.platformName, 'Twitch');
});

test('generateSegmentsFromVideo creates exact requested count within source duration', () => {
  const clips = generateSegmentsFromVideo({
    projectId: 'proj-test',
    sourceDuration: 600,
    config: {
      category: 'Funny Moments',
      duration: 30,
      count: 5,
      aspectRatio: '9:16',
    },
    thumbnailUrl: '/sample.jpg',
    defaultTemplateId: 'bold-viral',
  });

  assert.equal(clips.length, 5);
  for (const clip of clips) {
    assert.ok(clip.startTime >= 0, 'startTime should be >= 0');
    assert.ok(clip.endTime <= 600, 'endTime should be <= sourceDuration');
    assert.equal(Math.round(clip.endTime - clip.startTime), 30);
    assert.equal(clip.category, 'Funny Moments');
    assert.equal(clip.editor.aspectRatio, '9:16');
  }
});

test('filterAndSortClips filters by category/search and sorts deterministically', () => {
  const clips = generateSegmentsFromVideo({
    projectId: 'proj-a',
    sourceDuration: 400,
    config: {
      category: 'Podcast',
      duration: 45,
      count: 3,
      aspectRatio: '9:16',
    },
    thumbnailUrl: '/sample.jpg',
    defaultTemplateId: 'podcast-pro',
  });

  const sortedByTime = filterAndSortClips(clips, { sortBy: 'timestamp' });
  assert.ok(sortedByTime[0].startTime <= sortedByTime[1].startTime);

  const noMatch = filterAndSortClips(clips, { category: 'Gaming' });
  assert.equal(noMatch.length, 0);

  const searchMatch = filterAndSortClips(clips, { search: 'founder' });
  assert.equal(searchMatch.length, 1);
});

test('estimateCreditCostMinutes and computeDashboardMetrics calculate expected totals', () => {
  assert.equal(estimateCreditCostMinutes(180, 3), 4);
  const metrics = computeDashboardMetrics(
    [
      {
        id: 'p1',
        name: 'Test',
        fileName: 'test.mp4',
        fileSizeBytes: 1000,
        durationSeconds: 120,
        resolution: '1920x1080',
        sourceType: 'local-upload',
        thumbnailUrl: '/a.jpg',
        category: 'Podcast',
        aspectRatio: '9:16',
        status: 'Ready',
        clipCount: 3,
        createdAt: '2026-11-20T00:00:00Z',
        pipelineNote: 'Local',
      },
      {
        id: 'p2',
        name: 'Test 2',
        fileName: 'test2.mp4',
        fileSizeBytes: 2000,
        durationSeconds: 240,
        resolution: '1920x1080',
        sourceType: 'sample-studio',
        thumbnailUrl: '/b.jpg',
        category: 'Gaming',
        aspectRatio: '9:16',
        status: 'Processing',
        clipCount: 0,
        createdAt: '2026-11-20T00:00:00Z',
        pipelineNote: 'Local',
      },
    ],
    [],
    120
  );
  assert.equal(metrics.totalVideos, 2);
  assert.equal(metrics.processingProjects, 1);
  assert.equal(metrics.availableCreditsMinutes, 120);
});
