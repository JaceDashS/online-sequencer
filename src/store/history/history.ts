/**
 * Phase 5: Shared history facade
 *
 * 목표:
 * - noteHistory(파트별) + partHistory(프로젝트/파트레벨) 접근을 한곳으로 모아서
 *   import/사용 패턴을 정리한다.
 * - 테스트에서 전역 히스토리를 리셋할 수 있도록 reset API를 제공한다.
 * - Phase 5.3 완료: undo/redo API를 제공하여 히스토리 스택 직접 접근을 제거한다.
 */

import type { MidiNote, MidiPart } from '../../types/project';

// structuredClone은 전역 함수이므로 import 불필요

// ---------------------------------------------------------------------------
// Note-level history (per part)
// ---------------------------------------------------------------------------

export type MidiPartHistoryAction =
  | { scope: 'note'; type: 'addNote'; note: MidiNote; partId: string }
  | { scope: 'note'; type: 'addMultipleNotes'; notes: MidiNote[]; partId: string }
  | { scope: 'note'; type: 'removeNote'; note: MidiNote; partId: string; noteIndex: number }
  | { scope: 'note'; type: 'updateNote'; noteIndex: number; oldNote: MidiNote; newNote: Partial<MidiNote>; partId: string }
  | { scope: 'note'; type: 'updateMultipleNotes'; updates: Array<{ noteIndex: number; oldNote: MidiNote; newNote: Partial<MidiNote> }>; partId: string }
  | { scope: 'note'; type: 'splitNote'; noteIndex: number; originalNote: MidiNote; firstNote: MidiNote; secondNote: MidiNote; partId: string }
  | { scope: 'note'; type: 'mergeNotes'; noteIndices: number[]; originalNotes: Array<{ index: number; note: MidiNote }>; mergedNote: MidiNote; partId: string };

export type MidiPartHistory = {
  undoStack: MidiPartHistoryAction[];
  redoStack: MidiPartHistoryAction[];
};

// We re-export the existing noteHistory functions, but adapt action typing.
import * as noteHistory from './noteHistory';

export const getMidiPartHistory = (partId: string): MidiPartHistory => {
  // cast: underlying storage shape matches undoStack/redoStack arrays
  return noteHistory.getMidiPartHistory(partId) as unknown as MidiPartHistory;
};

export const addHistoryEntry = (partId: string, action: Omit<MidiPartHistoryAction, 'scope'> | MidiPartHistoryAction): void => {
  const normalized = ('scope' in action ? action : ({ ...action, scope: 'note' } as const)) as MidiPartHistoryAction;
  // strip scope before storing (keeps backward compatibility)
  const { scope: _scope, ...legacyAction } = normalized as any;
  noteHistory.addHistoryEntry(partId, legacyAction);
};

export const restoreNotesFromHistoryIndex = noteHistory.restoreNotesFromHistoryIndex;
export const cloneHistory = noteHistory.cloneHistory;
export const deleteHistory = noteHistory.deleteHistory;

// ---------------------------------------------------------------------------
// Part-level history (global)
// ---------------------------------------------------------------------------

export type MidiPartLevelAction =
  | { scope: 'part'; type: 'addPart'; part: MidiPart }
  | { scope: 'part'; type: 'removePart'; part: MidiPart }
  | { scope: 'part'; type: 'removeMultipleParts'; parts: MidiPart[] }
  | { scope: 'part'; type: 'updatePart'; partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }
  | { scope: 'part'; type: 'updateMultipleParts'; updates: Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> }
  | { scope: 'part'; type: 'splitPart'; originalPart: MidiPart; firstPart: MidiPart; secondPart: MidiPart }
  | { scope: 'part'; type: 'mergeParts'; originalParts: MidiPart[]; mergedPart: MidiPart }
  | { scope: 'part'; type: 'clonePart'; originalPartId: string; clonedPart: MidiPart }
  | { scope: 'part'; type: 'cloneMultipleParts'; clones: Array<{ originalPartId: string; clonedPart: MidiPart }> };

export type MidiPartLevelHistory = {
  undoStack: MidiPartLevelAction[];
  redoStack: MidiPartLevelAction[];
};

