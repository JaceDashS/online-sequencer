/**
 * MIDI Tick 변환 유틸리티 함수 (호환성 래퍼)
 * 마디, 초, Tick 간의 변환을 수행합니다.
 * 
 * @remarks
 * - 이 파일은 Phase 3 리팩토링의 호환성 래퍼입니다.
 * - 내부적으로 domain/timing의 순수 함수를 사용합니다.
 * - 전역 프로젝트에서 타이밍 정보를 자동으로 가져와 순수 함수에 전달합니다.
 * - 새로운 코드는 domain/timing의 순수 함수를 직접 사용하는 것을 권장합니다.
 * 
 * @deprecated 새로운 코드는 domain/timing의 순수 함수를 직접 사용하세요.
 */

import { MIDI_CONSTANTS } from '../constants/midi';
import type { MidiNote, MidiPart, Project, TempoEvent, TimeSigEvent, MidiProjectTiming, Tick } from '../types/project';
import { getProject } from '../store/projectStore';
import * as timingConversions from '../domain/timing/timingConversions';
import { 
  getBpm as getBpmFromTiming, 
  getTimeSignature as getTimeSignatureFromTiming, 
  getPpqn as getPpqnFromTiming, 
  createSimpleTiming as createTiming 
} from '../domain/timing/timingUtils';
import {
  getCachedMeasureToTicks,
  getCachedTicksToMeasure,
  getCachedTicksToSeconds,
  getCachedSecondsToTicks
} from '../domain/timing/timingCache';

// ============================================================================
// 순수 함수 버전 (모든 파라미터 필수, getProject() 의존성 없음)
// ============================================================================

/**
 * 마디 → Tick 변환 (순수 함수 버전)
 * 
 * @param measureStart - 시작 마디 위치 (정수 부분 = 마디 번호, 소수 부분 = 마디 내 위치 비율)
 * @param measureDuration - 마디 단위 길이 (소수 가능)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (필수)
 * @param ppqn - Pulses Per Quarter Note (필수)
 * @returns 변환된 Tick 정보 { startTick: Tick, durationTicks: Tick }
 * 
 * @remarks
 * - 전역 프로젝트 상태에 의존하지 않는 순수 함수입니다.
 * - 모든 파라미터를 명시적으로 제공해야 합니다.
 * - 내부적으로 domain/timing/timingConversions.measureToTicks를 사용합니다.
 * 
 * @example
 * ```ts
 * // 4/4 박자, PPQN=480에서 2.5 마디 위치, 1 마디 길이
 * const { startTick, durationTicks } = measureToTicksPure(2.5, 1.0, [4, 4], 480);
 * // startTick: 4800, durationTicks: 1920
 * ```
 */
export function measureToTicksPure(
  measureStart: number,
  measureDuration: number,
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  // 캐시된 버전 사용 (P2 성능 개선)
  return getCachedMeasureToTicks(
    measureStart,
    measureDuration,
    timeSignature,
    ppqn
  );
}

/**
 * Tick → 마디 변환 (순수 함수 버전)
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (필수)
 * @param ppqn - Pulses Per Quarter Note (필수)
 * @returns 변환된 마디 정보 { measureStart: 마디, measureDuration: 마디 }
 * 
 * @remarks
 * - 전역 프로젝트 상태에 의존하지 않는 순수 함수입니다.
 * - 모든 파라미터를 명시적으로 제공해야 합니다.
 * - 내부적으로 domain/timing/timingConversions.ticksToMeasure를 사용합니다.
 * - BPM 독립적: 마디는 박자 구조에만 의존하며 재생 속도(BPM)와 무관합니다.
 * 
 * @example
 * ```ts
 * // 4/4 박자, PPQN=480에서 4800 tick 위치, 1920 tick 길이
 * const { measureStart, measureDuration } = ticksToMeasurePure(4800, 1920, [4, 4], 480);
 * // measureStart: 2.5, measureDuration: 1.0
 * ```
 */
export function ticksToMeasurePure(
  startTick: number,
  durationTicks: number,
  timeSignature: [number, number],
  ppqn: number
): { measureStart: number; measureDuration: number } {
  // 캐시된 버전 사용 (P2 성능 개선)
  return getCachedTicksToMeasure(
    startTick,
    durationTicks,
    timeSignature,
    ppqn
  );
}

