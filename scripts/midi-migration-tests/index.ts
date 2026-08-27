import assert from 'node:assert/strict';
import type { LegacyProject, MidiPart, Project, Track } from '../../src/types/project';
import {
  migrateNoteToTicks,
  migrateProjectToTicks,
  needsMigration,
} from '../../src/utils/midiTickUtils';

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function asProject(project: LegacyProject): Project {
  return project as unknown as Project;
}

function createPart(notes: MidiPart['notes']): MidiPart {
  return {
    id: 'part-1',
    trackId: 'track-1',
    startTick: 0,
    durationTicks: 7680,
    notes,
  };
}

function createTrack(): Track {
  return {
    id: 'track-1',
    name: 'Track 1',
    instrument: 'piano',
    volume: 1,
    pan: 0,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  };
}

test('버전이 없거나 1인 프로젝트만 마이그레이션 대상으로 판정한다', () => {
  const base = { tracks: [], midiParts: [] } as Project;

  assert.equal(needsMigration(base), true);
  assert.equal(needsMigration({ ...base, version: 1 }), true);
  assert.equal(needsMigration({ ...base, version: 2 }), false);
});

test('레거시 노트를 Tick 기반 노트로 변환하고 레거시 필드를 제거한다', () => {
  const part = createPart([]);
  const migrated = migrateNoteToTicks(
    {
      note: 60,
      velocity: 100,
      channel: 2,
      releaseVelocity: 32,
      measureStart: 0.5,
      measureDuration: 1,
    },
    part,
    [4, 4],
  );

  assert.deepEqual(migrated, {
    note: 60,
    velocity: 100,
    channel: 2,
    releaseVelocity: 32,
    startTick: 960,
    durationTicks: 1920,
  });
  assert.equal('measureStart' in migrated, false);
  assert.equal('measureDuration' in migrated, false);
});

test('이미 Tick 기반인 노트는 Tick 값과 MIDI 메타데이터를 보존한다', () => {
  const migrated = migrateNoteToTicks(
    {
      note: 64,
      velocity: 90,
      channel: 5,
      releaseVelocity: 17,
      startTick: 999,
      durationTicks: 888,
    },
    createPart([]),
    [4, 4],
  );

  assert.deepEqual(migrated, {
    note: 64,
    velocity: 90,
    channel: 5,
    releaseVelocity: 17,
    startTick: 999,
    durationTicks: 888,
  });
});

test('빈 레거시 프로젝트를 버전 2로 마이그레이션한다', () => {
  const migrated = migrateProjectToTicks(asProject({
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [],
  }));

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.midiParts, []);
  assert.equal('bpm' in migrated, false);
  assert.equal('timeSignature' in migrated, false);
});

test('한 프로젝트의 여러 레거시 노트를 변환한다', () => {
  const project: LegacyProject = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [createTrack()],
    midiParts: [{
      id: 'part-1',
      trackId: 'track-1',
      startTick: 0,
      durationTicks: 7680,
      notes: [
        { note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1 },
        { note: 64, velocity: 80, measureStart: 2, measureDuration: 0.5 },
      ],
    }],
  };
  const migrated = migrateProjectToTicks(asProject(project));

  assert.deepEqual(migrated.midiParts[0].notes.map((note) => ({
    startTick: note.startTick,
    durationTicks: note.durationTicks,
  })), [
    { startTick: 960, durationTicks: 1920 },
    { startTick: 3840, durationTicks: 960 },
  ]);
});

test('서로 다른 파트의 레거시 노트를 모두 변환한다', () => {
  const project: LegacyProject = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [
      {
        id: 'part-1',
        trackId: 'track-1',
        startTick: 0,
        durationTicks: 3840,
        notes: [{ note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1 }],
      },
      {
        id: 'part-2',
        trackId: 'track-2',
        startTick: 3840,
        durationTicks: 3840,
        notes: [{ note: 64, velocity: 80, measureStart: 0.25, measureDuration: 0.5 }],
      },
    ],
  };
  const migrated = migrateProjectToTicks(asProject(project));

  assert.equal(migrated.midiParts.length, 2);
  assert.equal(migrated.midiParts[0].notes[0].startTick, 960);
  assert.equal(migrated.midiParts[1].notes[0].startTick, 480);
});

test('3/4 프로젝트의 한 마디를 1440 Tick으로 변환한다', () => {
  const project: LegacyProject = {
    bpm: 120,
    timeSignature: [3, 4],
    tracks: [],
    midiParts: [{
      id: 'part-1',
      trackId: 'track-1',
      startTick: 0,
      durationTicks: 2880,
      notes: [{ note: 60, velocity: 100, measureStart: 1, measureDuration: 1 }],
    }],
  };
  const note = migrateProjectToTicks(asProject(project)).midiParts[0].notes[0];

  assert.equal(note.startTick, 1440);
  assert.equal(note.durationTicks, 1440);
});

test('프로젝트와 파트 메타데이터를 보존한다', () => {
  const project: LegacyProject = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [{
      id: 'part-1',
      trackId: 'track-1',
      startTick: 0,
      durationTicks: 480,
      historyIndex: 3,
      controlChanges: [{ tick: 120, controller: 64, value: 127, channel: 1 }],
      notes: [],
    }],
    masterVolume: 0.8,
    masterPan: 0.2,
    masterEffects: [],
  };
  const migrated = migrateProjectToTicks(asProject(project));

  assert.equal(migrated.masterVolume, 0.8);
  assert.equal(migrated.masterPan, 0.2);
  assert.deepEqual(migrated.masterEffects, []);
  assert.equal(migrated.midiParts[0].historyIndex, 3);
  assert.deepEqual(migrated.midiParts[0].controlChanges, [
    { tick: 120, controller: 64, value: 127, channel: 1 },
  ]);
});

test('시간 위치가 없는 잘못된 레거시 노트는 오류로 거부한다', () => {
  assert.throws(
    () => migrateNoteToTicks(
      { note: 60, velocity: 100 },
      createPart([]),
      [4, 4],
    ),
    /Note must have either/,
  );
});

let failed = 0;
console.log('MIDI 마이그레이션 통합 테스트\n');

for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`✓ ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${testCase.name}`);
    console.error(error);
  }
}

console.log(`\n결과: ${tests.length - failed}/${tests.length} 통과`);
if (failed > 0) process.exitCode = 1;