import * as partHistory from './partHistory';

export const getPartLevelHistory = (): MidiPartLevelHistory => {
  return partHistory.getPartLevelHistory() as unknown as MidiPartLevelHistory;
};

export const addPartLevelHistoryEntry = (action: Omit<MidiPartLevelAction, 'scope'> | MidiPartLevelAction): void => {
  const normalized = ('scope' in action ? action : ({ ...action, scope: 'part' } as const)) as MidiPartLevelAction;
  const { scope: _scope, ...legacyAction } = normalized as any;
  partHistory.addPartLevelHistoryEntry(legacyAction);
};

export const setFlushPendingHistoryCallback = partHistory.setFlushPendingHistoryCallback;
export const flushPendingHistory = partHistory.flushPendingHistory;

// ---------------------------------------------------------------------------
// Reset helpers (tests)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Undo/Redo API (Phase 5.3)
// ---------------------------------------------------------------------------

/**
 * 노트 레벨 언두를 실행합니다.
 * 히스토리 스택 관리와 액션 반환을 담당하며, 실제 상태 변경은 applyAction 콜백에서 처리합니다.
 * 
 * @param partId - 언두를 실행할 MIDI 파트의 ID
 * @param applyAction - 액션을 적용하는 콜백 함수
 * @returns 언두된 액션이 있으면 true, 없으면 false
 */
export const undoNoteLevel = (
  partId: string,
  applyAction: (action: MidiPartHistoryAction) => void
): boolean => {
  const history = getMidiPartHistory(partId);
  if (history.undoStack.length === 0) {
    return false;
  }

  const action = history.undoStack.pop()!;
  history.redoStack.push(action);
  
  applyAction(action);
  return true;
};

/**
 * 노트 레벨 리두를 실행합니다.
 * 히스토리 스택 관리와 액션 반환을 담당하며, 실제 상태 변경은 applyAction 콜백에서 처리합니다.
 * 
 * @param partId - 리두를 실행할 MIDI 파트의 ID
 * @param applyAction - 액션을 적용하는 콜백 함수
 * @returns 리두된 액션이 있으면 true, 없으면 false
 */
export const redoNoteLevel = (
  partId: string,
  applyAction: (action: MidiPartHistoryAction) => void
): boolean => {
  const history = getMidiPartHistory(partId);
  if (history.redoStack.length === 0) {
    return false;
  }

  const action = history.redoStack.pop()!;
  history.undoStack.push(action);
  
  applyAction(action);
  return true;
};

/**
 * 파트 레벨 언두를 실행합니다.
 * 히스토리 스택 관리와 액션 반환을 담당하며, 실제 상태 변경은 applyAction 콜백에서 처리합니다.
 * 
 * @param applyAction - 액션을 적용하는 콜백 함수
 * @param flushPending - 지연된 히스토리를 플러시할지 여부 (기본값: true)
 * @returns 언두된 액션이 있으면 true, 없으면 false
 */
