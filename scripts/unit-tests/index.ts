import assert from 'node:assert/strict';

import { exportProjectToSmf } from '../../src/core/midi/MidiExporter';
import { importMidiFileToProject } from '../../src/core/midi/MidiParser';
import { bpmToMpqn, measureToTicks, ticksToMeasure, ticksToSeconds } from '../../src/utils/midiTickUtils';
import type { Project } from '../../src/types/project';

type TestFn = () => void | Promise<void>;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: TestFn) {
  testCount++;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      throw new Error('Async tests are not supported in this runner.');
    }
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
  }
}

function approxEqual(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ±${tolerance} of ${expected}`
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
  // Variable-length quantity encoding (7-bit groups, MSB=continuation)
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

function makeSmfBinary(opts: { format: 0 | 1 | 2; tracks: number; timeDivision: number; trackData: Uint8Array[] }): Uint8Array {
  const { format, tracks, timeDivision, trackData } = opts;
  assert.equal(trackData.length, tracks, 'trackData length must match tracks');

  const chunks: number[] = [];

  // MThd
  chunks.push(0x4d, 0x54, 0x68, 0x64);
  chunks.push(...u32be(6));
  chunks.push(...u16be(format));
  chunks.push(...u16be(tracks));
  chunks.push(...u16be(timeDivision));

  // MTrk*
  for (const td of trackData) {
    chunks.push(0x4d, 0x54, 0x72, 0x6b);
    chunks.push(...u32be(td.length));
    chunks.push(...Array.from(td));
  }

  return new Uint8Array(chunks);
}

console.log('Unit tests (runtime-importing src/*)\n');
console.log('='.repeat(60));

test('ticksToSeconds (tempoMap): startTick and duration are both correct (constant tempo)', () => {
  const tempoMap = [{ tick: 0, mpqn: bpmToMpqn(120) }];
  const timeSignature: [number, number] = [4, 4];
  const ppqn = 480;

  // 120 BPM => 1 quarter note = 0.5s; 480 ticks = 1 quarter note.
  const { startTime, duration } = ticksToSeconds(960, 480, undefined, timeSignature, ppqn, tempoMap);
  approxEqual(startTime, 1.0, 1e-9);
  approxEqual(duration, 0.5, 1e-9);
});

test('ticksToSeconds (tempoMap): tempo change is applied (startTime=0 case)', () => {
  const tempoMap = [
    { tick: 0, mpqn: bpmToMpqn(120) }, // 0.5s per quarter
    { tick: 480, mpqn: bpmToMpqn(60) }, // 1.0s per quarter
  ];
  const timeSignature: [number, number] = [4, 4];
  const ppqn = 480;

  // From tick 0..480: 0.5s, and 480..960: 1.0s => total 1.5s
  const { startTime, duration } = ticksToSeconds(0, 960, undefined, timeSignature, ppqn, tempoMap);
  approxEqual(startTime, 0.0, 1e-9);
  approxEqual(duration, 1.5, 1e-9);
});

test('ticksToSeconds (tempoMap): tempo change is applied (non-zero startTick)', () => {
  const tempoMap = [
    { tick: 0, mpqn: bpmToMpqn(120) }, // 0.5s per quarter
    { tick: 480, mpqn: bpmToMpqn(60) }, // 1.0s per quarter
  ];
  const timeSignature: [number, number] = [4, 4];
  const ppqn = 480;

  // startTick=480 => 0.5s, durationTicks=480 at 60 BPM => 1.0s
  const { startTime, duration } = ticksToSeconds(480, 480, undefined, timeSignature, ppqn, tempoMap);
  approxEqual(startTime, 0.5, 1e-9);
  approxEqual(duration, 1.0, 1e-9);
});

test('exportProjectToSmf: same-tick NoteOff comes before NoteOn (same pitch retrigger)', () => {
  const project: Project = {
    version: 2,
    timing: {
      ppqn: 480,
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
        notes: [
          { note: 60, velocity: 100, channel: 0, startTick: 0, durationTicks: 480 },
          { note: 60, velocity: 100, channel: 0, startTick: 480, durationTicks: 480 },
        ],
      },
    ],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };

  const smf = exportProjectToSmf(project);
  assert.equal(smf.header.format, 1);
  assert.equal(smf.tracks.length, 2, 'Expected conductor + 1 music track');

  const track = smf.tracks[1];
  const absTicks = absTicksFromDelta(track.events);

  // TrackName + first NoteOn are both at tick 0. TrackName should come first.
  assert.equal(track.events[0].type, 'Meta');
  assert.equal(track.events[0].metaType, 'TrackName');
  assert.equal(absTicks[0], 0);
  assert.equal(track.events[1].type, 'NoteOn');
  assert.equal(absTicks[1], 0);

  // At tick 480 we should have NoteOff then NoteOn (retrigger same pitch).
  const at480 = track.events
    .map((e, i) => ({ e, t: absTicks[i] }))
    .filter(({ t }) => t === 480)
    .map(({ e }) => e.type);

  assert.deepEqual(at480, ['NoteOff', 'NoteOn']);
});

test('MidiParser: unsupported channel events + SysEx + running status do not desync SMF parsing', () => {
  // Build a single-track SMF that includes notes plus unsupported events.
  // The test ensures the parser skips unsupported events WITHOUT breaking note parsing.
  const ppqn = 480;

  const track: number[] = [];

  // Delta 0: NoteOn ch0 (status), note 60, vel 100
  track.push(...vlq(0), 0x90, 0x3c, 0x64);
  // Delta 0: Running-status NoteOn (no status), note 64, vel 100
  track.push(...vlq(0), 0x40, 0x64);

  // Delta 0: CC ch0 (Volume=64)
  track.push(...vlq(0), 0xb0, 0x07, 0x40);
  // Delta 0: Running-status CC (Pan=32) - unsupported but must be skipped safely
  track.push(...vlq(0), 0x0a, 0x20);

  // Delta 480: NoteOff ch0 (status), note 60, vel 64
  track.push(...vlq(480), 0x80, 0x3c, 0x40);
  // Delta 0: Running-status NoteOff (no status), note 64, vel 64
  track.push(...vlq(0), 0x40, 0x40);

  // Delta 0: ProgramChange ch0 -> program 5 (unsupported but must be skipped)
  track.push(...vlq(0), 0xc0, 0x05);
  // Delta 0: Running-status ProgramChange (program 7) - unsupported but must be skipped safely
  track.push(...vlq(0), 0x07);

  // Delta 0: PitchBend ch0 (LSB=0, MSB=64) centered (unsupported but must be skipped)
  track.push(...vlq(0), 0xe0, 0x00, 0x40);

  // Delta 0: SysEx F0, length 3, payload 01 02 03
  track.push(...vlq(0), 0xf0, ...vlq(3), 0x01, 0x02, 0x03);

  // Delta 0: End of Track meta
  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  const smfBin = makeSmfBinary({
    format: 0,
    tracks: 1,
    timeDivision: ppqn,
    trackData: [new Uint8Array(track)],
  });

  const project = importMidiFileToProject(smfBin);
  assert.ok(project.midiParts.length >= 1, 'Expected at least one imported MidiPart');
  assert.ok(project.midiParts[0].notes.length === 2, 'Expected exactly two notes to survive import');

  // Ensure both notes are present with correct tick ranges.
  const notes = [...project.midiParts[0].notes].sort((a, b) => a.note - b.note);
  assert.equal(notes[0].note, 60);
  assert.equal(notes[0].channel ?? 0, 0);
  assert.equal(notes[0].startTick, 0);
  assert.equal(notes[0].durationTicks, 480);

  assert.equal(notes[1].note, 64);
  assert.equal(notes[1].channel ?? 0, 0);
  assert.equal(notes[1].startTick, 0);
  assert.equal(notes[1].durationTicks, 480);
});

test('MidiParser: skipped event delta-time is preserved for supported notes', () => {
  const ppqn = 480;
  const track: number[] = [];

  // Delta 0: NoteOn ch0 (status), note 60, vel 100
  track.push(...vlq(0), 0x90, 0x3c, 0x64);
  // Delta 240: CC ch0 (unsupported, should not collapse timing)
  track.push(...vlq(240), 0xb0, 0x07, 0x40);
  // Delta 0: NoteOff ch0 (status), note 60, vel 64
  track.push(...vlq(0), 0x80, 0x3c, 0x40);
  // Delta 0: End of Track meta
  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  const smfBin = makeSmfBinary({
    format: 0,
    tracks: 1,
    timeDivision: ppqn,
    trackData: [new Uint8Array(track)],
  });

  const project = importMidiFileToProject(smfBin);
  assert.ok(project.midiParts.length >= 1, 'Expected at least one imported MidiPart');
  assert.ok(project.midiParts[0].notes.length === 1, 'Expected exactly one note to survive import');

  const note = project.midiParts[0].notes[0];
  assert.equal(note.startTick, 0);
  assert.equal(note.durationTicks, 240);
});

test('MidiParser: format 2 is rejected', () => {
  const ppqn = 480;
  const track: number[] = [];

  track.push(...vlq(0), 0xff, 0x2f, 0x00);

  const smfBin = makeSmfBinary({
    format: 2,
    tracks: 1,
    timeDivision: ppqn,
    trackData: [new Uint8Array(track)],
  });

  assert.throws(
    () => importMidiFileToProject(smfBin),
    /format 2|Unsupported SMF format/i
  );
});

test('MidiParser: EndOfTrack padding does not desync track parsing', () => {
  const ppqn = 480;
  const track1: number[] = [];
  const track2: number[] = [];

  track1.push(...vlq(0), 0x90, 0x3c, 0x40);
  track1.push(...vlq(480), 0x80, 0x3c, 0x40);
  track1.push(...vlq(0), 0xff, 0x2f, 0x00);
  track1.push(0x00, 0x00);

  track2.push(...vlq(0), 0x90, 0x40, 0x40);
  track2.push(...vlq(480), 0x80, 0x40, 0x40);
  track2.push(...vlq(0), 0xff, 0x2f, 0x00);

  const smfBin = makeSmfBinary({
    format: 1,
    tracks: 2,
    timeDivision: ppqn,
    trackData: [new Uint8Array(track1), new Uint8Array(track2)],
  });

  const project = importMidiFileToProject(smfBin);
  assert.equal(project.tracks.length, 2);
  assert.equal(project.midiParts.length, 2);

  const notes = project.midiParts.flatMap((part) => part.notes).sort((a, b) => a.note - b.note);
  assert.equal(notes[0].note, 60);
  assert.equal(notes[1].note, 64);
});

test('exportProjectToSmf: time signature denominator is normalized', () => {
  const project: Project = {
    version: 2,
    timing: {
      ppqn: 480,
      tempoMap: [{ tick: 0, mpqn: bpmToMpqn(120) }],
      timeSigMap: [{ tick: 0, num: 4, den: 3 }],
    },
    bpm: 120,
    timeSignature: [4, 3],
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
    midiParts: [],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };

  const smf = exportProjectToSmf(project);
  const timeSigEvent = smf.tracks[0].events.find(
    (event) => event.type === 'Meta' && event.metaType === 'TimeSignature'
  );
  assert.ok(timeSigEvent && timeSigEvent.metaData, 'Expected TimeSignature meta event');
  assert.equal(timeSigEvent.metaData[1], 2);
});

test('exportProjectToSmf: note data is clamped to MIDI ranges', () => {
  const project: Project = {
    version: 2,
    timing: {
      ppqn: 480,
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
        durationTicks: 480,
        notes: [
          {
            note: 200,
            velocity: -10,
            channel: 40,
            releaseVelocity: 300,
            startTick: 0,
            durationTicks: 480,
          },
        ],
      },
    ],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };

  const smf = exportProjectToSmf(project);
  const track = smf.tracks[1];
  const noteOn = track.events.find((event) => event.type === 'NoteOn');
  const noteOff = track.events.find((event) => event.type === 'NoteOff');

  assert.ok(noteOn && noteOff, 'Expected NoteOn and NoteOff events');
  assert.equal(noteOn.channel, 15);
  assert.equal(noteOn.note, 127);
  assert.equal(noteOn.velocity, 0);
  assert.equal(noteOff.velocity, 127);
});

test('measureToTicks respects beat unit (6/8)', () => {
  const ppqn = 480;
  const { startTick, durationTicks } = measureToTicks(1, 1, [6, 8], ppqn);
  assert.equal(startTick, 1440);
  assert.equal(durationTicks, 1440);
});

test('ticksToMeasure respects beat unit (6/8)', () => {
  const ppqn = 480;
  const { measureStart, measureDuration } = ticksToMeasure(1440, 1440, [6, 8], ppqn);
  approxEqual(measureStart, 1, 1e-9);
  approxEqual(measureDuration, 1, 1e-9);
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);
if (failCount > 0) process.exit(1);

