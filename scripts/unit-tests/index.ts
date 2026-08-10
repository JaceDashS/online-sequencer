import assert from 'node:assert/strict';

import { exportProjectToSmf } from '../../src/core/midi/MidiExporter';
import { importMidiFileToProject } from '../../src/core/midi/MidiParser';
import { bpmToMpqn, measureToTicks, ticksToMeasure, ticksToSeconds } from '../../src/utils/midiTickUtils';
import { canOpenPartEditor, createPartDragResetState, getPartClickSelectionMode } from '../../src/components/EventDisplay/EventDisplayLogic';
import { calculateMarqueeSelectedPartIds, calculatePartDropPosition, calculateSelectionRectangle } from '../../src/components/EventDisplay/EventDisplayCalculations';
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

test('getPartClickSelectionMode ignores clicks after dragging', () => {
  assert.equal(getPartClickSelectionMode({
    hasDraggedPart: true,
    isDraggingPart: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  }), 'ignore');
  assert.equal(getPartClickSelectionMode({
    hasDraggedPart: false,
    isDraggingPart: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  }), 'ignore');
});

test('getPartClickSelectionMode toggles selection with modifier keys', () => {
  const baseParams = {
    hasDraggedPart: false,
    isDraggingPart: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  assert.equal(getPartClickSelectionMode({ ...baseParams, ctrlKey: true }), 'toggle');
  assert.equal(getPartClickSelectionMode({ ...baseParams, metaKey: true }), 'toggle');
  assert.equal(getPartClickSelectionMode({ ...baseParams, shiftKey: true }), 'toggle');
  assert.equal(getPartClickSelectionMode(baseParams), 'replace');
});

test('canOpenPartEditor rejects active cursor and drag states', () => {
  assert.equal(canOpenPartEditor({
    hasActiveCursorMode: false,
    hasDraggedPart: false,
    isDraggingPart: false,
  }), true);
  assert.equal(canOpenPartEditor({
    hasActiveCursorMode: true,
    hasDraggedPart: false,
    isDraggingPart: false,
  }), false);
  assert.equal(canOpenPartEditor({
    hasActiveCursorMode: false,
    hasDraggedPart: true,
    isDraggingPart: false,
  }), false);
  assert.equal(canOpenPartEditor({
    hasActiveCursorMode: false,
    hasDraggedPart: false,
    isDraggingPart: true,
  }), false);
});

test('createPartDragResetState returns complete fresh defaults', () => {
  const firstResetState = createPartDragResetState();
  const secondResetState = createPartDragResetState();

  assert.deepEqual(firstResetState, {
    draggedPartId: null,
    draggedPartsInfo: [],
    partDragStart: null,
    partDragOffset: { x: 0, y: 0 },
    hasDraggedPart: false,
    isTrackMovingMode: false,
    isCtrlPressedDuringDrag: false,
  });
  assert.notEqual(firstResetState.draggedPartsInfo, secondResetState.draggedPartsInfo);
  assert.notEqual(firstResetState.partDragOffset, secondResetState.partDragOffset);
});

test('calculateSelectionRectangle normalizes every drag direction', () => {
  const expectedRectangle = { left: 10, right: 30, top: 20, bottom: 50 };
  const dragPoints = [
    [{ x: 10, y: 20 }, { x: 30, y: 50 }],
    [{ x: 30, y: 20 }, { x: 10, y: 50 }],
    [{ x: 10, y: 50 }, { x: 30, y: 20 }],
    [{ x: 30, y: 50 }, { x: 10, y: 20 }],
  ] as const;

  dragPoints.forEach(([start, end]) => {
    assert.deepEqual(calculateSelectionRectangle(start, end), expectedRectangle);
  });
});

test('calculateMarqueeSelectedPartIds finds parts intersecting selected tracks and time', () => {
  const selectedPartIds = calculateMarqueeSelectedPartIds({
    selectionRectangle: { left: 75, right: 125, top: 20, bottom: 90 },
    tracks: [{ id: 'track-1' }, { id: 'track-2' }, { id: 'track-3' }],
    midiParts: [
      { id: 'part-1', trackId: 'track-1', startTick: 480, durationTicks: 480, notes: [] },
      { id: 'part-2', trackId: 'track-1', startTick: 1440, durationTicks: 480, notes: [] },
      { id: 'part-3', trackId: 'track-2', startTick: 960, durationTicks: 480, notes: [] },
      { id: 'part-4', trackId: 'track-3', startTick: 960, durationTicks: 480, notes: [] },
    ],
    trackHeights: new Map([
      ['track-1', 70],
      ['track-2', 70],
      ['track-3', 70],
    ]),
    tempoMap: [{ tick: 0, mpqn: bpmToMpqn(120) }],
    timeSignature: [4, 4],
    ppqn: 480,
    pixelsPerSecond: 100,
  });

  assert.deepEqual(Array.from(selectedPartIds), ['part-1', 'part-3']);
});

test('calculateMarqueeSelectedPartIds includes touching part and track boundaries', () => {
  const selectedPartIds = calculateMarqueeSelectedPartIds({
    selectionRectangle: { left: 100, right: 100, top: 70, bottom: 70 },
    tracks: [{ id: 'track-1' }, { id: 'track-2' }],
    midiParts: [
      { id: 'part-1', trackId: 'track-1', startTick: 480, durationTicks: 480, notes: [] },
      { id: 'part-2', trackId: 'track-2', startTick: 960, durationTicks: 480, notes: [] },
    ],
    trackHeights: new Map([
      ['track-1', 70],
      ['track-2', 70],
    ]),
    tempoMap: [{ tick: 0, mpqn: bpmToMpqn(120) }],
    timeSignature: [4, 4],
    ppqn: 480,
    pixelsPerSecond: 100,
  });

  assert.deepEqual(Array.from(selectedPartIds), ['part-1', 'part-2']);
});

const baseDropPositionParams = {
  partDragStart: { x: 0, y: 20, partStartTick: 480, partTrackId: 'track-1', clickOffsetX: 0 },
  partDragOffset: { x: 50, y: 0 },
  draggedPartsInfo: [
    { partId: 'part-1', originalStartTick: 480, originalTrackId: 'track-1' },
    { partId: 'part-2', originalStartTick: 960, originalTrackId: 'track-2' },
  ],
  pixelsPerSecond: 100,
  tracks: [{ id: 'track-1' }, { id: 'track-2' }, { id: 'track-3' }],
  trackHeights: new Map([
    ['track-1', 70],
    ['track-2', 70],
    ['track-3', 70],
  ]),
  isTrackMovingMode: false,
  isQuantizeEnabled: false,
  bpm: 120,
  timeSignature: [4, 4] as [number, number],
  ppqn: 480,
};

test('calculatePartDropPosition applies horizontal tick offsets to every dragged part', () => {
  assert.deepEqual(calculatePartDropPosition(baseDropPositionParams), {
    baseTickDelta: 480,
    trackIndexDelta: 0,
    baseNewTrackId: 'track-1',
    partDropPositions: [
      { partId: 'part-1', newStartTick: 960, newTrackId: 'track-1' },
      { partId: 'part-2', newStartTick: 1440, newTrackId: 'track-2' },
    ],
  });
});

test('calculatePartDropPosition clamps the base part at tick zero', () => {
  const result = calculatePartDropPosition({
    ...baseDropPositionParams,
    partDragOffset: { x: -100, y: 0 },
  });

  assert.equal(result.baseTickDelta, -480);
  assert.deepEqual(result.partDropPositions.map((position) => position.newStartTick), [0, 480]);
});

test('calculatePartDropPosition quantizes the base part to the nearest beat', () => {
  const result = calculatePartDropPosition({
    ...baseDropPositionParams,
    partDragOffset: { x: 30, y: 0 },
    isQuantizeEnabled: true,
  });

  assert.equal(result.baseTickDelta, 480);
  assert.equal(result.partDropPositions[0].newStartTick, 960);
});

test('calculatePartDropPosition preserves relative tracks within timeline boundaries', () => {
  const movedDown = calculatePartDropPosition({
    ...baseDropPositionParams,
    partDragOffset: { x: 0, y: 100 },
    isTrackMovingMode: true,
  });
  const movedAboveTimeline = calculatePartDropPosition({
    ...baseDropPositionParams,
    partDragOffset: { x: 0, y: -100 },
    isTrackMovingMode: true,
  });
  const movedBelowTimeline = calculatePartDropPosition({
    ...baseDropPositionParams,
    partDragOffset: { x: 0, y: 300 },
    isTrackMovingMode: true,
  });

  assert.equal(movedDown.baseNewTrackId, 'track-2');
  assert.deepEqual(movedDown.partDropPositions.map((position) => position.newTrackId), ['track-2', 'track-3']);
  assert.equal(movedAboveTimeline.baseNewTrackId, 'track-1');
  assert.equal(movedBelowTimeline.baseNewTrackId, 'track-3');
  assert.deepEqual(movedBelowTimeline.partDropPositions.map((position) => position.newTrackId), ['track-3', 'track-2']);
});

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
