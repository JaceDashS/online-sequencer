import assert from 'node:assert/strict';

import {
  createPlaybackAnchor,
  getAnchorStartDelaySeconds,
  getAudioTimeForTimelineTime,
  getBoundedPitchOffsetSeconds,
  getTimelineTimeAtAudioTime,
  resolveScheduledPlaybackWindow,
} from '../../src/core/audio/playbackTimeline';

type TestFn = () => void;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: TestFn): void {
  testCount += 1;
  try {
    fn();
    passCount += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failCount += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${(error as Error).message}`);
  }
}

function approxEqual(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

console.log('Playback timeline unit tests\n');
console.log('='.repeat(60));

test('anchor keeps the timeline still until the audio lead time elapses', () => {
  const anchor = createPlaybackAnchor(12, 50, 0.075);

  approxEqual(getTimelineTimeAtAudioTime(anchor, 50.05), 12);
  approxEqual(getAnchorStartDelaySeconds(anchor, 50.05), 0.025);
});

test('anchor maps timeline events to stable audio times after scheduler delays', () => {
  const anchor = createPlaybackAnchor(12, 50, 0.075);
  const eventAudioTime = getAudioTimeForTimelineTime(anchor, 13);

  approxEqual(eventAudioTime, 51.075);
  approxEqual(getTimelineTimeAtAudioTime(anchor, 50.375), 12.3);
  approxEqual(getAudioTimeForTimelineTime(anchor, 13), eventAudioTime);
});

test('anchor does not accumulate a long scheduler stall into later event times', () => {
  const anchor = createPlaybackAnchor(0, 20, 0.05);
  const nextBeatAudioTime = getAudioTimeForTimelineTime(anchor, 2);

  approxEqual(getTimelineTimeAtAudioTime(anchor, 20.75), 0.7);
  approxEqual(nextBeatAudioTime, 22.05);
});

test('late active notes resume from the matching sample offset', () => {
  const window = resolveScheduledPlaybackWindow(1, 2, 1.7);

  assert.ok(window);
  approxEqual(window.timelineStart, 1.7);
  approxEqual(window.duration, 1.3);
  approxEqual(window.skipTime, 0.7);
});

test('expired notes are skipped instead of shifting later events', () => {
  assert.equal(resolveScheduledPlaybackWindow(1, 0.25, 1.25), null);
  assert.equal(resolveScheduledPlaybackWindow(1, 0.25, 2), null);
});

test('pitch offsets stay disabled at zero and never exceed the configured maximum', () => {
  approxEqual(getBoundedPitchOffsetSeconds(4, 0), 0);
  approxEqual(getBoundedPitchOffsetSeconds(0, 3), 0);
  approxEqual(getBoundedPitchOffsetSeconds(1, 3), 0.003);
  approxEqual(getBoundedPitchOffsetSeconds(12, 3), 0.003);
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);
if (failCount > 0) process.exit(1);