export const undoPartLevel = (
  applyAction: (action: MidiPartLevelAction) => void,
  flushPending = true
): boolean => {
  // 지연된 히스토리가 있으면 즉시 추가
  if (flushPending) {
    flushPendingHistory();
  }
  
  const history = getPartLevelHistory();
  if (history.undoStack.length === 0) {
    return false;
  }

  const action = history.undoStack.pop()!;
  
  // action을 redo 스택에 추가
  // "삭제 감지"가 있는 경우, 감지되는 순간의 historyIndex를 redo 액션에 기록한다 (사용자 설계)
  const redoAction = structuredClone(action) as MidiPartLevelAction;
  if (action.type === 'addPart') {
    const idx = getMidiPartHistory(action.part.id).undoStack.length;
    (redoAction as { type: 'addPart'; part: MidiPart }).part.historyIndex = idx;
  } else if (action.type === 'splitPart') {
    const firstIdx = getMidiPartHistory(action.firstPart.id).undoStack.length;
    const secondIdx = getMidiPartHistory(action.secondPart.id).undoStack.length;
    const redoActionSplit = redoAction as { type: 'splitPart'; originalPart: MidiPart; firstPart: MidiPart; secondPart: MidiPart };
    redoActionSplit.firstPart.historyIndex = firstIdx;
    redoActionSplit.secondPart.historyIndex = secondIdx;
  } else if (action.type === 'mergeParts') {
    const mergedIdx = getMidiPartHistory(action.mergedPart.id).undoStack.length;
    (redoAction as { type: 'mergeParts'; originalParts: MidiPart[]; mergedPart: MidiPart }).mergedPart.historyIndex = mergedIdx;
  } else if (action.type === 'clonePart') {
    const clonedIdx = getMidiPartHistory(action.clonedPart.id).undoStack.length;
    (redoAction as { type: 'clonePart'; originalPartId: string; clonedPart: MidiPart }).clonedPart.historyIndex = clonedIdx;
  } else if (action.type === 'cloneMultipleParts') {
    const undoActionCloneMultiple = redoAction as { type: 'cloneMultipleParts'; clones: Array<{ originalPartId: string; clonedPart: MidiPart }> };
    undoActionCloneMultiple.clones = undoActionCloneMultiple.clones.map(clone => {
      const clonedIdx = getMidiPartHistory(clone.clonedPart.id).undoStack.length;
      return { ...clone, clonedPart: { ...clone.clonedPart, historyIndex: clonedIdx } };
    });
  } else if (action.type === 'removeMultipleParts') {
    // 각 파트의 historyIndex를 redo 액션에 기록할 필요 없음 (이미 기록되어 있음)
  }
  history.redoStack.push(redoAction);
  
  applyAction(action);
  return true;
};

/**
 * 파트 레벨 리두를 실행합니다.
 * 히스토리 스택 관리와 액션 반환을 담당하며, 실제 상태 변경은 applyAction 콜백에서 처리합니다.
 * 
 * @param applyAction - 액션을 적용하는 콜백 함수
 * @returns 리두된 액션이 있으면 true, 없으면 false
 */
export const redoPartLevel = (
  applyAction: (action: MidiPartLevelAction) => void
): boolean => {
  const history = getPartLevelHistory();
  if (history.redoStack.length === 0) {
    return false;
  }

  const action = history.redoStack.pop()!;
  // undoStack에 추가할 액션에는, "삭제 감지" 순간의 historyIndex를 기록한다 (사용자 설계)
  const undoAction = structuredClone(action) as MidiPartLevelAction;
  if (action.type === 'removePart') {
    const idx = getMidiPartHistory(action.part.id).undoStack.length;
    (undoAction as { type: 'removePart'; part: MidiPart }).part.historyIndex = idx;
  } else if (action.type === 'splitPart') {
    const idx = getMidiPartHistory(action.originalPart.id).undoStack.length;
    (undoAction as { type: 'splitPart'; originalPart: MidiPart; firstPart: MidiPart; secondPart: MidiPart }).originalPart.historyIndex = idx;
  } else if (action.type === 'mergeParts') {
    // originalParts가 곧 삭제될 예정
    const undoActionMerge = undoAction as { type: 'mergeParts'; originalParts: MidiPart[]; mergedPart: MidiPart };
    undoActionMerge.originalParts = undoActionMerge.originalParts.map((p: MidiPart) => {
      const idx = getMidiPartHistory(p.id).undoStack.length;
      return { ...p, historyIndex: idx };
    });
  }
  history.undoStack.push(undoAction);

  applyAction(action);
  return true;
};

// ---------------------------------------------------------------------------
// Reset helpers (tests)
// ---------------------------------------------------------------------------

/**
 * 테스트를 위해 전역 히스토리를 초기화합니다.
 * (실서비스 코드에서는 사용하지 않는 것을 권장)
 */
export const resetAllHistoriesForTests = (): void => {
  if (typeof (noteHistory as any).resetNoteHistoryForTests === 'function') {
    (noteHistory as any).resetNoteHistoryForTests();
  }
  if (typeof (partHistory as any).resetPartHistoryForTests === 'function') {
    (partHistory as any).resetPartHistoryForTests();
  }
};


