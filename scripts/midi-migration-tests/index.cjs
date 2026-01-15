#!/usr/bin/env node
'use strict';

/**
 * MIDI 마이그레이션 함수 테스트
 * Phase 5: 테스트 및 검증
 */

// 테스트 헬퍼
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    if (error.expected !== undefined && error.actual !== undefined) {
      console.error(`  Expected: ${JSON.stringify(error.expected)}`);
      console.error(`  Actual: ${JSON.stringify(error.actual)}`);
    }
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw { message: `Expected ${expected}, but got ${actual}`, expected, actual };
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -precision);
      if (diff > tolerance) {
        throw { message: `Expected ${expected} (±${tolerance}), but got ${actual}`, expected, actual };
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw { message: `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`, expected, actual };
      }
    },
    toHaveProperty(prop) {
      if (!(prop in actual)) {
        throw { message: `Expected object to have property ${prop}`, expected: prop, actual: Object.keys(actual) };
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw { message: `Expected value to be defined, but got undefined`, expected: 'defined', actual: undefined };
      }
    },
  };
}

// 변환 함수 (테스트용)
const MIDI_CONSTANTS = { PPQN: 480 };

function measureToTicks(measureStart, measureDuration, _bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatsPerMeasure = timeSignature[0];
  const ticksPerMeasure = beatsPerMeasure * ppqn;
  const startTick = Math.round(measureStart * ticksPerMeasure);
  const durationTicks = Math.round(measureDuration * ticksPerMeasure);
  return { startTick, durationTicks };
}

function migrateNoteToTicks(note, _part, bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const { startTick, durationTicks } = measureToTicks(
    note.measureStart,
    note.measureDuration,
    bpm,
    timeSignature,
    ppqn
  );
  return {
    ...note,
    startTick,
    durationTicks,
  };
}

function needsMigration(project) {
  const version = project.version ?? 1;
  return version < 2;
}

function migrateProjectToTicks(project, ppqn = MIDI_CONSTANTS.PPQN) {
  const { bpm, timeSignature, midiParts, ...rest } = project;
  
  const migratedParts = midiParts.map((part) => {
    const migratedNotes = part.notes.map((note) => {
      if (note.startTick !== undefined && note.durationTicks !== undefined) {
        return note;
      }
      if (note.measureStart !== undefined && note.measureDuration !== undefined) {
        return migrateNoteToTicks(note, part, bpm, timeSignature, ppqn);
      }
      console.warn('Note missing both Tick and measure fields:', note);
      return note;
    });
    
    return {
      ...part,
      notes: migratedNotes,
    };
  });
  
  return {
    ...rest,
    bpm,
    timeSignature,
    midiParts: migratedParts,
    version: 2,
  };
}

// 테스트 실행
console.log('MIDI 마이그레이션 함수 테스트\n');
console.log('='.repeat(60));

// Test 1: needsMigration - 버전 없음
test('needsMigration: 버전이 없는 프로젝트는 마이그레이션 필요', () => {
  const project = { bpm: 120, timeSignature: [4, 4], tracks: [], midiParts: [] };
  expect(needsMigration(project)).toBe(true);
});

// Test 2: needsMigration - 버전 1
test('needsMigration: 버전 1 프로젝트는 마이그레이션 필요', () => {
  const project = { version: 1, bpm: 120, timeSignature: [4, 4], tracks: [], midiParts: [] };
  expect(needsMigration(project)).toBe(true);
});

// Test 3: needsMigration - 버전 2
test('needsMigration: 버전 2 프로젝트는 마이그레이션 불필요', () => {
  const project = { version: 2, bpm: 120, timeSignature: [4, 4], tracks: [], midiParts: [] };
  expect(needsMigration(project)).toBe(false);
});

// Test 4: migrateNoteToTicks - 기본 변환
test('migrateNoteToTicks: measureStart/measureDuration을 startTick/durationTicks로 변환', () => {
  const note = { note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1.0 };
  const part = { id: 'part1', trackId: 'track1', measureStart: 0, measureDuration: 4, notes: [] };
  const migrated = migrateNoteToTicks(note, part, 120, [4, 4]);
  
  expect(migrated.startTick).toBeDefined();
  expect(migrated.durationTicks).toBeDefined();
  expect(migrated.startTick).toBe(960); // 0.5 * 1920
  expect(migrated.durationTicks).toBe(1920); // 1.0 * 1920
  expect(migrated.note).toBe(60);
  expect(migrated.velocity).toBe(100);
  // 기존 필드도 유지되어야 함
  expect(migrated.measureStart).toBe(0.5);
  expect(migrated.measureDuration).toBe(1.0);
});

// Test 5: migrateProjectToTicks - 빈 프로젝트
test('migrateProjectToTicks: 빈 프로젝트 마이그레이션', () => {
  const project = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [],
  };
  const migrated = migrateProjectToTicks(project);
  
  expect(migrated.version).toBe(2);
  expect(migrated.bpm).toBe(120);
  expect(migrated.timeSignature).toEqual([4, 4]);
  expect(migrated.midiParts).toEqual([]);
});

