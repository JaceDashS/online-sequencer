import type { Effect, MidiPart } from '../types/project';
import { getProject } from './projectState';
import { notifyProjectChange } from './projectEvents';
import { createSimpleTiming, getBpm, getTimeSignature, getPpqn } from '../utils/midiTickUtils';
import { measureToTicksPure, ticksToSecondsPure, secondsToTicksPure, ticksToMeasurePure } from '../utils/midiTickUtils';
import { updateMultipleMidiParts } from './projectStore';
import { updateNoteInMidiPart } from './actions/noteActions';
import { clearTimingCache } from '../domain/timing/timingCache';

/**
 * 프로젝트 설정 관련 액션들
 * 
 * 이 모듈은 프로젝트 레벨 설정(BPM, 타임 시그니처, 마스터 볼륨/패닝, Export 범위 등)을 담당합니다.
 * P1 리팩토링의 일부로 projectStore.ts에서 분리되었습니다.
 */

/**
 * 프로젝트의 BPM을 업데이트합니다.
 * 
 * @param bpm - 새로운 BPM 값 (Beats Per Minute)
 * 
 * @remarks
 * timing.tempoMap[0]을 업데이트합니다.
 * 모든 MIDI 파트에 변경 이벤트가 발행됩니다.
 */
export const updateBpm = (bpm: number): void => {
  const project = getProject();
  
  // timing 필드 초기화 (없으면 생성)
  if (!project.timing) {
    const timeSignature = getTimeSignature(project);
    project.timing = createSimpleTiming(bpm, timeSignature);
  } else {
    // tempoMap[0] 업데이트 (tick=0의 템포 이벤트)
    if (project.timing.tempoMap.length === 0) {
      project.timing.tempoMap.push({ tick: 0, mpqn: 60000000 / bpm });
    } else {
      project.timing.tempoMap[0].mpqn = 60000000 / bpm;
    }
  }
  
  // BPM 변경 시 시간 변환 캐시 클리어 (템포맵 변경됨)
  clearTimingCache();
  
  notifyProjectChange({ type: 'bpm' as const, bpm });
  // 미디파트 위치가 변경되었으므로 변경 이벤트 발행
  project.midiParts.forEach(part => {
    notifyProjectChange({ type: 'midiPart' as const, partId: part.id });
  });
};

/**
 * 프로젝트의 타임 시그니처를 업데이트합니다.
 * 
 * @param timeSignature - 새로운 타임 시그니처 [beatsPerMeasure, beatUnit]
 * 
 * @remarks
 * timing.timeSigMap[0]을 업데이트합니다.
 * 타임 시그니처 변경 시 모든 MIDI 파트의 위치를 마디 위치 기준으로 재조정합니다.
 */
