import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeCropGeometry,
  evaluateReactionEffectsAtTime,
  getActiveCaptionAtTime,
  normalizeCaptionSegments,
  updateCaptionSegmentText,
  validateCaptionReactionRequestBody,
  validateReactionSuggestions,
} from './captionReactionLogic';
import { ReactionEffectItem } from '../types/clipforge';

describe('captionReactionLogic', () => {
  it('normalizes word-level captions and preserves speaker labels and punctuation', () => {
    const raw = [
      {
        start: 0.2,
        end: 2.6,
        speaker: 'Host',
        language: 'hinglish',
        text: 'Bhai, yeh cat video viral ho gaya!',
        words: [
          { word: 'Bhai,', start: 0.2, end: 0.6, isKeyword: true },
          { word: 'yeh', start: 0.6, end: 0.9 },
          { word: 'cat', start: 0.9, end: 1.2, isKeyword: true },
          { word: 'video', start: 1.2, end: 1.6 },
          { word: 'viral', start: 1.6, end: 2.0, isKeyword: true },
          { word: 'ho', start: 2.0, end: 2.2 },
          { word: 'gaya!', start: 2.2, end: 2.6, isKeyword: true },
        ],
      },
    ];

    const out = normalizeCaptionSegments(raw, 10);
    assert.equal(out.hasWordTimestamps, true);
    assert.equal(out.segments.length, 1);
    assert.equal(out.segments[0].speaker, 'Host');
    assert.equal(out.segments[0].language, 'hinglish');
    assert.equal(out.segments[0].words?.length, 7);

    const frame = getActiveCaptionAtTime(out.segments, 1.75, '', 10);
    assert.ok(frame);
    assert.equal(frame.activeWordIndex, 4);
    assert.equal(frame.words[frame.activeWordIndex].word, 'viral');
  });

  it('falls back gracefully to proportional word timing when only sentence-level timestamps exist', () => {
    const raw = [
      { start: 0, end: 3.0, text: 'यह वीडियो बहुत मजेदार है।' },
    ];
    const out = normalizeCaptionSegments(raw, 6);
    assert.equal(out.hasWordTimestamps, false);
    assert.equal(out.segments.length, 1);
    assert.equal(out.segments[0].words?.length, 5);

    const updated = updateCaptionSegmentText(out.segments, out.segments[0].id, 'Edited caption text!');
    assert.equal(updated[0].text, 'Edited caption text!');
    assert.equal(updated[0].words?.length, 3);
  });

  it('filters unjustified/random reaction suggestions and deduplicates overlapping duplicates', () => {
    const raw = [
      { type: 'quick-zoom', startTime: 1.0, endTime: 2.0, reason: 'ok' }, // too short reason -> dropped
      { type: 'quick-zoom', startTime: 2.0, endTime: 3.2, reason: 'Punchline about the cat locking the screen', intensity: 85 },
      { type: 'quick-zoom', startTime: 2.5, endTime: 3.5, reason: 'Duplicate overlapping zoom on same beat' }, // overlaps -> dropped
      { type: 'emoji-overlay', startTime: 2.2, endTime: 3.8, reason: 'Surprised reaction to the cat paw incident', emoji: '😹' },
      { type: 'invalid-effect', startTime: 4.0, endTime: 5.0, reason: 'Should be ignored' },
    ];

    const validated = validateReactionSuggestions(raw, 8);
    assert.equal(validated.length, 2);
    assert.equal(validated[0].type, 'quick-zoom');
    assert.equal(validated[1].type, 'emoji-overlay');
    assert.equal(validated[1].emoji, '😹');
    assert.equal(validated[0].status, 'suggested');
  });

  it('evaluates accepted freeze-frame, slow-motion, zoom, meme-text, and ignores rejected/suggested effects', () => {
    const effects: ReactionEffectItem[] = [
      {
        id: '1',
        type: 'freeze-frame',
        startTime: 2.0,
        endTime: 3.2,
        reason: 'Deadpan reaction',
        status: 'accepted',
        intensity: 80,
        source: 'ai',
      },
      {
        id: '2',
        type: 'meme-text',
        startTime: 2.0,
        endTime: 3.5,
        reason: 'Punchline callout',
        status: 'accepted',
        text: 'BRO REALLY SAID THAT',
        source: 'manual',
      },
      {
        id: '3',
        type: 'dramatic-zoom',
        startTime: 2.0,
        endTime: 4.0,
        reason: 'Should not apply while rejected',
        status: 'rejected',
        intensity: 90,
        source: 'ai',
      },
    ];

    const frame = evaluateReactionEffectsAtTime(effects, 2.6, 8);
    assert.equal(frame.freezeActive, true);
    assert.equal(frame.sourceTimeSec, 2.0);
    assert.equal(frame.playbackRate, 0);
    assert.equal(frame.memeText, 'BRO REALLY SAID THAT');
    assert.equal(frame.extraZoomScale, 1); // rejected dramatic-zoom must NOT apply
  });

  it('computes crop geometry for background-blur, center, smart, and face-centered modes', () => {
    const blurGeo = computeCropGeometry({
      sourceWidth: 1280,
      sourceHeight: 720,
      outputWidth: 406,
      outputHeight: 720,
      cropMode: 'background-blur',
      zoomPercent: 100,
      cropXPercent: 0,
      cropYPercent: 0,
    });
    assert.equal(blurGeo.drawBackgroundBlur, true);
    assert.ok(blurGeo.bgRect);
    assert.equal(Math.round(blurGeo.fgRect.dw), 406);

    const faceGeo = computeCropGeometry({
      sourceWidth: 1280,
      sourceHeight: 720,
      outputWidth: 406,
      outputHeight: 720,
      cropMode: 'face-centered',
      zoomPercent: 100,
      cropXPercent: 0,
      cropYPercent: 0,
      faceAnchorX: 0.78,
      faceAnchorY: 0.35,
    });
    assert.equal(faceGeo.drawBackgroundBlur, false);
    assert.ok(faceGeo.fgRect.dx < -450); // Shifted left to frame right-side speaker
  });

  it('validates server request payload for caption/reaction generation', () => {
    const bad = validateCaptionReactionRequestBody({ clipDurationSeconds: 0 });
    assert.equal(bad.valid, false);

    const ok = validateCaptionReactionRequestBody({
      clipTitle: 'Funny clip',
      clipDurationSeconds: 12.5,
      languageMode: 'hinglish',
      includeReactions: true,
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      audioMimeType: 'audio/wav',
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.data?.languageMode, 'hinglish');
  });
});