// Test 6: migrateProjectToTicks - 노트가 있는 프로젝트
test('migrateProjectToTicks: 노트가 있는 프로젝트 마이그레이션', () => {
  const project = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [{ id: 'track1', name: 'Track 1', instrument: 'piano', volume: 1, pan: 0, effects: [], solo: false, mute: false, mutedBySolo: false }],
    midiParts: [
      {
        id: 'part1',
        trackId: 'track1',
        measureStart: 0,
        measureDuration: 4,
        notes: [
          { note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1.0 },
          { note: 64, velocity: 80, measureStart: 2.0, measureDuration: 0.5 },
        ],
      },
    ],
  };
  const migrated = migrateProjectToTicks(project);
  
  expect(migrated.version).toBe(2);
  expect(migrated.midiParts.length).toBe(1);
  expect(migrated.midiParts[0].notes.length).toBe(2);
  
  // 첫 번째 노트 확인
  const note1 = migrated.midiParts[0].notes[0];
  expect(note1.startTick).toBeDefined();
  expect(note1.durationTicks).toBeDefined();
  expect(note1.startTick).toBe(960); // 0.5 * 1920
  expect(note1.durationTicks).toBe(1920); // 1.0 * 1920
  
  // 두 번째 노트 확인
  const note2 = migrated.midiParts[0].notes[1];
  expect(note2.startTick).toBeDefined();
  expect(note2.durationTicks).toBeDefined();
  expect(note2.startTick).toBe(3840); // 2.0 * 1920
  expect(note2.durationTicks).toBe(960); // 0.5 * 1920
});

// Test 7: migrateProjectToTicks - 이미 Tick이 있는 노트는 유지
test('migrateProjectToTicks: 이미 Tick이 있는 노트는 그대로 유지', () => {
  const project = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [
      {
        id: 'part1',
        trackId: 'track1',
        measureStart: 0,
        measureDuration: 4,
        notes: [
          { note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1.0, startTick: 999, durationTicks: 888 },
        ],
      },
    ],
  };
  const migrated = migrateProjectToTicks(project);
  
  const note = migrated.midiParts[0].notes[0];
  expect(note.startTick).toBe(999); // 기존 값 유지
  expect(note.durationTicks).toBe(888); // 기존 값 유지
});

// Test 8: migrateProjectToTicks - 여러 파트 마이그레이션
test('migrateProjectToTicks: 여러 파트 마이그레이션', () => {
  const project = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [
      {
        id: 'part1',
        trackId: 'track1',
        measureStart: 0,
        measureDuration: 2,
        notes: [{ note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1.0 }],
      },
      {
        id: 'part2',
        trackId: 'track2',
        measureStart: 2,
        measureDuration: 2,
        notes: [{ note: 64, velocity: 80, measureStart: 0.25, measureDuration: 0.5 }],
      },
    ],
  };
  const migrated = migrateProjectToTicks(project);
  
  expect(migrated.midiParts.length).toBe(2);
  expect(migrated.midiParts[0].notes[0].startTick).toBeDefined();
  expect(migrated.midiParts[1].notes[0].startTick).toBeDefined();
});

// Test 9: migrateProjectToTicks - 다른 타임 시그니처
test('migrateProjectToTicks: 3/4 박자 프로젝트 마이그레이션', () => {
  const project = {
    bpm: 120,
    timeSignature: [3, 4],
    tracks: [],
    midiParts: [
      {
        id: 'part1',
        trackId: 'track1',
        measureStart: 0,
        measureDuration: 2,
        notes: [{ note: 60, velocity: 100, measureStart: 1.0, measureDuration: 1.0 }],
      },
    ],
  };
  const migrated = migrateProjectToTicks(project);
  
  const note = migrated.midiParts[0].notes[0];
  // 3/4 박자: 1 measure = 3 beats = 3 * 480 = 1440 ticks
  expect(note.startTick).toBe(1440); // 1.0 * 1440
  expect(note.durationTicks).toBe(1440); // 1.0 * 1440
});

// Test 10: migrateProjectToTicks - 프로젝트 메타데이터 유지
test('migrateProjectToTicks: 프로젝트 메타데이터 유지', () => {
  const project = {
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [],
    masterVolume: 0.8,
    masterPan: 0.2,
    masterEffects: [],
  };
  const migrated = migrateProjectToTicks(project);
  
  expect(migrated.masterVolume).toBe(0.8);
  expect(migrated.masterPan).toBe(0.2);
  expect(migrated.masterEffects).toEqual([]);
});

console.log('\n' + '='.repeat(60));
console.log(`\n테스트 결과: ${passCount}/${testCount} 통과`);
if (failCount > 0) {
  console.error(`실패: ${failCount}개`);
  process.exit(1);
} else {
  console.log('모든 테스트 통과! ✓');
  process.exit(0);
}