export const updateTimeSignature = (timeSignature: [number, number]): void => {
  const project = getProject();
  
  // 이전 타임 시그니처 가져오기 (MIDI 파트 위치 재조정에 필요)
  const oldTimeSignature = getTimeSignature(project);
  const ppqn = getPpqn(project);
  
  // timing 필드 초기화 (없으면 생성)
  if (!project.timing) {
    const bpm = getBpm(project);
    project.timing = createSimpleTiming(bpm, timeSignature);
  } else {
    // timeSigMap[0] 업데이트 (tick=0의 타임 시그니처 이벤트)
    if (project.timing.timeSigMap.length === 0) {
      project.timing.timeSigMap.push({ tick: 0, num: timeSignature[0], den: timeSignature[1] });
    } else {
      project.timing.timeSigMap[0].num = timeSignature[0];
      project.timing.timeSigMap[0].den = timeSignature[1];
    }
  }
  
  // 타임 시그니처가 실제로 변경되었는지 확인
  const timeSignatureChanged = oldTimeSignature[0] !== timeSignature[0] || oldTimeSignature[1] !== timeSignature[1];
  
  // 타임 시그니처가 변경되었고 MIDI 파트가 있으면 위치를 재조정
  if (timeSignatureChanged && project.midiParts.length > 0) {
    // 모든 MIDI 파트의 위치를 마디 위치 기준으로 재조정 (소수 마디 위치 유지)
    const partUpdates: Array<{ partId: string; updates: Partial<MidiPart> }> = [];
    
    for (const part of project.midiParts) {
      // 이전 타임 시그니처를 사용하여 현재 tick 값을 마디 위치로 변환
      const { measureStart, measureDuration } = ticksToMeasurePure(
        part.startTick,
        part.durationTicks,
        oldTimeSignature,
        ppqn
      );
      
      // 마디 위치를 유지하면서 새로운 타임 시그니처로 변환 (소수 부분도 유지하여 정확한 위치 보존)
      // 파트의 길이는 최소 1마디로 보장
      const adjustedMeasureDuration = Math.max(1, measureDuration);
      
      // 새로운 타임 시그니처를 사용하여 마디 위치를 새로운 tick 값으로 변환 (소수 마디 위치 유지)
      const { startTick, durationTicks } = measureToTicksPure(
        measureStart,
        adjustedMeasureDuration,
        timeSignature,
        ppqn
      );
      
      // 파트 위치 업데이트 (마디 위치를 유지하면서 새 타임 시그니처로 변환)
      partUpdates.push({
        partId: part.id,
        updates: {
          startTick,
          durationTicks,
        },
      });
      
      // 노트들도 마디 위치 기준으로 재조정
      if (part.notes && part.notes.length > 0) {
        // 각 노트의 상대 마디 위치를 계산하여 새로운 타임 시그니처로 변환
        part.notes.forEach((note, noteIndex) => {
          // 노트의 상대 위치(파트 내부)를 마디로 변환
          // note.startTick은 파트 기준 상대 위치이므로, 파트의 길이를 기준으로 마디 위치 계산
          const { measureStart: noteMeasureStart, measureDuration: noteMeasureDuration } = ticksToMeasurePure(
            note.startTick,
            note.durationTicks,
            oldTimeSignature,
            ppqn
          );
          
          // 새로운 타임 시그니처로 변환 (마디 위치 유지)
          const { startTick: newNoteStartTick, durationTicks: newNoteDurationTicks } = measureToTicksPure(
            noteMeasureStart,
            noteMeasureDuration,
            timeSignature,
            ppqn
          );
          
          // 노트 위치 업데이트 (마디 위치를 유지하면서 새 타임 시그니처로 변환)
          // skipHistory=true로 설정하여 노트 업데이트는 히스토리에 기록하지 않음 (파트 레벨 히스토리에서 관리)
          updateNoteInMidiPart(part.id, noteIndex, {
            startTick: newNoteStartTick,
            durationTicks: newNoteDurationTicks,
          }, true); // skipHistory=true
        });
      }
    }
    
    // 모든 파트를 한 번에 업데이트 (히스토리에 하나의 액션으로 기록)
    if (partUpdates.length > 0) {
      updateMultipleMidiParts(partUpdates, false); // 히스토리 기록
    }
  }
  
  // 타임 시그니처 변경 시 시간 변환 캐시 클리어 (타임 시그니처 변경됨)
  if (timeSignatureChanged) {
    clearTimingCache();
  }
  
  // 타임 시그니처 변경 알림 (UI 업데이트를 위해 필수)
  notifyProjectChange({ type: 'timeSignature' as const, timeSignature });
};

/**
 * 마스터 볼륨을 업데이트합니다.
 * 
 * @param volume - 새로운 마스터 볼륨 값 (0.0 ~ 1.0)
 */
export const updateMasterVolume = (volume: number): void => {
  const project = getProject();
  project.masterVolume = volume;
  notifyProjectChange({ type: 'master' as const, changes: { volume } });
};

/**
 * 마스터 패닝을 업데이트합니다.
 * 
 * @param pan - 새로운 마스터 패닝 값 (-1.0 ~ 1.0)
 */
export const updateMasterPan = (pan: number): void => {
  const project = getProject();
  project.masterPan = pan;
  notifyProjectChange({ type: 'master' as const, changes: { pan } });
};


/**
 * 마스터에 이펙터 추가
 */