/**
 * 초 → Tick 변환 (순수 함수 버전)
 * 
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param tempoMap - 템포 맵 (필수)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (필수)
 * @param ppqn - Pulses Per Quarter Note (필수)
 * @returns 변환된 Tick 정보 { startTick: Tick, durationTicks: Tick }
 * 
 * @remarks
 * - 전역 프로젝트 상태에 의존하지 않는 순수 함수입니다.
 * - 모든 파라미터를 명시적으로 제공해야 합니다.
 * - 내부적으로 domain/timing/timingConversions.secondsToTicks를 사용합니다.
 * - SMF 표준 정합: 템포맵을 사용하여 변속(tempo change)을 정확히 처리
 * 
 * @example
 * ```ts
 * // 템포맵 기반 변환
 * const tempoMap: TempoEvent[] = [{ tick: 0, mpqn: 500000 }]; // 120 BPM
 * const { startTick, durationTicks } = secondsToTicksPure(5.0, 2.0, tempoMap, [4, 4], 480);
 * ```
 */
export function secondsToTicksPure(
  startTime: number,
  duration: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTick: number; durationTicks: number } {
  // 캐시된 버전 사용 (P2 성능 개선)
  return getCachedSecondsToTicks(
    startTime,
    duration,
    tempoMap,
    timeSignature,
    ppqn
  );
}

/**
 * Tick → 초 변환 (순수 함수 버전)
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param tempoMap - 템포 맵 (필수)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (필수)
 * @param ppqn - Pulses Per Quarter Note (필수)
 * @returns 변환된 시간 정보 { startTime: 초, duration: 초 }
 * 
 * @remarks
 * - 전역 프로젝트 상태에 의존하지 않는 순수 함수입니다.
 * - 모든 파라미터를 명시적으로 제공해야 합니다.
 * - 내부적으로 domain/timing/timingConversions.ticksToSeconds를 사용합니다.
 * - SMF 표준 정합: 템포맵을 사용하여 변속(tempo change)을 정확히 처리
 * 
 * @example
 * ```ts
 * // 템포맵 기반 변환
 * const tempoMap: TempoEvent[] = [{ tick: 0, mpqn: 500000 }]; // 120 BPM
 * const { startTime, duration } = ticksToSecondsPure(4800, 1920, tempoMap, [4, 4], 480);
 * ```
 */
export function ticksToSecondsPure(
  startTick: number,
  durationTicks: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number
): { startTime: number; duration: number } {
  // 캐시된 버전 사용 (P2 성능 개선)
  return getCachedTicksToSeconds(
    startTick,
    durationTicks,
    tempoMap,
    timeSignature,
    ppqn
  );
}

// ============================================================================
// 호환성 래퍼 함수 (기존 코드와의 호환성을 위해 유지, @deprecated)
// ============================================================================

/**
 * 마디 → Tick 변환 (호환성 래퍼)
 * 
 * @param measureStart - 시작 마디 위치 (정수 부분 = 마디 번호, 소수 부분 = 마디 내 위치 비율)
 * @param measureDuration - 마디 단위 길이 (소수 가능)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (옵셔널, 기본값: 프로젝트의 timeSignature)
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @returns 변환된 Tick 정보 { startTick: Tick, durationTicks: Tick }
 * 
 * @deprecated 새로운 코드는 `measureToTicksPure`를 사용하거나 `domain/timing/timingConversions.measureToTicks`를 직접 사용하세요.
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingConversions.measureToTicks를 사용합니다.
 * - timeSignature가 제공되지 않으면 전역 프로젝트의 timeSignature를 사용합니다.
 * - 이 함수는 전역 프로젝트 상태에 의존하므로 순수 함수가 아닙니다.
 * 
 * @example
 * ```ts
 * // 4/4 박자, PPQN=480에서 2.5 마디 위치, 1 마디 길이
 * const { startTick, durationTicks } = measureToTicks(2.5, 1.0);
 * // startTick: 4800, durationTicks: 1920
 * ```
 */
