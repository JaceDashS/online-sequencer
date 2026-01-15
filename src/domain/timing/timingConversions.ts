/**
 * 타이밍 변환 함수
 * 마디, 초, Tick 간의 순수 변환을 수행합니다.
 * 
 * @remarks
 * - 모든 함수는 명시적 파라미터를 받으며, 전역 상태에 의존하지 않습니다.
 * - 순수 함수로 구현되어 테스트가 용이합니다.
 * - SMF 표준 정합을 준수합니다.
 */

import type { TempoEvent, TimeSigEvent, Tick } from '../../types/project';

/**
 * 템포맵 정규화 (내부 헬퍼)
 * - 빈 템포맵이면 기본값(120 BPM) 추가
 * - tick 0에 템포 이벤트가 없으면 추가
 */
function normalizeTempoMap(tempoMap: TempoEvent[]): TempoEvent[] {
  const sorted = [...tempoMap].sort((a, b) => a.tick - b.tick);
  if (sorted.length === 0) {
    return [{ tick: 0, mpqn: bpmToMpqn(120) }];
  }
  if (sorted[0].tick > 0) {
    return [{ tick: 0, mpqn: bpmToMpqn(120) }, ...sorted];
  }
  return sorted;
}

/**
 * BPM을 MPQN (Microseconds Per Quarter Note)로 변환
 */
export function bpmToMpqn(bpm: number): number {
  return Math.round(60000000 / bpm);
}

/**
 * MPQN (Microseconds Per Quarter Note)를 BPM으로 변환
 */
export function mpqnToBpm(mpqn: number): number {
  return 60000000 / mpqn;
}

/**
 * 마디 → Tick 변환
 * 
 * @param measureStart - 시작 마디 위치
 * @param measureDuration - 마디 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note
 * @returns 변환된 Tick 정보
 */
export function measureToTicks(
  measureStart: number,
  measureDuration: number,
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  const beatsPerMeasure = timeSignature[0];
  
  // 1 beat = PPQN * 4 / beatUnit ticks (e.g. 6/8 => beatUnit=8)
  const ticksPerBeat = (ppqn * 4) / timeSignature[1];
  const ticksPerMeasure = beatsPerMeasure * ticksPerBeat;
  
  // 마디 위치를 Tick으로 변환
  const startTick = Math.round(measureStart * ticksPerMeasure);
  const durationTicks = Math.round(measureDuration * ticksPerMeasure);
  
  return { startTick, durationTicks };
}

/**
 * Tick → 마디 변환
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note
 * @returns 변환된 마디 정보
 */
export function ticksToMeasure(
  startTick: number,
  durationTicks: number,
  timeSignature: [number, number],
  ppqn: number
): { measureStart: number; measureDuration: number } {
  const beatsPerMeasure = timeSignature[0];
  
  // 1 beat = PPQN * 4 / beatUnit ticks
  const ticksPerBeat = (ppqn * 4) / timeSignature[1];
  const ticksPerMeasure = beatsPerMeasure * ticksPerBeat;
  
  // Tick을 마디로 변환
  const measureStart = startTick / ticksPerMeasure;
  const measureDuration = durationTicks / ticksPerMeasure;
  
  return { measureStart, measureDuration };
}

/**
 * 템포맵 기반 Tick → 초 변환
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param tempoMap - 템포 맵 (tick 오름차순 정렬)
 * @param timeSignature - 타임 시그니처
 * @param ppqn - PPQN
 * @returns 변환된 시간 정보
 */