export const addEffectToMaster = (effect: Effect): void => {
  const project = getProject();
  if (!project.masterEffects) {
    project.masterEffects = [];
  }
  project.masterEffects.push(effect);
  notifyProjectChange({ type: 'master' as const, changes: { effects: project.masterEffects } });
};

/**
 * 마스터에서 이펙터 제거
 */
export const removeEffectFromMaster = (effectIndex: number): void => {
  const project = getProject();
  if (project.masterEffects && effectIndex >= 0 && effectIndex < project.masterEffects.length) {
    project.masterEffects.splice(effectIndex, 1);
    notifyProjectChange({ type: 'master' as const, changes: { effects: project.masterEffects } });
  }
};

/**
 * 마스터의 이펙터 업데이트
 */
export const updateEffectInMaster = (effectIndex: number, updates: Partial<Effect>): void => {
  const project = getProject();
  if (project.masterEffects && effectIndex >= 0 && effectIndex < project.masterEffects.length) {
    Object.assign(project.masterEffects[effectIndex], updates);
    notifyProjectChange({ type: 'master' as const, changes: { effects: project.masterEffects } });
  }
};

/**
 * 마스터의 이펙터 순서 변경
 */
export const reorderEffectsInMaster = (fromIndex: number, toIndex: number): void => {
  const project = getProject();
  if (project.masterEffects && fromIndex >= 0 && fromIndex < project.masterEffects.length && toIndex >= 0 && toIndex < project.masterEffects.length) {
    const [movedEffect] = project.masterEffects.splice(fromIndex, 1);
    project.masterEffects.splice(toIndex, 0, movedEffect);
    notifyProjectChange({ type: 'master' as const, changes: { effects: project.masterEffects } });
  }
};

/**
 * 마디 기반 정보를 시간(초)으로 변환합니다.
 * 내부적으로 Tick 변환을 사용합니다 (SMF 표준 정합, 호환성 레이어).
 */
export const measureToTime = (measureStart: number, measureDuration: number, _bpm: number, _timeSignature: [number, number]): { startTime: number; duration: number } => {
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqn(project);
  const { startTick, durationTicks } = measureToTicksPure(measureStart, measureDuration, timeSignature, ppqn);
  const tempoMap = project.timing?.tempoMap ?? [];
  return ticksToSecondsPure(startTick, durationTicks, tempoMap, timeSignature, ppqn);
};

/**
 * 시간(초)을 마디 기반 정보로 변환합니다.
 * 내부적으로 Tick 변환을 사용합니다 (SMF 표준 정합, 호환성 레이어).
 */
export const timeToMeasure = (startTime: number, duration: number, _bpm: number, _timeSignature: [number, number]): { measureStart: number; measureDuration: number } => {
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqn(project);
  const tempoMap = project.timing?.tempoMap ?? [];
  const { startTick, durationTicks } = secondsToTicksPure(startTime, duration, tempoMap, timeSignature, ppqn);
  return ticksToMeasurePure(startTick, durationTicks, timeSignature, ppqn);
};

/**
 * Export 범위(로케이터)를 설정합니다 (마디 기준).
 * 
 * @param measureStart - 시작 마디 위치 (null이면 범위 해제)
 * @param measureEnd - 끝 마디 위치 (null이면 범위 해제)
 */
export const setExportRangeMeasure = (measureStart: number | null, measureEnd: number | null): void => {
  const project = getProject();
  project.exportRangeMeasureStart = measureStart;
  project.exportRangeMeasureEnd = measureEnd;
  notifyProjectChange({ type: 'timeSignature' as const, timeSignature: getTimeSignature(project) });
};

/**
 * Export 범위(로케이터)를 가져옵니다 (마디 기준).
 * 
 * @returns Export 범위 { measureStart, measureEnd } (null이면 범위 미설정)
 */
export const getExportRangeMeasure = (): { measureStart: number | null; measureEnd: number | null } => {
  const project = getProject();
  return {
    measureStart: project.exportRangeMeasureStart ?? null,
    measureEnd: project.exportRangeMeasureEnd ?? null,
  };
};

