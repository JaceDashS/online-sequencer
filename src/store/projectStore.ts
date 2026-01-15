import type { Effect, MidiPart, LegacyPart } from '../types/project';
import {
  getMidiPartHistory,
  restoreNotesFromHistoryIndex,
  type MidiPartHistoryAction
} from './history/noteHistory';
import {
  addPartLevelHistoryEntry,
  setFlushPendingHistoryCallback
} from './history/partHistory';
import {
  undoNoteLevel,
  redoNoteLevel,
  undoPartLevel,
  redoPartLevel
} from './history/history';
import { 
  measureToTicksPure,
  ticksToMeasurePure,
  secondsToTicksPure,
  ticksToSecondsPure,
  createSimpleTiming,
  getBpm,
  getTimeSignature
} from '../utils/midiTickUtils';
import { 
  getPpqn as getPpqnFromTiming
} from '../domain/timing/timingUtils';
import { addMidiPart, removeMidiPart, findMidiPart } from './midiPartActions';
import { getProject } from './projectState';
import { notifyProjectChange } from './projectEvents';



// 초기 프로젝트 상태
// initialProject는 projectState.ts로 이동되었습니다.
// getProject()와 setProject()를 사용하세요.

// 히스토리 관련 타입과 함수는 history/ 디렉토리로 이동됨
// 타입 재export
export type { MidiPartHistoryAction, MidiPartHistory } from './history/noteHistory';
export type { MidiPartLevelAction, MidiPartLevelHistory } from './history/partHistory';


/**
 * 프로젝트 변경 이벤트 타입 (Discriminated Union)
 * Publisher-Subscriber 패턴을 사용하여 프로젝트 변경을 구독자에게 알립니다.
 */
export type ProjectChangeEvent = 
  | { type: 'bpm'; bpm: number }
  | { type: 'timeSignature'; timeSignature: [number, number] }
  | { type: 'master'; changes: { volume?: number; pan?: number; effects?: Effect[] } }
  | { type: 'track'; trackId?: string }
  | { type: 'midiPart'; partId?: string };

export { subscribeToTrackChanges, subscribeToProjectChanges } from './projectEvents';

// ============================================================================
// 트랙 관련 함수들 (trackActions.ts로 이동됨)
// ============================================================================
// P1 리팩토링: 트랙 관련 액션들을 trackActions.ts로 분리
// 아래 함수들은 trackActions.ts에서 re-export됩니다.
export {
  addTrack,
  removeTrack,
  updateTrack,
  findTrack,
  assertTrack,
  addEffectToTrack,
  removeEffectFromTrack,
  updateEffectInTrack,
  reorderEffectsInTrack
} from './actions/trackActions';
export type { TrackChangeEvent } from './actions/trackActions';

// ============================================================================
// 프로젝트 설정 관련 함수들 (projectActions.ts로 이동됨)
// ============================================================================
// P1 리팩토링: 프로젝트 설정 액션들을 projectActions.ts로 통합
// 아래 함수들은 projectActions.ts에서 re-export됩니다.
export {
  updateBpm,
  updateTimeSignature,
  updateMasterVolume,
  updateMasterPan,
  setExportRangeMeasure,
  getExportRangeMeasure,
  addEffectToMaster,
  removeEffectFromMaster,
  updateEffectInMaster,
  reorderEffectsInMaster
} from './projectActions';

// getProject와 setProject는 projectState.ts로 이동되었습니다.
export { getProject, setProject } from './projectState';

// findMidiPart는 midiPartActions.ts에서 re-export됩니다.

/**
 * 파트가 존재하는지 확인하고 타입을 단언합니다.
 * 파트가 없으면 에러를 던집니다.
 * 
 * @param part - 확인할 파트 (undefined일 수 있음)
 * @param partId - 에러 메시지에 포함할 파트 ID (선택)
 * @throws {Error} 파트가 없을 경우
 */
export function assertPart(part: MidiPart | undefined, partId?: string): asserts part is MidiPart {
  if (!part) {
    throw new Error(`Part not found${partId ? `: ${partId}` : ''}`);
  }
}






// 트랙 이펙터 관련 함수들은 trackActions.ts에서 re-export됩니다.
// 마스터 이펙터 관련 함수들은 projectActions.ts에서 re-export됩니다.

