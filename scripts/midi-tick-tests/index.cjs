#!/usr/bin/env node
'use strict';

/**
 * MIDI Tick 변환 함수 테스트
 * Phase 5: 테스트 및 검증
 */

const path = require('path');
const fs = require('fs');

// TypeScript 파일을 직접 실행할 수 없으므로, 
// 변환 로직을 JavaScript로 재구현하여 테스트

const MIDI_CONSTANTS = {
  PPQN: 480,
  MIN_NOTE_DURATION_TICKS: 1,
  MAX_NOTE_DURATION_TICKS: 6912000,
};

/**
 * 마디 → Tick 변환
 */
function measureToTicks(measureStart, measureDuration, _bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatsPerMeasure = timeSignature[0];
  const ticksPerMeasure = beatsPerMeasure * ppqn;
  const startTick = Math.round(measureStart * ticksPerMeasure);
  const durationTicks = Math.round(measureDuration * ticksPerMeasure);
  return { startTick, durationTicks };
}

/**
 * Tick → 마디 변환
 */
function ticksToMeasure(startTick, durationTicks, _bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatsPerMeasure = timeSignature[0];
  const ticksPerMeasure = beatsPerMeasure * ppqn;
  const measureStart = startTick / ticksPerMeasure;
  const measureDuration = durationTicks / ticksPerMeasure;
  return { measureStart, measureDuration };
}

/**
 * 초 → Tick 변환
 */
function secondsToTicks(startTime, duration, bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const ticksPerSecond = ppqn / secondsPerBeat;
  const startTick = Math.round(startTime * ticksPerSecond);
  const durationTicks = Math.round(duration * ticksPerSecond);
  return { startTick, durationTicks };
}

/**
 * Tick → 초 변환
 */
function ticksToSeconds(startTick, durationTicks, bpm, timeSignature, ppqn = MIDI_CONSTANTS.PPQN) {
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const ticksPerSecond = ppqn / secondsPerBeat;
  const startTime = startTick / ticksPerSecond;
  const duration = durationTicks / ticksPerSecond;
  return { startTime, duration };
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
  };
}

// 테스트 실행
console.log('MIDI Tick 변환 함수 테스트\n');
console.log('='.repeat(60));

// Test 1: measureToTicks 기본 테스트
test('measureToTicks: 4/4 박자, 120 BPM에서 2.5 마디 위치, 1 마디 길이', () => {
  const result = measureToTicks(2.5, 1.0, 120, [4, 4]);
  // 1 measure = 4 beats = 4 * 480 = 1920 ticks
  // 2.5 measures = 2.5 * 1920 = 4800 ticks
  // 1 measure = 1920 ticks
  expect(result.startTick).toBe(4800);
  expect(result.durationTicks).toBe(1920);
});

// Test 2: ticksToMeasure 역변환 테스트
test('ticksToMeasure: 4/4 박자, 120 BPM에서 4800 tick 위치, 1920 tick 길이', () => {
  const result = ticksToMeasure(4800, 1920, 120, [4, 4]);
  expect(result.measureStart).toBeCloseTo(2.5, 5);
  expect(result.measureDuration).toBeCloseTo(1.0, 5);
});

// Test 3: measureToTicks ↔ ticksToMeasure 양방향 변환
test('measureToTicks ↔ ticksToMeasure 양방향 변환 정확도', () => {
  const original = { measureStart: 1.5, measureDuration: 0.75 };
  const { startTick, durationTicks } = measureToTicks(original.measureStart, original.measureDuration, 120, [4, 4]);
  const converted = ticksToMeasure(startTick, durationTicks, 120, [4, 4]);
  expect(converted.measureStart).toBeCloseTo(original.measureStart, 5);
  expect(converted.measureDuration).toBeCloseTo(original.measureDuration, 5);
});

// Test 4: secondsToTicks 기본 테스트
test('secondsToTicks: 4/4 박자, 120 BPM에서 5.0초 위치, 2.0초 길이', () => {
  const result = secondsToTicks(5.0, 2.0, 120, [4, 4]);
  // 120 BPM = 2 beats/sec = 0.5 sec/beat
  // 1 beat = 480 ticks
  // 5.0 sec = 10 beats = 4800 ticks
  // 2.0 sec = 4 beats = 1920 ticks
  expect(result.startTick).toBe(4800);
  expect(result.durationTicks).toBe(1920);
});