export function ticksToSeconds(
  startTick: number,
  durationTicks: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTime: number; duration: number } {
  const endTick = startTick + durationTicks;
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;

  // SMF semantics: If there is no tempo event at tick 0, tempo is 120 BPM until the first SetTempo.
  const normalizedTempoMap = normalizeTempoMap(tempoMap);

  const ticksRangeToSeconds = (rangeStartTick: number, rangeEndTick: number): number => {
    if (rangeEndTick <= rangeStartTick) return 0;
    let totalSeconds = 0;

    for (let i = 0; i < normalizedTempoMap.length; i++) {
      const tempoEvent = normalizedTempoMap[i];
      const segStart = tempoEvent.tick;
      const segEnd = i < normalizedTempoMap.length - 1 ? normalizedTempoMap[i + 1].tick : Infinity;

      const overlapStart = Math.max(rangeStartTick, segStart);
      const overlapEnd = Math.min(rangeEndTick, segEnd);
      if (overlapStart >= overlapEnd) continue;

      const segmentTicks = overlapEnd - overlapStart;
      const bpm = mpqnToBpm(tempoEvent.mpqn);
      const secondsPerBeat = (60 / bpm) * noteValueRatio;
      const ticksPerSecond = ppqn / secondsPerBeat;
      totalSeconds += segmentTicks / ticksPerSecond;

      if (segStart > rangeEndTick) break;
    }

    return totalSeconds;
  };

  const absoluteStartTime = ticksRangeToSeconds(0, startTick);
  const duration = ticksRangeToSeconds(startTick, endTick);

  return { startTime: absoluteStartTime, duration };
}

/**
 * 특정 tick 위치에서 시작하여 주어진 시간(초)만큼의 tick 계산 (내부 헬퍼)
 */
function calculateTicksFromTime(
  startTick: number,
  durationSeconds: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): number {
  let remainingTime = durationSeconds;
  let currentTick = startTick;
  let totalTicks = 0;
  
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  
  // startTick부터 durationSeconds만큼의 tick 계산
  for (let i = 0; i < tempoMap.length && remainingTime > 0; i++) {
    const tempoEvent = tempoMap[i];
    const nextTempoTick = i < tempoMap.length - 1 
      ? tempoMap[i + 1].tick 
      : Infinity;
    
    // 현재 구간이 startTick 이후인지 확인
    if (nextTempoTick !== Infinity && nextTempoTick <= startTick) {
      continue;
    }
    
    const bpm = mpqnToBpm(tempoEvent.mpqn);
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const ticksPerSecond = ppqn / secondsPerBeat;
    
    // 구간의 시작과 끝
    const segmentStartTick = Math.max(currentTick, tempoEvent.tick);
    const segmentEndTick = nextTempoTick === Infinity ? Infinity : nextTempoTick;
    
    if (segmentStartTick >= segmentEndTick) {
      continue;
    }
    
    // 이 구간에서 사용할 수 있는 시간 계산
    const segmentTicks = segmentEndTick === Infinity ? Infinity : segmentEndTick - segmentStartTick;
    const segmentSeconds = segmentTicks === Infinity ? Infinity : segmentTicks / ticksPerSecond;
    
    const timeToUse = Math.min(remainingTime, segmentSeconds === Infinity ? Infinity : segmentSeconds);
    const ticksToAdd = timeToUse * ticksPerSecond;
    
    totalTicks += ticksToAdd;
    remainingTime -= timeToUse;
    currentTick = segmentEndTick === Infinity ? Infinity : segmentEndTick;
    
    if (remainingTime <= 0) {
      break;
    }
  }
  
  // 남은 시간이 있으면 마지막 템포로 계산
  if (remainingTime > 0) {
    const lastTempo = getTempoAtTick(tempoMap, currentTick === Infinity ? startTick : currentTick);
    const bpm = mpqnToBpm(lastTempo.mpqn);
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const ticksPerSecond = ppqn / secondsPerBeat;
    totalTicks += remainingTime * ticksPerSecond;
  }
  
  return Math.round(totalTicks);
}

/**
 * 템포맵 기반 초 → Tick 변환
 * 
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param tempoMap - 템포 맵 (tick 오름차순 정렬)
 * @param timeSignature - 타임 시그니처
 * @param ppqn - PPQN
 * @returns 변환된 Tick 정보
 */
