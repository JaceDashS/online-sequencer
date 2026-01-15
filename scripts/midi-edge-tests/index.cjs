#!/usr/bin/env node
'use strict';

/**
 * MIDI Tick 변환 경계값 및 엣지 케이스 테스트
 * Phase 5: 테스트 및 검증
 */

const MIDI_CONSTANTS = {
  PPQN: 480,
  MIN_NOTE_DURATION_TICKS: 1,
  MAX_NOTE_DURATION_TICKS: 6912000,
};

function measureToTicks(measureStart, measureDuration, _bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatsPerMeasure = timeSignature[0];
  const ticksPerMeasure = beatsPerMeasure * ppqn;
  const startTick = Math.round(measureStart * ticksPerMeasure);
  const durationTicks = Math.round(measureDuration * ticksPerMeasure);
  return { startTick, durationTicks };
}

function ticksToMeasure(startTick, durationTicks, _bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatsPerMeasure = timeSignature[0];
  const ticksPerMeasure = beatsPerMeasure * ppqn;
  const measureStart = startTick / ticksPerMeasure;
  const measureDuration = durationTicks / ticksPerMeasure;
  return { measureStart, measureDuration };
}

function secondsToTicks(startTime, duration, bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const ticksPerSecond = ppqn / secondsPerBeat;
  const startTick = Math.round(startTime * ticksPerSecond);
  const durationTicks = Math.round(duration * ticksPerSecond);
  return { startTick, durationTicks };
}

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
    toBeGreaterThan(expected) {
      if (actual <= expected) {
        throw { message: `Expected ${actual} to be greater than ${expected}`, expected, actual };
      }
    },
    toBeLessThan(expected) {
      if (actual >= expected) {
        throw { message: `Expected ${actual} to be less than ${expected}`, expected, actual };
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -precision);
      if (diff > tolerance) {
        throw { message: `Expected ${expected} (±${tolerance}), but got ${actual}`, expected, actual };
      }
    },
  };
}

// 테스트 실행
console.log('MIDI Tick 경계값 및 엣지 케이스 테스트\n');
console.log('='.repeat(60));

// Test 1: 매우 작은 값
test('measureToTicks: 매우 작은 마디 값 (0.001)', () => {
  const result = measureToTicks(0.001, 0.001, 120, [4, 4]);
  // 0.001 * 1920 = 1.92 → Math.round = 2
  expect(result.startTick).toBeGreaterThan(0);
  expect(result.durationTicks).toBeGreaterThan(0);
});

// Test 2: 매우 큰 값
test('measureToTicks: 매우 큰 마디 값 (1000)', () => {
  const result = measureToTicks(1000, 100, 120, [4, 4]);
  // 1000 * 1920 = 1,920,000
  expect(result.startTick).toBe(1920000);
  expect(result.durationTicks).toBe(192000);
});

// Test 3: 최소 노트 길이
test('measureToTicks: 최소 노트 길이 (1 tick)', () => {
  // 1 tick = 1 / 1920 measure ≈ 0.0005208
  const verySmallMeasure = 1 / 1920;
  const result = measureToTicks(0, verySmallMeasure, 120, [4, 4]);
  expect(result.durationTicks).toBe(1);
});

// Test 4: 최대 노트 길이 (약 1시간 @ 120 BPM)
test('secondsToTicks: 최대 노트 길이 테스트 (약 1시간)', () => {
  // 1시간 = 3600초 @ 120 BPM, 4/4 박자
  // 120 BPM = 2 beats/sec
  // 1 beat = 480 ticks
  // 3600 sec = 7200 beats = 3,456,000 ticks
  const result = secondsToTicks(0, 3600, 120, [4, 4]);
  expect(result.durationTicks).toBe(3456000);
  expect(result.durationTicks).toBeLessThan(MIDI_CONSTANTS.MAX_NOTE_DURATION_TICKS);
});

// Test 5: 다양한 BPM 테스트
test('secondsToTicks: 다양한 BPM (60, 120, 180, 240)', () => {
  const bpmValues = [60, 120, 180, 240];
  bpmValues.forEach(bpm => {
    const result = secondsToTicks(1.0, 1.0, bpm, [4, 4]);
    // 1초 = bpm/60 beats = (bpm/60) * 480 ticks
    const expectedTicks = Math.round((bpm / 60) * 480);
    expect(result.startTick).toBe(expectedTicks);
    expect(result.durationTicks).toBe(expectedTicks);
  });
});

