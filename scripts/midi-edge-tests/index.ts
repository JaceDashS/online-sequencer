import assert from 'node:assert/strict';
import { MIDI_CONSTANTS } from '../../src/constants/midi';
import {
  bpmToMpqn,
  measureToTicksPure,
  secondsToTicksPure,
  ticksToMeasurePure,
} from '../../src/utils/midiTickUtils';

type TestCase = {
  name: string;
  run: () => void;
};

const PPQN = MIDI_CONSTANTS.PPQN;
const FOUR_FOUR: [number, number] = [4, 4];
const tests: TestCase[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function tempo(bpm: number) {
  return [{ tick: 0, mpqn: bpmToMpqn(bpm) }];
}

test('매우 작은 마디 값을 양수 Tick으로 반올림한다', () => {
  const result = measureToTicksPure(0.001, 0.001, FOUR_FOUR, PPQN);

  assert.equal(result.startTick, 2);
  assert.equal(result.durationTicks, 2);
});

test('큰 마디 값을 정밀도 손실 없이 변환한다', () => {
  assert.deepEqual(measureToTicksPure(1000, 100, FOUR_FOUR, PPQN), {
    startTick: 1_920_000,
    durationTicks: 192_000,
  });
});

test('최소 노트 길이에 해당하는 마디 값을 1 Tick으로 변환한다', () => {
  const result = measureToTicksPure(0, 1 / 1920, FOUR_FOUR, PPQN);

  assert.equal(result.durationTicks, MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS);
});

test('120 BPM의 1시간이 최대 허용 길이 안에 들어간다', () => {
  const result = secondsToTicksPure(0, 3600, tempo(120), FOUR_FOUR, PPQN);

  assert.equal(result.durationTicks, 3_456_000);
  assert.ok(result.durationTicks < MIDI_CONSTANTS.MAX_NOTE_DURATION_TICKS);
});

test('초 변환은 BPM에 비례해 Tick이 증가한다', () => {
  const ticks60 = secondsToTicksPure(1, 1, tempo(60), FOUR_FOUR, PPQN).startTick;
  const ticks120 = secondsToTicksPure(1, 1, tempo(120), FOUR_FOUR, PPQN).startTick;
  const ticks240 = secondsToTicksPure(1, 1, tempo(240), FOUR_FOUR, PPQN).startTick;

  assert.equal(ticks60, 480);
  assert.equal(ticks120, ticks60 * 2);
  assert.equal(ticks240, ticks120 * 2);
});

test('박자표의 분자와 분모를 모두 마디 길이에 반영한다', () => {
  const expectations: Array<[[number, number], number]> = [
    [[2, 4], 960],
    [[3, 4], 1440],
    [[4, 4], 1920],
    [[5, 4], 2400],
    [[6, 8], 1440],
  ];

  for (const [timeSignature, expectedTicks] of expectations) {
    assert.deepEqual(measureToTicksPure(1, 1, timeSignature, PPQN), {
      startTick: expectedTicks,
      durationTicks: expectedTicks,
    });
  }
});

test('현재 음수 마디 입력 동작을 명시적으로 보존한다', () => {
  assert.deepEqual(measureToTicksPure(-1, -0.5, FOUR_FOUR, PPQN), {
    startTick: -1920,
    durationTicks: -960,
  });
});

test('반복 양방향 변환에서도 Tick 반올림 오차가 누적되지 않는다', () => {
  let current = { measureStart: 0.1, measureDuration: 0.1 };

  for (let index = 0; index < 10; index += 1) {
    const ticks = measureToTicksPure(
      current.measureStart,
      current.measureDuration,
      FOUR_FOUR,
      PPQN,
    );
    current = ticksToMeasurePure(
      ticks.startTick,
      ticks.durationTicks,
      FOUR_FOUR,
      PPQN,
    );
  }

  assert.ok(Math.abs(current.measureStart - 0.1) < 0.001);
  assert.ok(Math.abs(current.measureDuration - 0.1) < 0.001);
});

test('PPQN이 두 배가 되면 마디 Tick도 두 배가 된다', () => {
  const ticks480 = measureToTicksPure(1, 1, FOUR_FOUR, 480);
  const ticks960 = measureToTicksPure(1, 1, FOUR_FOUR, 960);

  assert.equal(ticks960.startTick, ticks480.startTick * 2);
  assert.equal(ticks960.durationTicks, ticks480.durationTicks * 2);
});

test('템포가 바뀌어도 마디 기반 Tick은 변하지 않는다', () => {
  const result = measureToTicksPure(1, 1, FOUR_FOUR, PPQN);

  assert.deepEqual(result, { startTick: 1920, durationTicks: 1920 });
});

let failed = 0;
console.log('MIDI Tick 경계값 통합 테스트\n');

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
