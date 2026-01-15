import assert from 'node:assert/strict';

import { exportProjectToSmf } from '../../src/core/midi/MidiExporter';
import { importMidiFileToProject } from '../../src/core/midi/MidiParser';
import { bpmToMpqn, secondsToTicks, ticksToSeconds } from '../../src/utils/midiTickUtils';
import type { Project } from '../../src/types/project';

type TestFn = () => void;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: TestFn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failCount++;
    console.error(`FAIL ${name}`);
    console.error(`  ${(err as Error).message}`);
  }
}

function approxEqual(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function absTicksFromDelta(events: Array<{ deltaTime: number }>): number[] {
  let tick = 0;
  return events.map((e) => {
    tick += e.deltaTime;
    return tick;
  });
}

function vlq(n: number): number[] {
  const bytes: number[] = [];
  let value = n >>> 0;
  bytes.push(value & 0x7f);
  value >>>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return bytes;
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u16be(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

function makeSmfBinary(opts: { format: 0 | 1; tracks: number; timeDivision: number; trackData: Uint8Array[] }): Uint8Array {
  const { format, tracks, timeDivision, trackData } = opts;
  assert.equal(trackData.length, tracks, 'trackData length must match tracks');

  const chunks: number[] = [];

  // MThd
  chunks.push(0x4d, 0x54, 0x68, 0x64);
  chunks.push(...u32be(6));
  chunks.push(...u16be(format));
  chunks.push(...u16be(tracks));
  chunks.push(...u16be(timeDivision));

  // MTrk
  for (const td of trackData) {
    chunks.push(0x4d, 0x54, 0x72, 0x6b);
    chunks.push(...u32be(td.length));
    chunks.push(...Array.from(td));
  }

  return new Uint8Array(chunks);
}

console.log('PPQN unit tests\n');
console.log('='.repeat(60));

test('ticksToSeconds uses ppqn (ppqn=960)', () => {
  const tempoMap = [{ tick: 0, mpqn: bpmToMpqn(120) }];
  const timeSignature: [number, number] = [4, 4];
  const ppqn = 960;

  const { startTime, duration } = ticksToSeconds(960, 960, undefined, timeSignature, ppqn, tempoMap);
  approxEqual(startTime, 0.5, 1e-9);
  approxEqual(duration, 0.5, 1e-9);
});

test('secondsToTicks uses ppqn (ppqn=960)', () => {
  const tempoMap = [{ tick: 0, mpqn: bpmToMpqn(120) }];
  const timeSignature: [number, number] = [4, 4];
  const ppqn = 960;

  const { startTick, durationTicks } = secondsToTicks(0.5, 0.5, undefined, timeSignature, ppqn, tempoMap);
  assert.equal(startTick, 960);
  assert.equal(durationTicks, 960);
});

test('importMidiFileToProject preserves timeDivision as timing.ppqn', () => {
  const ppqn = 960;
  const track: number[] = [];

  track.push(...vlq(0), 0x90, 0x3c, 0x64);
  track.push(...vlq(960), 0x80, 0x3c, 0x40);
  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  const smf = makeSmfBinary({
    format: 0,
    tracks: 1,
    timeDivision: ppqn,
    trackData: [new Uint8Array(track)],
  });

  const project = importMidiFileToProject(smf);
  assert.equal(project.timing?.ppqn, 960);
  assert.equal(project.midiParts[0].notes[0].durationTicks, 960);
});

test('exportProjectToSmf writes ppqn to header and preserves ticks', () => {
  const project: Project = {
    version: 2,
    timing: {
      ppqn: 960,
      tempoMap: [{ tick: 0, mpqn: bpmToMpqn(120) }],
      timeSigMap: [{ tick: 0, num: 4, den: 4 }],
    },
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      {
        id: 'track-1',
        name: 'Track 1',
        instrument: 'piano',
        volume: 1.0,
        pan: 0.0,
        effects: [],
        solo: false,
        mute: false,
        mutedBySolo: false,
      },
    ],
    midiParts: [
      {
        id: 'part-1',
        trackId: 'track-1',
        startTick: 0,
        durationTicks: 960,
        notes: [{ note: 60, velocity: 100, channel: 0, startTick: 0, durationTicks: 960 }],
      },
    ],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };

  const smf = exportProjectToSmf(project);
  assert.equal(smf.header.timeDivision, 960);

  const track = smf.tracks[1];
  const absTicks = absTicksFromDelta(track.events);
  const noteOnIndex = track.events.findIndex((event) => event.type === 'NoteOn');
  const noteOffIndex = track.events.findIndex((event) => event.type === 'NoteOff');

  assert.ok(noteOnIndex >= 0, 'Expected NoteOn event');
  assert.ok(noteOffIndex >= 0, 'Expected NoteOff event');
  assert.equal(absTicks[noteOnIndex], 0);
  assert.equal(absTicks[noteOffIndex], 960);
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);
if (failCount > 0) process.exit(1);
