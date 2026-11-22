import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReelOrbitPose,
  getFrontReelIndex,
  getOrbitAngleForIndex,
  normalizeAngle,
  shortestAngularDelta,
} from './reelOrbit';

test('normalizeAngle wraps negative and >2PI angles into [0, 2PI)', () => {
  assert.ok(Math.abs(normalizeAngle(-Math.PI / 2) - (3 * Math.PI) / 2) < 1e-6);
  assert.ok(Math.abs(normalizeAngle(Math.PI * 3) - Math.PI) < 1e-6);
  assert.equal(normalizeAngle(0), 0);
});

test('shortestAngularDelta chooses shortest arc across the 0/2PI seam', () => {
  const delta = shortestAngularDelta(Math.PI * 1.9, Math.PI * 0.1);
  assert.ok(Math.abs(delta - Math.PI * 0.2) < 1e-6);

  const reverse = shortestAngularDelta(Math.PI * 0.1, Math.PI * 1.9);
  assert.ok(Math.abs(reverse + Math.PI * 0.2) < 1e-6);
});

test('computeReelOrbitPose places index 0 at front center with highest scale and zIndex at angle 0', () => {
  const poses = [0, 1, 2, 3, 4].map((i) => computeReelOrbitPose(i, 5, 0, 320, 22));
  const front = poses[0];

  assert.equal(front.isFront, true);
  assert.equal(front.x, 0);
  assert.equal(front.y, 0);
  assert.equal(front.zIndex, 100);
  assert.equal(front.opacity, 1);

  for (let i = 1; i < poses.length; i++) {
    assert.equal(poses[i].isFront, false);
    assert.ok(poses[i].scale < front.scale);
    assert.ok(poses[i].zIndex < front.zIndex);
  }

  // Left and right neighbors are symmetric around x = 0
  assert.ok(Math.abs(poses[1].x + poses[4].x) < 0.05);
  assert.ok(Math.abs(poses[2].x + poses[3].x) < 0.05);
});

test('getOrbitAngleForIndex and getFrontReelIndex round-trip for every card in the circle', () => {
  const total = 5;
  for (let i = 0; i < total; i++) {
    const angle = getOrbitAngleForIndex(i, total);
    assert.equal(getFrontReelIndex(total, angle), i);
    const pose = computeReelOrbitPose(i, total, angle, 300, 20);
    assert.equal(pose.isFront, true);
    assert.equal(pose.zIndex, 100);
  }
});