export function measureToTicks(
  measureStart: number,
  measureDuration: number,
  timeSignature?: [number, number],
  ppqn?: number
): { startTick: number; durationTicks: number } {
  // timeSignature와 ppqn이 제공되지 않으면 전역 프로젝트에서 가져옴
  const project = getProject();
  const effectiveTimeSignature = timeSignature || getTimeSignatureFromTiming(project);
  const effectivePpqn = ppqn ?? getPpqnFromTiming(project);
  
  // domain/timing의 순수 함수 호출
  return timingConversions.measureToTicks(
    measureStart,
    measureDuration,
    effectiveTimeSignature,
    effectivePpqn
  );
}

/**
 * Tick → 마디 변환 (호환성 래퍼)
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (옵셔널, 기본값: 프로젝트의 timeSignature)
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @returns 변환된 마디 정보 { measureStart: 마디, measureDuration: 마디 }
 * 
 * @deprecated 새로운 코드는 `ticksToMeasurePure`를 사용하거나 `domain/timing/timingConversions.ticksToMeasure`를 직접 사용하세요.
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingConversions.ticksToMeasure를 사용합니다.
 * - BPM 독립적: 마디는 박자 구조에만 의존하며 재생 속도(BPM)와 무관합니다.
 * - 이 함수는 전역 프로젝트 상태에 의존하므로 순수 함수가 아닙니다.
 * 
 * @example
 * ```ts
 * // 4/4 박자, PPQN=480에서 4800 tick 위치, 1920 tick 길이
 * const { measureStart, measureDuration } = ticksToMeasure(4800, 1920);
 * // measureStart: 2.5, measureDuration: 1.0
 * ```
 */
export function ticksToMeasure(
  startTick: number,
  durationTicks: number,
  timeSignature?: [number, number],
  ppqn?: number
): { measureStart: number; measureDuration: number } {
  // timeSignature와 ppqn이 제공되지 않으면 전역 프로젝트에서 가져옴
  const project = getProject();
  const effectiveTimeSignature = timeSignature || getTimeSignatureFromTiming(project);
  const effectivePpqn = ppqn ?? getPpqnFromTiming(project);
  
  // domain/timing의 순수 함수 호출
  return timingConversions.ticksToMeasure(
    startTick,
    durationTicks,
    effectiveTimeSignature,
    effectivePpqn
  );
}

/**
 * 초 → Tick 변환 (호환성 래퍼)
 * 
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param bpm - BPM (Beats Per Minute) (옵셔널, 마이그레이션용, 템포맵이 없을 때만 사용)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (옵셔널, 기본값: 프로젝트의 timeSignature)
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @param tempoMap - 템포 맵 (옵셔널, 제공되지 않으면 프로젝트에서 가져옴)
 * @returns 변환된 Tick 정보 { startTick: Tick, durationTicks: Tick }
 * 
 * @deprecated 새로운 코드는 `secondsToTicksPure`를 사용하거나 `domain/timing/timingConversions.secondsToTicks`를 직접 사용하세요.
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingConversions.secondsToTicks를 사용합니다.
 * - SMF 표준 정합: 템포맵을 사용하여 변속(tempo change)을 정확히 처리
 * - 템포맵이 있으면 템포맵 기반으로 계산, 없으면 단일 BPM 사용 (하위 호환성)
 * - 이 함수는 전역 프로젝트 상태에 의존하므로 순수 함수가 아닙니다.
 * 
 * @example
 * ```ts
 * // 템포맵 기반 변환 (권장)
 * const { startTick, durationTicks } = secondsToTicks(5.0, 2.0);
 * 
 * // 레거시: 단일 BPM 사용 (템포맵이 없을 때)
 * const { startTick, durationTicks } = secondsToTicks(5.0, 2.0, 120);
 * ```
 */
