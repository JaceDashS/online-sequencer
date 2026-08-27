import assert from 'node:assert/strict';
import {
  bpmToMpqn,
  measureToTicksPure,
  secondsToTicksPure,
  ticksToMeasurePure,
  ticksToSecondsPure,
} from '../../src/utils/midiTickUtils';

type TestCase = {
  name: string;
  run: () => void;
};

const PPQN = 480;
const FOUR_FOUR: [number, number] = [4, 4];
const TEMPO_120 = [{ tick: 0, mpqn: bpmToMpqn(120) }];
const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function closeTo(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('4/4 마디 위치와 길이를 Tick으로 변환한다', () => {
  assert.deepEqual(measureToTicksPure(2.5, 1, FOUR_FOUR, PPQN), {
    startTick: 4800,
    durationTicks: 1920,
  });
});

test('4/4 Tick 위치와 길이를 마디로 변환한다', () => {
  assert.deepEqual(ticksToMeasurePure(4800, 1920, FOUR_FOUR, PPQN), {
    measureStart: 2.5,
    measureDuration: 1,
  });
});

test('마디와 Tick의 양방향 변환 오차를 제한한다', () => {
  const ticks = measureToTicksPure(1.5, 0.75, FOUR_FOUR, PPQN);
  const measures = ticksToMeasurePure(
    ticks.startTick,
    ticks.durationTicks,
    FOUR_FOUR,
    PPQN,
  );

  closeTo(measures.measureStart, 1.5);
  closeTo(measures.measureDuration, 0.75);
});

test('120 BPM의 초 위치와 길이를 Tick으로 변환한다', () => {
  assert.deepEqual(secondsToTicksPure(5, 2, TEMPO_120, FOUR_FOUR, PPQN), {
    startTick: 4800,
    durationTicks: 1920,
  });
});

test('120 BPM의 Tick 위치와 길이를 초로 변환한다', () => {
  assert.deepEqual(ticksToSecondsPure(4800, 1920, TEMPO_120, FOUR_FOUR, PPQN), {
    startTime: 5,
    duration: 2,
  });
});

test('초와 Tick의 양방향 변환 오차를 제한한다', () => {
  const ticks = secondsToTicksPure(3.5, 1.25, TEMPO_120, FOUR_FOUR, PPQN);
  const seconds = ticksToSecondsPure(
    ticks.startTick,
    ticks.durationTicks,
    TEMPO_120,
    FOUR_FOUR,
    PPQN,
  );

  closeTo(seconds.startTime, 3.5);
  closeTo(seconds.duration, 1.25);
});

test('3/4 박자의 한 마디를 1440 Tick으로 계산한다', () => {
  assert.deepEqual(measureToTicksPure(2, 1, [3, 4], PPQN), {
    startTick: 2880,
    durationTicks: 1440,
  });
});

test('60 BPM의 1초를 480 Tick으로 계산한다', () => {
  const tempoMap = [{ tick: 0, mpqn: bpmToMpqn(60) }];

  assert.deepEqual(secondsToTicksPure(1, 0.5, tempoMap, FOUR_FOUR, PPQN), {
    startTick: 480,
    durationTicks: 240,
  });
});

test('0 마디와 0초를 0 Tick으로 계산한다', () => {
  assert.deepEqual(measureToTicksPure(0, 0, FOUR_FOUR, PPQN), {
    startTick: 0,
    durationTicks: 0,
  });
  assert.deepEqual(secondsToTicksPure(0, 0, TEMPO_120, FOUR_FOUR, PPQN), {
    startTick: 0,
    durationTicks: 0,
  });
});

test('분수 마디를 정수 Tick으로 반올림한다', () => {
  assert.deepEqual(measureToTicksPure(0.125, 0.25, FOUR_FOUR, PPQN), {
    startTick: 240,
    durationTicks: 480,
  });
});

test('6/8 박자의 120 BPM 초 변환에 8분음표 단위를 적용한다', () => {
  assert.deepEqual(secondsToTicksPure(2, 1, TEMPO_120, [6, 8], PPQN), {
    startTick: 3840,
    durationTicks: 1920,
  });
});

test('PPQN 960에서 4/4 한 마디를 3840 Tick으로 계산한다', () => {
  assert.deepEqual(measureToTicksPure(1, 0.5, FOUR_FOUR, 960), {
    startTick: 3840,
    durationTicks: 1920,
  });
});

let failed = 0;
console.log('MIDI Tick 변환 통합 테스트\n');

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