/**
 * 마디 기반 정보를 시간(초)으로 변환합니다.
 * 내부적으로 Tick 변환을 사용합니다 (SMF 표준 정합, 호환성 레이어).
 * 
 * @param measureStart - 시작 마디 위치 (정수 부분 = 마디 번호, 소수 부분 = 마디 내 위치 비율)
 * @param measureDuration - 마디 단위 길이 (소수 가능)
 * @param bpm - BPM (Beats Per Minute) - 하위 호환성을 위해 유지되지만 사용되지 않음 (SSOT: 전역 프로젝트에서 가져옴)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] - 하위 호환성을 위해 유지되지만 사용되지 않음 (SSOT: 전역 프로젝트에서 가져옴)
 * @returns 변환된 시간 정보 { startTime: 초, duration: 초 }
 * 
 * @remarks
 * - SSOT: BPM과 timeSignature는 전역 프로젝트에서 자동으로 가져옵니다.
 * - 파라미터는 하위 호환성을 위해 유지되지만 무시됩니다.
 * 
 * @example
 * ```ts
 * // 전역 프로젝트의 BPM과 timeSignature 사용 (SSOT)
 * const { startTime, duration } = measureToTime(2.5, 1.0, 120, [4, 4]);
 * // startTime: 5.0초, duration: 2.0초
 * ```
 */
export const measureToTime = (measureStart: number, measureDuration: number, _bpm: number, _timeSignature: [number, number]): { startTime: number; duration: number } => {
  // 프로젝트에서 timing 정보 가져오기
  const project = getProject();
  const timing = project.timing || createSimpleTiming(
    getBpm(project),
    getTimeSignature(project)
  );
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqnFromTiming(project);
  
  // 순수 함수 버전 사용
  const { startTick, durationTicks } = measureToTicksPure(measureStart, measureDuration, timeSignature, ppqn);
  return ticksToSecondsPure(startTick, durationTicks, timing.tempoMap, timeSignature, ppqn);
};

/**
 * 시간(초)을 마디 기반 정보로 변환합니다.
 * 내부적으로 Tick 변환을 사용합니다 (SMF 표준 정합, 호환성 레이어).
 * 
 * @param startTime - 시작 시간 (초)
 * @param duration - 길이 (초)
 * @param bpm - BPM (Beats Per Minute) - 하위 호환성을 위해 유지되지만 사용되지 않음 (SSOT: 전역 프로젝트에서 가져옴)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit] - 하위 호환성을 위해 유지되지만 사용되지 않음 (SSOT: 전역 프로젝트에서 가져옴)
 * @returns 변환된 마디 정보 { measureStart: 마디, measureDuration: 마디 }
 * 
 * @remarks
 * - SSOT: BPM과 timeSignature는 전역 프로젝트에서 자동으로 가져옵니다.
 * - 파라미터는 하위 호환성을 위해 유지되지만 무시됩니다.
 * 
 * @example
 * ```ts
 * // 전역 프로젝트의 BPM과 timeSignature 사용 (SSOT)
 * const { measureStart, measureDuration } = timeToMeasure(5.0, 2.0, 120, [4, 4]);
 * // measureStart: 2.5, measureDuration: 1.0
 * ```
 */
export const timeToMeasure = (startTime: number, duration: number, _bpm: number, _timeSignature: [number, number]): { measureStart: number; measureDuration: number } => {
  // 프로젝트에서 timing 정보 가져오기
  const project = getProject();
  const timing = project.timing || createSimpleTiming(
    getBpm(project),
    getTimeSignature(project)
  );
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqnFromTiming(project);
  
  // 순수 함수 버전 사용
  const { startTick, durationTicks } = secondsToTicksPure(startTime, duration, timing.tempoMap, timeSignature, ppqn);
  return ticksToMeasurePure(startTick, durationTicks, timeSignature, ppqn);
};

// ============================================================================
// MIDI 파트 관련 함수들 (midiPartActions.ts로 이동됨)
// ============================================================================
// Phase 4 리팩토링: MIDI 파트 관련 액션들을 midiPartActions.ts로 분리
// 아래 함수들은 midiPartActions.ts에서 re-export됩니다.
export {
  addMidiPart,
  removeMidiPart,
  updateMidiPart,
  findMidiPart,
  removeMultipleMidiParts,
  updateMultipleMidiParts,
  preparePartLevelHistoryEntries,
  splitMidiPart,
  mergeMidiParts,
  cloneMidiPart,
  cloneMultipleMidiParts
} from './midiPartActions';

// 파트 레벨 히스토리 관련 함수 재export
export { addPartLevelHistoryEntry, setFlushPendingHistoryCallback };

// 노트 히스토리 관련 함수 재export
export { getMidiPartHistory };

// ============================================================================
// 노트 관련 함수들 (noteActions.ts로 이동됨)
// ============================================================================
// P1 리팩토링: 노트 관련 액션들을 noteActions.ts로 분리
// 아래 함수들은 noteActions.ts에서 re-export됩니다.
export {
  getMidiPartNotes,
  addNoteToMidiPart,
  updateNoteInMidiPart,
  addMultipleNotesToMidiPart,
  removeNoteFromMidiPart,
  removeMultipleNotesFromMidiPart,
  splitNote,
  mergeNotes,
  resizeNote
} from './actions/noteActions';

