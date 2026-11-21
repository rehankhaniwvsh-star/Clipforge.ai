import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiContentModePrompt,
  buildClipSelectionPrompt,
  hasSufficientSpeechTranscript,
  isMeaningfulSpeech,
  mapAiCategoryToClipCategory,
  validateAiClipSuggestions,
  validateAnalyzeAudioRequestBody,
} from './aiAnalysisValidation';

test('validateAnalyzeAudioRequestBody accepts valid audio chunk requests and rejects invalid bounds', () => {
  const validPayload = {
    fileName: 'interview.mp4',
    videoDurationSeconds: 95.4,
    contentMode: 'Podcast',
    targetDurationSeconds: 30,
    clipCount: 3,
    chunks: [
      {
        index: 0,
        startSec: 0,
        endSec: 30,
        durationSec: 30,
        mimeType: 'audio/wav',
        base64Data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      },
    ],
  };

  const ok = validateAnalyzeAudioRequestBody(validPayload);
  assert.equal(ok.valid, true);
  assert.equal(ok.data?.chunks.length, 1);

  const badMime = validateAnalyzeAudioRequestBody({
    ...validPayload,
    chunks: [{ ...validPayload.chunks[0], mimeType: 'application/octet-stream' }],
  });
  assert.equal(badMime.valid, false);
  assert.ok(badMime.error?.includes('unsupported audio MIME'));

  const badDuration = validateAnalyzeAudioRequestBody({
    ...validPayload,
    targetDurationSeconds: 99,
  });
  assert.equal(badDuration.valid, false);

  const emptyChunks = validateAnalyzeAudioRequestBody({
    ...validPayload,
    chunks: [],
  });
  assert.equal(emptyChunks.valid, false);
});

test('isMeaningfulSpeech and hasSufficientSpeechTranscript distinguish real dialogue from silence/noise', () => {
  assert.equal(isMeaningfulSpeech('[silence]'), false);
  assert.equal(isMeaningfulSpeech('[music] (beep)'), false);
  assert.equal(isMeaningfulSpeech('Hello'), false);
  assert.equal(isMeaningfulSpeech('Here is the exact mistake almost every creator makes.'), true);

  const silent = hasSufficientSpeechTranscript([
    { index: 0, startSec: 0, endSec: 10, text: '[tone]', hasSpeech: false },
  ]);
  assert.equal(silent.sufficient, false);
  assert.ok(silent.reason?.includes('Insufficient intelligible speech'));

  const spoken = hasSufficientSpeechTranscript([
    {
      index: 0,
      startSec: 0,
      endSec: 15,
      text: 'Wait until you hear what happened right before we went live on stage.',
      hasSpeech: true,
    },
  ]);
  assert.equal(spoken.sufficient, true);
  assert.ok(spoken.totalWords >= 10);
});

test('validateAiClipSuggestions rejects out-of-range timestamps and deduplicates overlapping clips', () => {
  const result = validateAiClipSuggestions(
    [
      {
        title: 'Best Joke Setup & Punchline',
        category: 'funny',
        startTime: 10.2,
        endTime: 38.7,
        duration: 28.5,
        hook: 'Starts with an unexpected confession',
        reason: 'Complete comedic setup and clean punchline payoff.',
        score: 94,
        caption: 'You will not believe what happened next.',
      },
      {
        // Duplicate heavily overlapping the first clip (lower score -> should be dropped)
        title: 'Duplicate Overlap',
        category: 'funny',
        startTime: 12.0,
        endTime: 39.0,
        duration: 27.0,
        hook: 'Overlap',
        reason: 'Duplicate overlap',
        score: 80,
        caption: 'Overlap caption',
      },
      {
        // Out of range (> 60s video duration -> should be dropped)
        title: 'Hallucinated Future Timestamp',
        category: 'educational',
        startTime: 70,
        endTime: 95,
        duration: 25,
        hook: 'Bad',
        reason: 'Beyond video length',
        score: 99,
        caption: 'Bad caption',
      },
      {
        title: 'Clear Product Framework Breakdown',
        category: 'educational',
        startTime: 41.0,
        endTime: 58.5,
        duration: 17.5,
        hook: 'Three rules for retention',
        reason: 'Actionable explanation with a clean ending.',
        score: 88,
        caption: 'Three rules that doubled our watch time.',
      },
    ],
    {
      videoDurationSeconds: 60,
      targetDurationSeconds: 30,
      maxClips: 5,
    }
  );

  assert.equal(result.clips.length, 2);
  assert.equal(result.droppedCount, 2);
  assert.equal(result.clips[0].title, 'Best Joke Setup & Punchline');
  assert.equal(result.clips[0].duration, 28.5);
  assert.equal(result.clips[1].title, 'Clear Product Framework Breakdown');
  assert.equal(mapAiCategoryToClipCategory(result.clips[0].category), 'Funny Moments');
  assert.equal(mapAiCategoryToClipCategory(result.clips[1].category), 'Educational');
});

test('buildAiContentModePrompt and buildClipSelectionPrompt encode mode rules and actual bounds', () => {
  assert.ok(buildAiContentModePrompt('Funny Moments').includes('punchlines'));
  assert.ok(buildAiContentModePrompt('Educational').includes('explanations'));
  assert.ok(buildAiContentModePrompt('Podcast').includes('strong opinions'));
  assert.ok(buildAiContentModePrompt('Automatic Selection').includes('balanced mix'));

  const prompt = buildClipSelectionPrompt({
    fileName: 'podcast.mp4',
    videoDurationSeconds: 45,
    analyzedDurationSeconds: 45,
    contentMode: 'Podcast',
    targetDurationSeconds: 30,
    clipCount: 3,
    transcriptChunks: [
      { index: 0, startSec: 0, endSec: 30, text: 'Let us talk about why most launches fail.', hasSpeech: true },
    ],
  });
  assert.ok(prompt.includes('45.00'));
  assert.ok(prompt.includes('MODE = PODCAST'));
  assert.ok(prompt.includes('insufficient_data'));
});
