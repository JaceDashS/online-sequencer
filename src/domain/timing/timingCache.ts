/**
 * 시간 변환 연산 캐싱
 * 
 * @remarks
 * - 반복적인 시간 변환 계산 결과를 캐싱하여 성능을 개선합니다.
 * - 캐시 키는 파라미터의 조합으로 생성됩니다.
 * - BPM, 타임 시그니처, PPQN 변경 시 캐시가 무효화됩니다.
 */

import type { TempoEvent } from '../../types/project';
import * as timingConversions from './timingConversions';

/**
 * 캐시 엔트리 타입
 */
interface CacheEntry<T> {
  value: T;
}

/**
 * 캐시 저장소
 */
const measureToTicksCache = new Map<string, CacheEntry<{ startTick: number; durationTicks: number }>>();
const ticksToMeasureCache = new Map<string, CacheEntry<{ measureStart: number; measureDuration: number }>>();
const ticksToSecondsCache = new Map<string, CacheEntry<{ startTime: number; duration: number }>>();
const secondsToTicksCache = new Map<string, CacheEntry<{ startTick: number; durationTicks: number }>>();

/**
 * 캐시 키 생성 헬퍼
 * 파라미터를 JSON.stringify하여 키를 생성합니다.
 */
function createCacheKey(...params: unknown[]): string {
  return JSON.stringify(params);
}

/**
 * 캐시에서 조회하고, 없으면 계산하여 캐시에 저장합니다.
 */
function getOrCompute<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  compute: () => T
): T {
  const cached = cache.get(key);
  if (cached) {
    return cached.value;
  }
  
  const value = compute();
  cache.set(key, { value });
  return value;
}

/**
 * 캐시된 measureToTicks 호출
 * 
 * @param measureStart - 시작 마디 위치
 * @param measureDuration - 마디 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note
 * @returns 변환된 Tick 정보
 */
export function getCachedMeasureToTicks(
  measureStart: number,
  measureDuration: number,
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  const key = createCacheKey('measureToTicks', measureStart, measureDuration, timeSignature, ppqn);
  
  return getOrCompute(measureToTicksCache, key, () => {
    return timingConversions.measureToTicks(
      measureStart,
      measureDuration,
      timeSignature,
      ppqn
    );
  });
}

/**
 * 캐시된 ticksToMeasure 호출
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note
 * @returns 변환된 마디 정보
 */
export function getCachedTicksToMeasure(
  startTick: number,
  durationTicks: number,
  timeSignature: [number, number],
  ppqn: number
): { measureStart: number; measureDuration: number } {
  const key = createCacheKey('ticksToMeasure', startTick, durationTicks, timeSignature, ppqn);
  
  return getOrCompute(ticksToMeasureCache, key, () => {
    return timingConversions.ticksToMeasure(
      startTick,
      durationTicks,
      timeSignature,
      ppqn
    );
  });
}

/**
 * 캐시된 ticksToSeconds 호출
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param tempoMap - 템포 맵 (tick 오름차순 정렬)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - PPQN
 * @returns 변환된 시간 정보
 */
export function getCachedTicksToSeconds(
  startTick: number,
  durationTicks: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTime: number; duration: number } {
  // tempoMap은 배열이므로 정규화된 버전을 키에 포함
  // 템포맵이 변경되면 다른 키가 생성되므로 캐시가 자동으로 분리됨
  const normalizedTempoMap = [...tempoMap].sort((a, b) => a.tick - b.tick);
  const key = createCacheKey('ticksToSeconds', startTick, durationTicks, normalizedTempoMap, timeSignature, ppqn);
  
  return getOrCompute(ticksToSecondsCache, key, () => {
    return timingConversions.ticksToSeconds(
      startTick,
      durationTicks,
      tempoMap,
      timeSignature,
      ppqn
    );
  });
}

/**
 * 캐시된 secondsToTicks 호출
 * 
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param tempoMap - 템포 맵 (tick 오름차순 정렬)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - PPQN
 * @returns 변환된 Tick 정보
 */
export function getCachedSecondsToTicks(
  startTime: number,
  duration: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  // tempoMap은 배열이므로 정규화된 버전을 키에 포함
  const normalizedTempoMap = [...tempoMap].sort((a, b) => a.tick - b.tick);
  const key = createCacheKey('secondsToTicks', startTime, duration, normalizedTempoMap, timeSignature, ppqn);
  
  return getOrCompute(secondsToTicksCache, key, () => {
    return timingConversions.secondsToTicks(
      startTime,
      duration,
      tempoMap,
      timeSignature,
      ppqn
    );
  });
}

/**
 * 모든 캐시를 클리어합니다.
 * BPM, 타임 시그니처, PPQN 변경 시 호출됩니다.
 */
export function clearTimingCache(): void {
  measureToTicksCache.clear();
  ticksToMeasureCache.clear();
  ticksToSecondsCache.clear();
  secondsToTicksCache.clear();
}

/**
 * 캐시 통계 정보 (디버깅용)
 */
export function getCacheStats(): {
  measureToTicks: number;
  ticksToMeasure: number;
  ticksToSeconds: number;
  secondsToTicks: number;
  total: number;
} {
  return {
    measureToTicks: measureToTicksCache.size,
    ticksToMeasure: ticksToMeasureCache.size,
    ticksToSeconds: ticksToSecondsCache.size,
    secondsToTicks: secondsToTicksCache.size,
    total: measureToTicksCache.size + ticksToMeasureCache.size + ticksToSecondsCache.size + secondsToTicksCache.size,
  };
}