/**
 * MIDI 파트를 지정된 위치에서 분할합니다.
 * Tick 기반으로 작동하며, measure 파라미터는 호환성을 위해 유지됩니다 (SMF 표준 정합).
 * 
 * @param partId - 분할할 MIDI 파트의 ID
 * @param splitMeasurePosition - 분할 위치 (파트 기준 상대 마디 위치, 0 ~ part.durationTicks를 measure로 변환한 값)
 * @returns 분할된 두 파트의 ID { firstPartId, secondPartId } 또는 null (실패 시)
 * 
 * @remarks
 * - splitMeasurePosition은 파트 내부 위치여야 합니다 (0과 part.durationTicks를 measure로 변환한 값 사이).
 * - 분할 위치를 넘어가는 노트는 클리핑되어 양쪽 파트에 포함됩니다.
 * - 내부적으로 Tick 기반으로 계산하여 정밀도를 보장합니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 * - 원본 파트는 삭제되고 두 개의 새 파트가 생성됩니다.
 */
// splitMidiPart는 위의 export 섹션에서 re-export됩니다.

/**
 * 여러 MIDI 파트를 하나로 병합합니다.
 * 
 * @param partIds - 병합할 MIDI 파트 ID 배열 (최소 2개 필요)
 * @returns 병합된 파트의 ID { mergedPartId } 또는 null (실패 시)
 * 
 * @remarks
 * - 같은 트랙에 속한 파트만 병합 가능합니다.
 * - startTick 기준으로 정렬되어 가장 왼쪽 파트가 기준이 됩니다.
 * - 모든 노트는 기준 파트 기준으로 상대 위치가 변환됩니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 * - 원본 파트들은 삭제되고 새 병합 파트가 생성됩니다.
 */
// mergeMidiParts는 위의 export 섹션에서 re-export됩니다.

/**
 * MIDI 파트의 노트 레벨 언두를 실행합니다.
 * 
 * @param partId - 언두를 실행할 MIDI 파트의 ID
 * 
 * @remarks
 * - 노트 레벨 히스토리에서 마지막 액션을 되돌립니다.
 * - 지원하는 액션: addNote, addMultipleNotes, removeNote, updateNote, updateMultipleNotes, splitNote, mergeNotes
 * - 히스토리가 비어있으면 아무 작업도 수행하지 않습니다.
 * - Phase 5.3: history.undoNoteLevel API를 사용하여 히스토리 스택 직접 접근 제거
 */