export function secondsToTicks(
  startTime: number,
  duration: number,
  bpm?: number,
  timeSignature?: [number, number],
  ppqn?: number,
  tempoMap?: TempoEvent[]
): { startTick: number; durationTicks: number } {
  const project = getProject();
  const effectiveTimeSignature = timeSignature || getTimeSignature(project);
  const effectivePpqn = ppqn ?? getPpqn(project);
  
  // 템포맵이 제공되지 않으면 프로젝트에서 가져옴
  const effectiveTempoMap = tempoMap ?? (project.timing?.tempoMap ?? []);
  
  // 템포맵이 있으면 템포맵 기반으로 계산
  if (effectiveTempoMap.length > 0) {
    return timingConversions.secondsToTicks(
      startTime,
      duration,
      effectiveTempoMap,
      effectiveTimeSignature,
      effectivePpqn
    );
  }
  
  // 템포맵이 없으면 단일 BPM 사용 (하위 호환성)
  // 단일 BPM의 경우 간단한 템포맵 생성
  const effectiveBpm = bpm ?? getBpmFromTiming(project);
  const simpleTempoMap: TempoEvent[] = [{ tick: 0, mpqn: timingConversions.bpmToMpqn(effectiveBpm) }];
  
  return timingConversions.secondsToTicks(
    startTime,
    duration,
    simpleTempoMap,
    effectiveTimeSignature,
    effectivePpqn
  );
}


/**
 * Tick → 초 변환 (호환성 래퍼)
 * 
 * @param startTick - 시작 Tick 위치
 * @param durationTicks - Tick 단위 길이
 * @param bpm - BPM (Beats Per Minute) (옵셔널, 마이그레이션용, 템포맵이 없을 때만 사용)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (옵셔널, 기본값: 프로젝트의 timeSignature)
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @param tempoMap - 템포 맵 (옵셔널, 제공되지 않으면 프로젝트에서 가져옴)
 * @returns 변환된 시간 정보 { startTime: 초, duration: 초 }
 * 
 * @deprecated 새로운 코드는 `ticksToSecondsPure`를 사용하거나 `domain/timing/timingConversions.ticksToSeconds`를 직접 사용하세요.
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingConversions.ticksToSeconds를 사용합니다.
 * - SMF 표준 정합: 템포맵을 사용하여 변속(tempo change)을 정확히 처리
 * - 템포맵이 있으면 템포맵 기반으로 계산, 없으면 단일 BPM 사용 (하위 호환성)
 * - 이 함수는 전역 프로젝트 상태에 의존하므로 순수 함수가 아닙니다.
 * 
 * @example
 * ```ts
 * // 템포맵 기반 변환 (권장)
 * const { startTime, duration } = ticksToSeconds(4800, 1920);
 * 
 * // 레거시: 단일 BPM 사용 (템포맵이 없을 때)
 * const { startTime, duration } = ticksToSeconds(4800, 1920, 120);
 * ```
 */
export function ticksToSeconds(
  startTick: number,
  durationTicks: number,
  bpm?: number,
  timeSignature?: [number, number],
  ppqn?: number,
  tempoMap?: TempoEvent[]
): { startTime: number; duration: number } {
  const project = getProject();
  const effectiveTimeSignature = timeSignature || getTimeSignature(project);
  const effectivePpqn = ppqn ?? getPpqn(project);
  
  // 템포맵이 제공되지 않으면 프로젝트에서 가져옴
  const effectiveTempoMap = tempoMap ?? (project.timing?.tempoMap ?? []);
  
  // 템포맵이 있으면 템포맵 기반으로 계산
  if (effectiveTempoMap.length > 0) {
    return timingConversions.ticksToSeconds(
      startTick,
      durationTicks,
      effectiveTempoMap,
      effectiveTimeSignature,
      effectivePpqn
    );
  }
  
  // 템포맵이 없으면 단일 BPM 사용 (하위 호환성)
  // 단일 BPM의 경우 간단한 템포맵 생성
  const effectiveBpm = bpm ?? getBpmFromTiming(project);
  const simpleTempoMap: TempoEvent[] = [{ tick: 0, mpqn: timingConversions.bpmToMpqn(effectiveBpm) }];
  
  return timingConversions.ticksToSeconds(
    startTick,
    durationTicks,
    simpleTempoMap,
    effectiveTimeSignature,
    effectivePpqn
  );
}