// Test 5: ticksToSeconds 역변환 테스트
test('ticksToSeconds: 4/4 박자, 120 BPM에서 4800 tick 위치, 1920 tick 길이', () => {
  const result = ticksToSeconds(4800, 1920, 120, [4, 4]);
  expect(result.startTime).toBeCloseTo(5.0, 2);
  expect(result.duration).toBeCloseTo(2.0, 2);
});

// Test 6: secondsToTicks ↔ ticksToSeconds 양방향 변환
test('secondsToTicks ↔ ticksToSeconds 양방향 변환 정확도', () => {
  const original = { startTime: 3.5, duration: 1.25 };
  const { startTick, durationTicks } = secondsToTicks(original.startTime, original.duration, 120, [4, 4]);
  const converted = ticksToSeconds(startTick, durationTicks, 120, [4, 4]);
  expect(converted.startTime).toBeCloseTo(original.startTime, 2);
  expect(converted.duration).toBeCloseTo(original.duration, 2);
});

// Test 7: 다른 타임 시그니처 테스트 (3/4 박자)
test('measureToTicks: 3/4 박자, 120 BPM에서 2.0 마디 위치, 1.0 마디 길이', () => {
  const result = measureToTicks(2.0, 1.0, 120, [3, 4]);
  // 1 measure = 3 beats = 3 * 480 = 1440 ticks
  // 2 measures = 2 * 1440 = 2880 ticks
  // 1 measure = 1440 ticks
  expect(result.startTick).toBe(2880);
  expect(result.durationTicks).toBe(1440);
});

// Test 8: 다른 BPM 테스트
test('measureToTicks: 4/4 박자, 60 BPM에서 1.0 마디 위치, 0.5 마디 길이', () => {
  const result = measureToTicks(1.0, 0.5, 60, [4, 4]);
  // BPM은 Tick 변환에 영향을 주지 않음 (measure 기반이므로)
  // 1 measure = 4 beats = 4 * 480 = 1920 ticks
  // 0.5 measure = 960 ticks
  expect(result.startTick).toBe(1920);
  expect(result.durationTicks).toBe(960);
});

// Test 9: 경계값 테스트 - 최소값
test('measureToTicks: 최소값 테스트 (0.0 마디)', () => {
  const result = measureToTicks(0.0, 0.0, 120, [4, 4]);
  expect(result.startTick).toBe(0);
  expect(result.durationTicks).toBe(0);
});

// Test 10: 경계값 테스트 - 소수점 정밀도
test('measureToTicks: 소수점 정밀도 테스트', () => {
  const result = measureToTicks(0.125, 0.25, 120, [4, 4]);
  // 0.125 measure = 0.125 * 1920 = 240 ticks
  // 0.25 measure = 0.25 * 1920 = 480 ticks
  expect(result.startTick).toBe(240);
  expect(result.durationTicks).toBe(480);
});

// Test 11: secondsToTicks 다른 타임 시그니처 (6/8 박자)
test('secondsToTicks: 6/8 박자, 120 BPM에서 2.0초 위치, 1.0초 길이', () => {
  const result = secondsToTicks(2.0, 1.0, 120, [6, 8]);
  // 6/8 박자: beatUnit = 8, noteValueRatio = 4/8 = 0.5
  // secondsPerBeat = (60/120) * 0.5 = 0.25 sec/beat
  // ticksPerSecond = 480 / 0.25 = 1920 ticks/sec
  // 2.0 sec = 3840 ticks
  // 1.0 sec = 1920 ticks
  expect(result.startTick).toBe(3840);
  expect(result.durationTicks).toBe(1920);
});

// Test 12: PPQN 변경 테스트
test('measureToTicks: PPQN=960으로 변경', () => {
  const result = measureToTicks(1.0, 0.5, 120, [4, 4], 960);
  // 1 measure = 4 beats = 4 * 960 = 3840 ticks
  // 0.5 measure = 1920 ticks
  expect(result.startTick).toBe(3840);
  expect(result.durationTicks).toBe(1920);
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