export const undoMidiPart = (partId: string): void => {
  const part = getProject().midiParts.find(p => p.id === partId);
  if (!part || !part.notes) return;
  
  undoNoteLevel(partId, (action: MidiPartHistoryAction) => {
    switch (action.type) {
    case 'addNote':
      // 노트 추가의 undo는 노트 삭제 (Tick 기반으로 찾기)
      const index = part.notes.findIndex(n => 
        n.startTick === action.note.startTick &&
        n.durationTicks === action.note.durationTicks &&
        n.note === action.note.note
      );
      if (index >= 0) {
        part.notes.splice(index, 1);
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'addMultipleNotes':
      // 여러 노트 추가의 undo는 모든 노트 삭제 (Tick 기반으로 찾기)
      action.notes.forEach(note => {
        const noteIndex = part.notes.findIndex(n => 
          n.startTick === note.startTick &&
          n.durationTicks === note.durationTicks &&
          n.note === note.note
        );
        if (noteIndex >= 0) {
          part.notes.splice(noteIndex, 1);
        }
      });
      if (action.notes.length > 0) {
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'removeNote':
      // 노트 삭제의 undo는 노트 추가
      if (action.noteIndex >= 0 && action.noteIndex <= part.notes.length) {
        part.notes.splice(action.noteIndex, 0, action.note);
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'removeMultipleNotes':
      // 여러 노트 삭제의 undo는 여러 노트를 다시 추가
      // 인덱스를 정렬하여 순서대로 삽입 (인덱스가 변경되지 않도록)
      const sortedNotesToRestore = [...action.notes]
        .sort((a, b) => a.noteIndex - b.noteIndex);
      sortedNotesToRestore.forEach(({ note, noteIndex }) => {
        if (noteIndex >= 0 && noteIndex <= part.notes.length) {
          part.notes.splice(noteIndex, 0, { ...note });
        }
      });
      if (action.notes.length > 0) {
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'updateNote':
      // 노트 업데이트의 undo는 이전 상태로 복원
      if (action.noteIndex >= 0 && action.noteIndex < part.notes.length) {
        part.notes[action.noteIndex] = { ...action.oldNote };
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
      case 'updateMultipleNotes':
      // 여러 노트 업데이트의 undo는 모든 노트를 이전 상태로 복원
      // 역순으로 업데이트하여 인덱스 문제 방지
      for (let i = action.updates.length - 1; i >= 0; i--) {
        const update = action.updates[i];
        if (update.noteIndex >= 0 && update.noteIndex < part.notes.length) {
          part.notes[update.noteIndex] = { ...update.oldNote };
        }
      }
      notifyProjectChange({ type: 'midiPart' as const, partId });
      break;
    case 'splitNote':
      // splitNote의 undo: 두 노트를 하나로 합치기
      if (action.noteIndex < part.notes.length) {
        // 첫 번째 노트를 원래 노트로 교체
        part.notes[action.noteIndex] = { ...action.originalNote };
        // 두 번째 노트가 있으면 제거 (첫 번째 노트 바로 다음)
        if (action.noteIndex + 1 < part.notes.length) {
          part.notes.splice(action.noteIndex + 1, 1);
        }
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'mergeNotes':
      // mergeNotes의 undo: 하나의 노트를 여러 노트로 분리
      if (action.noteIndices.length > 0 && action.noteIndices[0] < part.notes.length) {
        const mergeIndex = action.noteIndices[0];
        // 병합된 노트를 원래 노트들로 교체
        // originalNotes는 이미 시간 순서로 정렬되어 있음
        const originalNotes = action.originalNotes
          .sort((a, b) => a.note.startTick - b.note.startTick)
          .map(n => ({ ...n.note }));
        
        // 병합된 노트 제거
        part.notes.splice(mergeIndex, 1);
        
        // 원래 노트들을 순서대로 삽입
        originalNotes.forEach((note, i) => {
          part.notes.splice(mergeIndex + i, 0, note);
        });
        
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    }
  });
};

// cloneMidiPart와 cloneMultipleMidiParts는 위의 export 섹션에서 re-export됩니다.

/**
 * MIDI 파트의 노트 레벨 리두를 실행합니다.
 * 
 * @param partId - 리두를 실행할 MIDI 파트의 ID
 * 
 * @remarks
 * - 노트 레벨 히스토리에서 마지막 언두된 액션을 다시 실행합니다.
 * - 지원하는 액션: addNote, addMultipleNotes, removeNote, updateNote, updateMultipleNotes, splitNote, mergeNotes
 * - 리두 스택이 비어있으면 아무 작업도 수행하지 않습니다.
 * - Phase 5.3: history.redoNoteLevel API를 사용하여 히스토리 스택 직접 접근 제거
 */
export const redoMidiPart = (partId: string): void => {
  const part = getProject().midiParts.find(p => p.id === partId);
  if (!part || !part.notes) return;
  
  redoNoteLevel(partId, (action: MidiPartHistoryAction) => {
    switch (action.type) {
    case 'addNote':
      // 노트 추가
      part.notes.push(action.note);
      notifyProjectChange({ type: 'midiPart' as const, partId });
      break;
    case 'addMultipleNotes':
      // 여러 노트 추가
      action.notes.forEach(note => {
        part.notes.push({ ...note });
      });
      if (action.notes.length > 0) {
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'removeNote':
      // 노트 삭제
      if (action.noteIndex >= 0 && action.noteIndex < part.notes.length) {
        part.notes.splice(action.noteIndex, 1);
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'removeMultipleNotes':
      // 여러 노트 삭제의 redo는 여러 노트를 다시 삭제
      // 인덱스를 역순으로 정렬하여 삭제 (인덱스가 변경되지 않도록)
      const sortedNotesToRemove = [...action.notes]
        .sort((a, b) => b.noteIndex - a.noteIndex);
      sortedNotesToRemove.forEach(({ noteIndex }) => {
        if (noteIndex >= 0 && noteIndex < part.notes.length) {
          part.notes.splice(noteIndex, 1);
        }
      });
      if (action.notes.length > 0) {
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'updateNote':
      // 노트 업데이트
      if (action.noteIndex >= 0 && action.noteIndex < part.notes.length) {
        const updatedNote = { ...part.notes[action.noteIndex], ...action.newNote };
        part.notes[action.noteIndex] = updatedNote;
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'updateMultipleNotes':
      // 여러 노트 업데이트
      action.updates.forEach(update => {
        if (update.noteIndex >= 0 && update.noteIndex < part.notes.length) {
          const updatedNote = { ...part.notes[update.noteIndex], ...update.newNote };
          part.notes[update.noteIndex] = updatedNote;
        }
      });
      notifyProjectChange({ type: 'midiPart' as const, partId });
      break;
    case 'splitNote':
      // splitNote의 redo: 노트를 두 개로 분할
      if (action.noteIndex < part.notes.length) {
        // 첫 번째 노트 교체
        part.notes[action.noteIndex] = { ...action.firstNote };
        // 두 번째 노트 추가
        part.notes.splice(action.noteIndex + 1, 0, { ...action.secondNote });
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    case 'mergeNotes':
      // mergeNotes의 redo: 여러 노트를 하나로 병합
      if (action.noteIndices.length > 0 && action.noteIndices[0] < part.notes.length) {
        const mergeIndex = action.noteIndices[0];
        // 첫 번째 노트를 병합된 노트로 교체
        part.notes[mergeIndex] = { ...action.mergedNote };
        // 나머지 노트들 삭제 (역순으로 삭제하여 인덱스 문제 방지)
        for (let i = action.noteIndices.length - 1; i >= 1; i--) {
          if (action.noteIndices[i] < part.notes.length) {
            part.notes.splice(action.noteIndices[i], 1);
          }
        }
        notifyProjectChange({ type: 'midiPart' as const, partId });
      }
      break;
    }
  });
};

// setExportRangeMeasure와 getExportRangeMeasure는 projectActions.ts에서 re-export됩니다.

/**
 * 이벤트 디스플레이 히스토리(파트 레벨) 언두를 실행합니다.
 * 
 * @remarks
 * - 파트 레벨 히스토리에서 마지막 액션을 되돌립니다.
 * - 지원하는 액션: addPart, removePart, removeMultipleParts, updatePart, updateMultipleParts, splitPart, mergeParts, clonePart, cloneMultipleParts
 * - 지연된 히스토리가 있으면 즉시 추가됩니다.
 * - 파트 삭제 시 historyIndex를 사용하여 노트 상태를 복원합니다.
 * - Phase 5.3: history.undoPartLevel API를 사용하여 히스토리 스택 직접 접근 제거
 */
export const undoMidiPartLevel = (): void => {
  undoPartLevel((action) => {
    switch (action.type) {
    case 'addPart':
      // 파트 추가의 undo는 파트 삭제
      removeMidiPart(action.part.id, true);
      break;
    case 'removePart':
      // 파트 삭제의 undo는 파트 추가 (히스토리 상태를 사용하여 노트 복원)
      const partToAdd = structuredClone(action.part);
      const existingHistory = getMidiPartHistory(partToAdd.id);
      const historyIndexToRestore = partToAdd.historyIndex ?? existingHistory.undoStack.length;
      if (historyIndexToRestore >= 0 && existingHistory.undoStack.length >= historyIndexToRestore) {
        partToAdd.notes = restoreNotesFromHistoryIndex(partToAdd.id, historyIndexToRestore);
      }
      addMidiPart(partToAdd, true);
      break;
    case 'removeMultipleParts':
      // 여러 파트 삭제의 undo는 여러 파트 추가 (히스토리 상태를 사용하여 노트 복원)
      action.parts.forEach(partData => {
        const partToAdd = structuredClone(partData);
        const existingHistory = getMidiPartHistory(partToAdd.id);
        const historyIndexToRestore = partToAdd.historyIndex ?? existingHistory.undoStack.length;
        if (historyIndexToRestore >= 0 && existingHistory.undoStack.length >= historyIndexToRestore) {
          partToAdd.notes = restoreNotesFromHistoryIndex(partToAdd.id, historyIndexToRestore);
        }
        addMidiPart(partToAdd, true);
      });
      break;
    case 'updatePart':
      // 파트 업데이트의 undo는 이전 상태로 복원 (노트는 보존)
      const partToRestore = findMidiPart(action.partId);
      if (partToRestore) {
        // oldPart의 속성으로 복원 (노트는 현재 파트의 노트를 유지)
        const currentNotes = partToRestore.notes;
        // tick 기반 우선, 마이그레이션용 레거시 필드 지원 (measureStart/measureDuration)
        if (action.oldPart.startTick !== undefined) {
          partToRestore.startTick = action.oldPart.startTick;
        } else {
          const legacyPart = action.oldPart as LegacyPart; // 마이그레이션을 위해 레거시 필드 접근
          if (legacyPart.measureStart !== undefined) {
            const project = getProject();
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqnFromTiming(project);
            const { startTick } = measureToTicksPure(legacyPart.measureStart, 0, timeSignature, ppqn);
            partToRestore.startTick = startTick;
          }
        }
        if (action.oldPart.durationTicks !== undefined) {
          partToRestore.durationTicks = action.oldPart.durationTicks;
        } else {
          const legacyPart = action.oldPart as any; // 마이그레이션을 위해 레거시 필드 접근 (타입 안전성을 위해 any로 캐스팅)
          if (legacyPart.measureDuration !== undefined) {
            const project = getProject();
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqnFromTiming(project);
            const { durationTicks } = measureToTicksPure(0, legacyPart.measureDuration, timeSignature, ppqn);
            partToRestore.durationTicks = durationTicks;
          }
        }
        partToRestore.trackId = action.oldPart.trackId;
        // 노트는 그대로 유지
        partToRestore.notes = currentNotes;
        notifyProjectChange({ type: 'midiPart' as const, partId: action.partId });
      }
      break;
    case 'updateMultipleParts':
      // 여러 파트 업데이트의 undo는 모든 파트를 이전 상태로 복원 (노트는 보존)
      const updatedPartIds: string[] = [];
      for (const { partId, oldPart } of action.updates) {
        const partToRestoreMultiple = findMidiPart(partId);
        if (partToRestoreMultiple) {
          // 노트는 현재 파트의 노트를 유지
          const currentNotes = partToRestoreMultiple.notes;
          // tick 기반 우선, 마이그레이션용 레거시 필드 지원 (measureStart/measureDuration)
          if (oldPart.startTick !== undefined) {
            partToRestoreMultiple.startTick = oldPart.startTick;
          } else {
            const legacyPart = oldPart as LegacyPart;
            if (legacyPart.measureStart !== undefined) {
              const project = getProject();
              const timeSignature = getTimeSignature(project);
              const ppqn = getPpqnFromTiming(project);
              const { startTick } = measureToTicksPure(legacyPart.measureStart, 0, timeSignature, ppqn);
              partToRestoreMultiple.startTick = startTick;
            }
          }
          if (oldPart.durationTicks !== undefined) {
            partToRestoreMultiple.durationTicks = oldPart.durationTicks;
          } else {
            const legacyPart = oldPart as LegacyPart;
            if (legacyPart.measureDuration !== undefined) {
              const project = getProject();
              const timeSignature = getTimeSignature(project);
              const ppqn = getPpqnFromTiming(project);
              const { durationTicks } = measureToTicksPure(0, legacyPart.measureDuration, timeSignature, ppqn);
              partToRestoreMultiple.durationTicks = durationTicks;
            }
          }
          partToRestoreMultiple.trackId = oldPart.trackId;
          // 노트는 그대로 유지
          partToRestoreMultiple.notes = currentNotes;
          updatedPartIds.push(partId);
        }
      }
      // 모든 파트 업데이트 후 각 파트마다 알림 (UI 업데이트 보장)
      // React의 배치 업데이트로 인해 여러 알림이 하나의 렌더링 사이클로 처리될 수 있지만,
      // 각 파트에 대한 알림이 필요하므로 각각 호출
      if (updatedPartIds.length > 0) {
        for (const partId of updatedPartIds) {
          notifyProjectChange({ type: 'midiPart' as const, partId });
        }
      }
      break;
    case 'splitPart': {
      // 스플릿의 undo는 원본 파트 복원 (두 파트 삭제하고 원본 추가)
      const firstPartId = action.firstPart.id;
      const secondPartId = action.secondPart.id;
      removeMidiPart(firstPartId, true);
      removeMidiPart(secondPartId, true);
      // 원본 파트 복원 시 히스토리에서 노트 상태 복원
      const originalPartToAdd = structuredClone(action.originalPart);
      const originalHistory = getMidiPartHistory(originalPartToAdd.id);
      if (originalHistory.undoStack.length > 0) {
        const currentHistoryIndex = originalHistory.undoStack.length;
        originalPartToAdd.notes = restoreNotesFromHistoryIndex(originalPartToAdd.id, currentHistoryIndex);
      }
      addMidiPart(originalPartToAdd, true);
      break;
    }
    case 'mergeParts': {
      // 머지의 undo는 원본 파트들 복원 (머지된 파트 삭제하고 원본들 추가)
      const mergedPartId = action.mergedPart.id;
      removeMidiPart(mergedPartId, true);
      action.originalParts.forEach(part => {
        // 원본 파트 복원 시 히스토리에서 노트 상태 복원
        const partToAdd = structuredClone(part);
        const existingHistory = getMidiPartHistory(partToAdd.id);
        if (existingHistory.undoStack.length > 0) {
          const currentHistoryIndex = existingHistory.undoStack.length;
          partToAdd.notes = restoreNotesFromHistoryIndex(partToAdd.id, currentHistoryIndex);
        }
        addMidiPart(partToAdd, true);
      });
      break;
    }
    case 'clonePart':
      // 복제의 undo는 복제본 삭제
      removeMidiPart(action.clonedPart.id, true);
      break;
    case 'cloneMultipleParts':
      // 다중 복제의 undo는 모든 복제본 삭제
      action.clones.forEach(clone => {
        removeMidiPart(clone.clonedPart.id, true);
      });
      break;
    }
  });
};

/**
 * 이벤트 디스플레이 히스토리(파트 레벨) 리두를 실행합니다.
 * 
 * @remarks
 * - 파트 레벨 히스토리에서 마지막 언두된 액션을 다시 실행합니다.
 * - 지원하는 액션: addPart, removePart, removeMultipleParts, updatePart, updateMultipleParts, splitPart, mergeParts, clonePart, cloneMultipleParts
 * - 리두 스택이 비어있으면 아무 작업도 수행하지 않습니다.
 * - 파트 추가 시 historyIndex를 사용하여 노트 상태를 복원합니다.
 * - Phase 5.3: history.redoPartLevel API를 사용하여 히스토리 스택 직접 접근 제거
 */
export const redoMidiPartLevel = (): void => {
  redoPartLevel((action) => {
    switch (action.type) {
    case 'addPart': {
      // 파트 추가의 redo는 파트를 다시 추가 (action.part.historyIndex를 사용하여 노트 상태 복원)
      const partToAdd = structuredClone(action.part);
      const existingHistory = getMidiPartHistory(partToAdd.id);
      const historyIndexToRestore = partToAdd.historyIndex ?? existingHistory.undoStack.length;
      if (historyIndexToRestore >= 0 && existingHistory.undoStack.length >= historyIndexToRestore) {
        partToAdd.notes = restoreNotesFromHistoryIndex(partToAdd.id, historyIndexToRestore);
      }
      addMidiPart(partToAdd, true);
      break;
    }
    case 'removePart':
      // 파트 삭제
      removeMidiPart(action.part.id, true);
      break;
    case 'removeMultipleParts':
      // 여러 파트 삭제
      action.parts.forEach(partData => {
        removeMidiPart(partData.id, true);
      });
      break;
    case 'updatePart':
      // 파트 업데이트 (노트는 보존)
      const partToUpdate = findMidiPart(action.partId);
      if (partToUpdate) {
        // newPart의 속성으로 업데이트 (노트는 현재 파트의 노트를 유지)
        const currentNotes = partToUpdate.notes;
        // tick 기반 우선, 마이그레이션용 레거시 필드 지원 (measureStart/measureDuration)
        if (action.newPart.startTick !== undefined) {
          partToUpdate.startTick = action.newPart.startTick;
        } else {
          const legacyPart = action.newPart as LegacyPart; // 마이그레이션을 위해 레거시 필드 접근
          if (legacyPart.measureStart !== undefined) {
            const project = getProject();
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqnFromTiming(project);
            const { startTick } = measureToTicksPure(legacyPart.measureStart, 0, timeSignature, ppqn);
            partToUpdate.startTick = startTick;
          }
        }
        if (action.newPart.durationTicks !== undefined) {
          partToUpdate.durationTicks = action.newPart.durationTicks;
        } else {
          const legacyPart = action.newPart as any; // 마이그레이션을 위해 레거시 필드 접근 (타입 안전성을 위해 any로 캐스팅)
          if (legacyPart.measureDuration !== undefined) {
            const project = getProject();
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqnFromTiming(project);
            const { durationTicks } = measureToTicksPure(0, legacyPart.measureDuration, timeSignature, ppqn);
            partToUpdate.durationTicks = durationTicks;
          }
        }
        if (action.newPart.trackId !== undefined) {
          partToUpdate.trackId = action.newPart.trackId;
        }
        // 노트는 그대로 유지
        partToUpdate.notes = currentNotes;
        notifyProjectChange({ type: 'midiPart' as const, partId: action.partId });
      }
      break;
    case 'updateMultipleParts':
      // 여러 파트 업데이트의 redo는 모든 파트를 새로운 상태로 복원 (노트는 보존)
      const redoUpdatedPartIds: string[] = [];
      for (const { partId, newPart } of action.updates) {
        const partToRedoMultiple = findMidiPart(partId);
        if (partToRedoMultiple) {
          // 노트는 현재 파트의 노트를 유지
          const currentNotes = partToRedoMultiple.notes;
          // tick 기반 우선, 마이그레이션용 레거시 필드 지원 (measureStart/measureDuration)
          if (newPart.startTick !== undefined) {
            partToRedoMultiple.startTick = newPart.startTick;
          } else {
            const legacyPart = newPart as Partial<MidiPart> & { measureStart?: number; measureDuration?: number };
            if (legacyPart.measureStart !== undefined) {
              const project = getProject();
              const timeSignature = getTimeSignature(project);
              const ppqn = getPpqnFromTiming(project);
              const { startTick } = measureToTicksPure(legacyPart.measureStart, 0, timeSignature, ppqn);
              partToRedoMultiple.startTick = startTick;
            }
          }
          if (newPart.durationTicks !== undefined) {
            partToRedoMultiple.durationTicks = newPart.durationTicks;
          } else {
            const legacyPart = newPart as Partial<MidiPart> & { measureStart?: number; measureDuration?: number };
            if (legacyPart.measureDuration !== undefined) {
              const project = getProject();
              const timeSignature = getTimeSignature(project);
              const ppqn = getPpqnFromTiming(project);
              const { durationTicks } = measureToTicksPure(0, legacyPart.measureDuration, timeSignature, ppqn);
              partToRedoMultiple.durationTicks = durationTicks;
            }
          }
          partToRedoMultiple.trackId = newPart.trackId ?? partToRedoMultiple.trackId;
          // 노트는 그대로 유지
          partToRedoMultiple.notes = currentNotes;
          redoUpdatedPartIds.push(partId);
        }
      }
      // 모든 파트 업데이트 후 각 파트마다 알림 (UI 업데이트 보장)
      if (redoUpdatedPartIds.length > 0) {
        for (const partId of redoUpdatedPartIds) {
          notifyProjectChange({ type: 'midiPart' as const, partId });
        }
      }
      break;
    case 'splitPart': {
      // 스플릿 (원본 삭제하고 두 파트 추가)
      removeMidiPart(action.originalPart.id, true);
      // 첫 번째 파트 추가 시 히스토리 복원
      const firstPartToAdd = structuredClone(action.firstPart);
      const firstHistory = getMidiPartHistory(firstPartToAdd.id);
      if (firstHistory.undoStack.length > 0) {
        const currentHistoryIndex = firstHistory.undoStack.length;
        firstPartToAdd.notes = restoreNotesFromHistoryIndex(firstPartToAdd.id, currentHistoryIndex);
      }
      addMidiPart(firstPartToAdd, true);
      // 두 번째 파트 추가 시 히스토리 복원
      const secondPartToAdd = structuredClone(action.secondPart);
      const secondHistory = getMidiPartHistory(secondPartToAdd.id);
      if (secondHistory.undoStack.length > 0) {
        const currentHistoryIndex = secondHistory.undoStack.length;
        secondPartToAdd.notes = restoreNotesFromHistoryIndex(secondPartToAdd.id, currentHistoryIndex);
      }
      addMidiPart(secondPartToAdd, true);
      break;
    }
    case 'mergeParts': {
      // 머지 (원본들 삭제하고 머지된 파트 추가)
      action.originalParts.forEach(part => removeMidiPart(part.id, true));
      // 머지된 파트 추가 시 히스토리 복원
      const mergedPartToAdd = structuredClone(action.mergedPart);
      const mergedHistory = getMidiPartHistory(mergedPartToAdd.id);
      if (mergedHistory.undoStack.length > 0) {
        const currentHistoryIndex = mergedHistory.undoStack.length;
        mergedPartToAdd.notes = restoreNotesFromHistoryIndex(mergedPartToAdd.id, currentHistoryIndex);
      }
      addMidiPart(mergedPartToAdd, true);
      break;
    }
    case 'clonePart': {
      // 복제의 redo는 파트를 다시 추가 (히스토리 맵에서 현재 히스토리 상태를 확인하여 노트 상태 복원)
      const clonedPartToAdd = structuredClone(action.clonedPart);
      const clonedExistingHistory = getMidiPartHistory(clonedPartToAdd.id);
      if (clonedExistingHistory.undoStack.length > 0) {
        const currentHistoryIndex = clonedExistingHistory.undoStack.length;
        clonedPartToAdd.notes = restoreNotesFromHistoryIndex(clonedPartToAdd.id, currentHistoryIndex);
      }
      addMidiPart(clonedPartToAdd, true);
      break;
    }
    case 'cloneMultipleParts': {
      // 다중 복제의 redo는 모든 복제본을 다시 추가 (히스토리 맵에서 현재 히스토리 상태를 확인하여 노트 상태 복원)
      action.clones.forEach(clone => {
        const clonedPartToAdd = structuredClone(clone.clonedPart);
        const clonedExistingHistory = getMidiPartHistory(clonedPartToAdd.id);
        if (clonedExistingHistory.undoStack.length > 0) {
          const currentHistoryIndex = clonedExistingHistory.undoStack.length;
          clonedPartToAdd.notes = restoreNotesFromHistoryIndex(clonedPartToAdd.id, currentHistoryIndex);
        }
        addMidiPart(clonedPartToAdd, true);
      });
      break;
    }
    }
  });
};