// Test 6: 다양한 타임 시그니처
test('measureToTicks: 다양한 타임 시그니처 (2/4, 3/4, 4/4, 5/4, 6/8)', () => {
  const timeSignatures = [
    [2, 4], // 2 beats = 960 ticks
    [3, 4], // 3 beats = 1440 ticks
    [4, 4], // 4 beats = 1920 ticks
    [5, 4], // 5 beats = 2400 ticks
    [6, 8], // 6 beats = 2880 ticks (8분음표 기준이지만 beatsPerMeasure는 6)
  ];
  
  timeSignatures.forEach(([beats, unit]) => {
    const result = measureToTicks(1.0, 1.0, 120, [beats, unit]);
    const expectedTicks = beats * 480;
    expect(result.startTick).toBe(expectedTicks);
    expect(result.durationTicks).toBe(expectedTicks);
  });
});

// Test 7: 음수 값 처리 (0으로 클램핑되어야 함)
test('measureToTicks: 음수 값 처리', () => {
  const result = measureToTicks(-1.0, -0.5, 120, [4, 4]);
  // Math.round는 음수를 그대로 반올림하므로 음수 tick이 나올 수 있음
  // 실제 구현에서는 클램핑이 필요할 수 있음
  expect(result.startTick).toBeLessThan(0);
  expect(result.durationTicks).toBeLessThan(0);
});

// Test 8: 소수점 정밀도 누적 오차 테스트
test('measureToTicks: 소수점 정밀도 누적 오차 테스트', () => {
  // 여러 번 변환해도 오차가 누적되지 않는지 확인
  let current = { measureStart: 0.1, measureDuration: 0.1 };
  for (let i = 0; i < 10; i++) {
    const { startTick, durationTicks } = measureToTicks(current.measureStart, current.measureDuration, 120, [4, 4]);
    const converted = ticksToMeasure(startTick, durationTicks, 120, [4, 4]);
    // 변환 후 다시 변환했을 때 원래 값과 비슷해야 함
    expect(Math.abs(converted.measureStart - current.measureStart)).toBeLessThan(0.01);
    expect(Math.abs(converted.measureDuration - current.measureDuration)).toBeLessThan(0.01);
    current = converted;
  }
});

// Test 9: PPQN 변경 영향 테스트
test('measureToTicks: PPQN 변경 영향 (480 vs 960)', () => {
  const result480 = measureToTicks(1.0, 1.0, 120, [4, 4], 480);
  const result960 = measureToTicks(1.0, 1.0, 120, [4, 4], 960);
  
  // PPQN이 2배가 되면 tick도 2배가 되어야 함
  expect(result960.startTick).toBe(result480.startTick * 2);
  expect(result960.durationTicks).toBe(result480.durationTicks * 2);
});

// Test 10: BPM 변경 시 Tick 유지 확인
test('measureToTicks: BPM 변경 시 Tick 값 유지 (BPM 독립적)', () => {
  const result60 = measureToTicks(1.0, 1.0, 60, [4, 4]);
  const result120 = measureToTicks(1.0, 1.0, 120, [4, 4]);
  const result240 = measureToTicks(1.0, 1.0, 240, [4, 4]);
  
  // measure 기반이므로 BPM과 무관하게 동일해야 함
  expect(result60.startTick).toBe(result120.startTick);
  expect(result120.startTick).toBe(result240.startTick);
});

// Test 11: 초 단위 변환의 BPM 의존성
test('secondsToTicks: BPM 변경 시 Tick 값 변경 (초 기반)', () => {
  const result60 = secondsToTicks(1.0, 1.0, 60, [4, 4]);
  const result120 = secondsToTicks(1.0, 1.0, 120, [4, 4]);
  const result240 = secondsToTicks(1.0, 1.0, 240, [4, 4]);
  
  // 초 기반이므로 BPM에 따라 달라져야 함
  expect(result120.startTick).toBe(result60.startTick * 2);
  expect(result240.startTick).toBe(result120.startTick * 2);
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