/**
 * 기존 measureStart/measureDuration → startTick/durationTicks 변환 (마이그레이션용)
 * 
 * 이 함수는 레거시 프로젝트 로드 시에만 사용됩니다.
 * 새로운 노트는 이미 startTick/durationTicks를 가지고 있어야 합니다.
 * 
 * @param note - 변환할 MIDI 노트 (measureStart/measureDuration 포함, 레거시)
 * @param part - 노트가 속한 MIDI 파트 (현재는 사용하지 않지만 타입 일관성을 위해 유지)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] (옵셔널, 기본값: 프로젝트의 timeSignature)
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @returns 변환된 MIDI 노트 (startTick/durationTicks만 포함, measure 필드 제거)
 * 
 * @remarks
 * - SSOT: timeSignature는 전역 프로젝트에서 자동으로 가져옵니다.
 * - BPM 독립적: 마디 → Tick 변환은 BPM과 무관합니다.
 * - 주의: 마이그레이션 시에는 프로젝트가 아직 설정되지 않았을 수 있으므로 timeSignature를 파라미터로 전달 가능합니다.
 * 
 * @example
 * ```ts
 * // 레거시 노트 (마이그레이션 필요)
 * const legacyNote = { note: 60, velocity: 100, measureStart: 0.5, measureDuration: 1.0 };
 * const part = { id: 'part1', trackId: 'track1', startTick: 1920, durationTicks: 7680, notes: [] };
 * // 전역 프로젝트의 timeSignature 사용 (SSOT)
 * const migratedNote = migrateNoteToTicks(legacyNote, part);
 * // migratedNote.startTick = 960, migratedNote.durationTicks = 1920
 * // migratedNote.measureStart, migratedNote.measureDuration은 제거됨
 * 
 * // 마이그레이션 중: 프로젝트가 아직 설정되지 않은 경우
 * const migratedNote = migrateNoteToTicks(legacyNote, part, [4, 4]);
 * ```
 */
export function migrateNoteToTicks(
  note: any, // 레거시 노트는 measure 필드를 가질 수 있음
  _part: MidiPart,
  timeSignature?: [number, number], // 옵셔널, 기본값: 프로젝트의 timeSignature (SSOT)
  ppqn: number = MIDI_CONSTANTS.PPQN
): MidiNote {
  // 이미 Tick 필드가 있으면 그대로 사용 (channel, releaseVelocity도 보존)
  if (note.startTick !== undefined && note.durationTicks !== undefined) {
    return {
      note: note.note,
      velocity: note.velocity,
      channel: note.channel, // SMF 표준 준수: 채널 정보 보존
      releaseVelocity: note.releaseVelocity, // SMF 표준 준수: 릴리즈 벨로시티 보존
      startTick: note.startTick,
      durationTicks: note.durationTicks,
    };
  }
  
  // 레거시: measureStart/measureDuration을 Tick으로 변환
  if (note.measureStart !== undefined && note.measureDuration !== undefined) {
    const { startTick, durationTicks } = measureToTicks(
      note.measureStart,
      note.measureDuration,
      timeSignature, // BPM 파라미터 제거
      ppqn
    );
    
    return {
      note: note.note,
      velocity: note.velocity,
      channel: note.channel, // SMF 표준 준수: 채널 정보 보존 (레거시 노트에도 있을 수 있음)
      releaseVelocity: note.releaseVelocity, // SMF 표준 준수: 릴리즈 벨로시티 보존 (레거시 노트에도 있을 수 있음)
      startTick,
      durationTicks,
      // measure 필드는 제거 (SMF 표준 정합)
    };
  }
  
  throw new Error('Note must have either startTick/durationTicks or measureStart/measureDuration');
}

/**
 * 프로젝트 데이터 마이그레이션
 * 기존 measureStart/measureDuration 기반 프로젝트를 Tick 기반으로 변환합니다.
 * 
 * @param project - 변환할 프로젝트
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @returns 변환된 프로젝트 (모든 노트가 startTick/durationTicks 포함)
 * 
 * @remarks
 * - 버전 1: measureStart/measureDuration만 사용 (레거시)
 * - 버전 2: startTick/durationTicks 추가 (현재 버전)
 * - measureStart/measureDuration 필드는 하위 호환성을 위해 optional로 유지
 * 
 * @example
 * ```ts
 * const oldProject = { bpm: 120, timeSignature: [4, 4], ... };
 * const migratedProject = migrateProjectToTicks(oldProject);
 * // 모든 노트에 startTick/durationTicks 추가됨
 * ```
 */