export function secondsToTicks(
  startTime: number,
  duration: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  const normalizedTempoMap = normalizeTempoMap(tempoMap);
  let accumulatedTime = 0;
  let accumulatedTick = 0;
  
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  
  // 음수 시간 처리: 음수 시간은 단순 BPM 계산으로 처리 (템포맵은 0부터 시작)
  if (startTime < 0) {
    // 첫 번째 템포 이벤트의 BPM 사용 (또는 기본 BPM)
    const firstTempo = normalizedTempoMap.length > 0 
      ? normalizedTempoMap[0] 
      : { tick: 0, mpqn: bpmToMpqn(120) }; // 기본 120 BPM
    const bpm = mpqnToBpm(firstTempo.mpqn);
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const ticksPerSecond = ppqn / secondsPerBeat;
    const startTick = Math.round(startTime * ticksPerSecond); // 음수 tick 반환
    const durationTicks = Math.round(duration * ticksPerSecond);
    return { startTick, durationTicks };
  }
  
  // startTime까지의 tick 계산 (양수 시간)
  let startTick = 0;
  for (let i = 0; i < normalizedTempoMap.length; i++) {
    const tempoEvent = normalizedTempoMap[i];
    const nextTempoTick = i < normalizedTempoMap.length - 1 
      ? normalizedTempoMap[i + 1].tick 
      : Infinity;
    
    const bpm = mpqnToBpm(tempoEvent.mpqn);
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const ticksPerSecond = ppqn / secondsPerBeat;
    
    // 이 구간의 길이 계산
    const segmentStartTick = tempoEvent.tick;
    const segmentEndTick = nextTempoTick === Infinity ? Infinity : nextTempoTick;
    const segmentTicks = segmentEndTick === Infinity ? Infinity : segmentEndTick - segmentStartTick;
    const segmentSeconds = segmentTicks === Infinity ? Infinity : segmentTicks / ticksPerSecond;
    
    // startTime이 이 구간에 있는지 확인
    if (accumulatedTime <= startTime && (segmentSeconds === Infinity || startTime < accumulatedTime + segmentSeconds)) {
      // startTime이 이 구간에 있음
      const timeInSegment = startTime - accumulatedTime;
      const tickInSegment = timeInSegment * ticksPerSecond;
      startTick = segmentStartTick + Math.round(tickInSegment);
      break;
    }
    
    // 다음 구간으로 이동
    accumulatedTime += segmentSeconds;
    accumulatedTick = segmentEndTick === Infinity ? Infinity : segmentEndTick;
  }
  
  // startTick을 찾지 못했으면 마지막 템포로 계산
  if (startTick === 0 && accumulatedTime < startTime) {
    const lastTempo = getTempoAtTick(normalizedTempoMap, accumulatedTick === Infinity ? 0 : accumulatedTick);
    const bpm = mpqnToBpm(lastTempo.mpqn);
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const ticksPerSecond = ppqn / secondsPerBeat;
    const remainingTime = startTime - accumulatedTime;
    startTick = (accumulatedTick === Infinity ? 0 : accumulatedTick) + Math.round(remainingTime * ticksPerSecond);
  }
  
  // duration만큼의 tick 계산 (startTick부터)
  const durationTicks = calculateTicksFromTime(startTick, duration, normalizedTempoMap, timeSignature, ppqn);
  
  return { startTick, durationTicks };
}

/**
 * 현재 tick에서의 템포 이벤트 조회
 */
export function getTempoAtTick(tempoMap: TempoEvent[], tick: Tick): TempoEvent {
  if (tempoMap.length === 0) {
    // 기본값: 120 BPM
    return { tick: 0, mpqn: bpmToMpqn(120) };
  }
  
  // tick 이하의 가장 큰 템포 이벤트 찾기
  let result = tempoMap[0];
  for (let i = 0; i < tempoMap.length; i++) {
    if (tempoMap[i].tick <= tick) {
      result = tempoMap[i];
    } else {
      break;
    }
  }
  
  return result;
}

/**
 * 현재 tick에서의 타임 시그니처 이벤트 조회
 */
export function getTimeSigAtTick(timeSigMap: TimeSigEvent[], tick: Tick): TimeSigEvent {
  if (timeSigMap.length === 0) {
    // 기본값: 4/4
    return { tick: 0, num: 4, den: 4 };
  }
  
  // tick 이하의 가장 큰 타임 시그니처 이벤트 찾기
  let result = timeSigMap[0];
  for (let i = 0; i < timeSigMap.length; i++) {
    if (timeSigMap[i].tick <= tick) {
      result = timeSigMap[i];
    } else {
      break;
    }
  }
  
  return result;
}