export function migrateProjectToTicks(
  project: Project,
  ppqn: number = MIDI_CONSTANTS.PPQN
): Project {
  // 레거시 프로젝트에서 bpm, timeSignature 제거를 위한 타입 단언
  const legacyProject = project as Project & { bpm?: number; timeSignature?: [number, number] };
  const { bpm, timeSignature, midiParts, ...rest } = legacyProject;
  
  // 모든 MIDI 파트의 노트를 Tick 기반으로 변환
  const migratedParts: MidiPart[] = midiParts.map((part) => {
    const migratedNotes: MidiNote[] = part.notes.map((note: any) => {
      // 이미 Tick 필드가 있으면 그대로 사용 (measure 필드 제거, channel/releaseVelocity 보존)
      if (note.startTick !== undefined && note.durationTicks !== undefined) {
        return {
          note: note.note,
          velocity: note.velocity,
          channel: note.channel, // SMF 표준 준수: 채널 정보 보존
          releaseVelocity: note.releaseVelocity, // SMF 표준 준수: 릴리즈 벨로시티 보존
          startTick: note.startTick,
          durationTicks: note.durationTicks,
        };
      }
      
      // 레거시: measureStart/measureDuration이 있으면 Tick으로 변환
      // SSOT: timeSignature는 프로젝트에서 가져오므로 명시적으로 전달하지 않아도 됨
      // 하지만 마이그레이션 중에는 프로젝트가 아직 설정되지 않았을 수 있으므로 명시적으로 전달 가능
      // BPM은 measureToTicks에서 사용하지 않으므로 제거됨
      if (note.measureStart !== undefined && note.measureDuration !== undefined) {
        return migrateNoteToTicks(note, part, timeSignature, ppqn);
      }
      
      // 둘 다 없으면 에러
      throw new Error(`Note missing both Tick and measure fields: ${JSON.stringify(note)}`);
    });
    
    return {
      ...part,
      notes: migratedNotes,
      controlChanges: Array.isArray(part.controlChanges)
        ? part.controlChanges.map((cc: any) => ({ ...cc }))
        : undefined,
    };
  });
  
  return {
    ...rest,
    midiParts: migratedParts,
    version: 2, // 마이그레이션 후 버전 2로 설정
  };
}

/**
 * 프로젝트 버전 확인 및 마이그레이션 필요 여부 체크
 * 
 * @param project - 확인할 프로젝트
 * @returns 마이그레이션이 필요한지 여부
 */
export function needsMigration(project: Project): boolean {
  // 버전이 없거나 1이면 마이그레이션 필요
  const version = project.version ?? 1;
  return version < 2;
}

/**
 * 레거시 MidiPart를 Tick 기반으로 변환
 * 레거시 프로젝트 로드 시에만 사용
 * 
 * @param part - 레거시 part (measureStart/measureDuration 포함)
 * @param timing - 프로젝트 타이밍 정보
 * @returns Tick 기반 MidiPart
 */
export function migrateLegacyPartToTickPart(
  part: any, // 레거시 part (measureStart/measureDuration 포함)
  timing: MidiProjectTiming
): MidiPart {
  // 이미 Tick 필드가 있으면 그대로 사용 (레거시 필드는 제거)
  if (part.startTick !== undefined && part.durationTicks !== undefined) {
    return {
      id: part.id,
      trackId: part.trackId,
      startTick: part.startTick,
      durationTicks: part.durationTicks,
      notes: part.notes ?? [],
      controlChanges: Array.isArray(part.controlChanges)
        ? part.controlChanges.map((cc: any) => ({ ...cc }))
        : undefined,
      historyIndex: part.historyIndex,
    };
  }
  
  // 레거시: measureStart/measureDuration -> (bar/beat 기반) tick 변환
  if (part.measureStart !== undefined && part.measureDuration !== undefined) {
    const timeSig = getTimeSigAtTick(timing.timeSigMap, 0); // 초기 타임 시그니처 사용
    const timeSignature: [number, number] = [timeSig.num, timeSig.den];
    
    const { startTick, durationTicks } = measureToTicks(
      part.measureStart,
      part.measureDuration,
      timeSignature,
      timing.ppqn
    );
    
    return {
      id: part.id,
      trackId: part.trackId,
      startTick,
      durationTicks,
      notes: part.notes ?? [],
      controlChanges: Array.isArray(part.controlChanges)
        ? part.controlChanges.map((cc: any) => ({ ...cc }))
        : undefined,
      historyIndex: part.historyIndex,
    };
  }
  
  throw new Error('Invalid legacy part: must have either startTick/durationTicks or measureStart/measureDuration');
}

/**
 * Timing Map 유틸리티 함수들
 * SMF 표준 정합을 위한 타이밍 맵 관리
 */

/**
 * BPM을 MPQN (Microseconds Per Quarter Note)로 변환 (호환성 래퍼)
 * 
 * @param bpm - BPM (Beats Per Minute)
 * @returns MPQN (Microseconds Per Quarter Note)
 */
export function bpmToMpqn(bpm: number): number {
  return timingConversions.bpmToMpqn(bpm);
}

/**
 * MPQN (Microseconds Per Quarter Note)를 BPM으로 변환 (호환성 래퍼)
 * 
 * @param mpqn - MPQN (Microseconds Per Quarter Note)
 * @returns BPM (Beats Per Minute)
 */
export function mpqnToBpm(mpqn: number): number {
  return timingConversions.mpqnToBpm(mpqn);
}

/**
 * 현재 tick에서의 템포 이벤트 조회 (호환성 래퍼)
 * 
 * @param tempoMap - 템포 맵 (tick 오름차순 정렬)
 * @param tick - 조회할 Tick 위치
 * @returns 해당 tick에서 유효한 TempoEvent
 */
export function getTempoAtTick(tempoMap: TempoEvent[], tick: Tick): TempoEvent {
  return timingConversions.getTempoAtTick(tempoMap, tick);
}

/**
 * 현재 tick에서의 타임 시그니처 이벤트 조회 (호환성 래퍼)
 * 
 * @param timeSigMap - 타임 시그니처 맵 (tick 오름차순 정렬)
 * @param tick - 조회할 Tick 위치
 * @returns 해당 tick에서 유효한 TimeSigEvent
 */
export function getTimeSigAtTick(timeSigMap: TimeSigEvent[], tick: Tick): TimeSigEvent {
  return timingConversions.getTimeSigAtTick(timeSigMap, tick);
}

/**
 * 단일 BPM/TimeSignature를 Timing Map으로 변환 (호환성 래퍼)
 * 
 * @param bpm - BPM (Beats Per Minute)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note (기본값: MIDI_CONSTANTS.PPQN)
 * @returns MidiProjectTiming 객체
 */
export function createSimpleTiming(
  bpm: number,
  timeSignature: [number, number],
  ppqn: number = MIDI_CONSTANTS.PPQN
): MidiProjectTiming {
  // domain/timing/timingUtils의 함수 사용
  return createTiming(bpm, timeSignature, ppqn);
}

/**
 * 프로젝트에서 BPM을 가져옵니다 (하위 호환성 헬퍼)
 * timing.tempoMap[0]에서 계산하거나, 레거시 프로젝트의 bpm 필드 사용 (마이그레이션용)
 * 
 * @param project - 프로젝트 객체
 * @returns BPM 값
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingUtils.getBpm을 사용합니다.
 */
export function getBpm(project: Project): number {
  return getBpmFromTiming(project);
}

/**
 * 프로젝트에서 TimeSignature를 가져옵니다 (하위 호환성 헬퍼)
 * timing.timeSigMap[0]에서 계산하거나, 레거시 프로젝트의 timeSignature 필드 사용 (마이그레이션용)
 * 
 * @param project - 프로젝트 객체
 * @returns TimeSignature [beatsPerMeasure, beatUnit]
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingUtils.getTimeSignature를 사용합니다.
 */
export function getTimeSignature(project: Project): [number, number] {
  return getTimeSignatureFromTiming(project);
}

/**
 * 프로젝트에서 PPQN을 가져옵니다
 * timing.ppqn 또는 기본값 사용
 * 
 * @param project - 프로젝트 객체
 * @returns PPQN 값
 * 
 * @remarks
 * - 내부적으로 domain/timing/timingUtils.getPpqn을 사용합니다.
 */
export function getPpqn(project: Project): number {
  return getPpqnFromTiming(project);
}
