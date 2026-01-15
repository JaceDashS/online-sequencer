/**
 * 노트 레벨 히스토리 관리
 * 미디 파트 내의 노트 추가, 삭제, 업데이트 등의 작업을 관리합니다.
 */

import type { MidiNote } from '../../types/project';

// 각 미디파트별 Undo/Redo 히스토리
export type MidiPartHistoryAction =
  | { type: 'addNote'; note: MidiNote; partId: string }
  | { type: 'addMultipleNotes'; notes: MidiNote[]; partId: string }
  | { type: 'removeNote'; note: MidiNote; partId: string; noteIndex: number }
  | { type: 'removeMultipleNotes'; notes: Array<{ note: MidiNote; noteIndex: number }>; partId: string }
  | { type: 'updateNote'; noteIndex: number; oldNote: MidiNote; newNote: Partial<MidiNote>; partId: string }
  | { type: 'updateMultipleNotes'; updates: Array<{ noteIndex: number; oldNote: MidiNote; newNote: Partial<MidiNote> }>; partId: string }
  | { type: 'splitNote'; noteIndex: number; originalNote: MidiNote; firstNote: MidiNote; secondNote: MidiNote; partId: string }
  | { type: 'mergeNotes'; noteIndices: number[]; originalNotes: Array<{ index: number; note: MidiNote }>; mergedNote: MidiNote; partId: string };

export type MidiPartHistory = {
  undoStack: MidiPartHistoryAction[];
  redoStack: MidiPartHistoryAction[];
};

import { HISTORY_CONSTANTS } from '../../constants/ui';

// 각 미디파트 ID별 히스토리 저장 (Map<partId, MidiPartHistory>)
const midiPartHistories = new Map<string, MidiPartHistory>();
const MAX_HISTORY = HISTORY_CONSTANTS.MAX_HISTORY;

/**
 * 미디 파트의 히스토리를 가져옵니다. 없으면 생성합니다.
 */
export function getMidiPartHistory(partId: string): MidiPartHistory {
  if (!midiPartHistories.has(partId)) {
    midiPartHistories.set(partId, {
      undoStack: [],
      redoStack: [],
    });
  }
  return midiPartHistories.get(partId)!;
}

/**
 * 히스토리에 액션 추가
 */
export function addHistoryEntry(partId: string, action: MidiPartHistoryAction): void {
  const history = getMidiPartHistory(partId);
  history.undoStack.push(action);
  history.redoStack.length = 0; // Redo 스택 초기화
  if (history.undoStack.length > MAX_HISTORY) {
    history.undoStack.shift();
  }
}

/**
 * 히스토리에서 노트 상태 복원
 */
export function restoreNotesFromHistoryIndex(partId: string, historyIndex: number): MidiNote[] {
  const history = getMidiPartHistory(partId);
  if (historyIndex < 0 || historyIndex > history.undoStack.length) {
    return [];
  }

  // 초기 상태 (빈 배열)
  const notes: MidiNote[] = [];

  // historyIndex까지의 액션을 순차적으로 적용
  for (let i = 0; i < historyIndex; i++) {
    const action = history.undoStack[i];
    switch (action.type) {
      case 'addNote':
        notes.push({ ...action.note });
        break;
      case 'addMultipleNotes':
        action.notes.forEach(note => {
          notes.push({ ...note });
        });
        break;
      case 'removeNote':
        if (action.noteIndex >= 0 && action.noteIndex < notes.length) {
          notes.splice(action.noteIndex, 1);
        }
        break;
      case 'removeMultipleNotes':
        // 여러 노트 삭제: 인덱스를 역순으로 정렬하여 삭제 (인덱스가 변경되지 않도록)
        const sortedRemoves = [...action.notes]
          .sort((a, b) => b.noteIndex - a.noteIndex);
        sortedRemoves.forEach(({ noteIndex }) => {
          if (noteIndex >= 0 && noteIndex < notes.length) {
            notes.splice(noteIndex, 1);
          }
        });
        break;
      case 'updateNote':
        if (action.noteIndex >= 0 && action.noteIndex < notes.length) {
          notes[action.noteIndex] = { ...notes[action.noteIndex], ...action.newNote };
        }
        break;
      case 'updateMultipleNotes':
        action.updates.forEach(update => {
          if (update.noteIndex >= 0 && update.noteIndex < notes.length) {
            notes[update.noteIndex] = { ...notes[update.noteIndex], ...update.newNote };
          }
        });
        break;
      case 'splitNote':
        // splitNote: 두 노트를 하나로 합치기 (복원 시 원래 노트로 교체)
        // 주의: 히스토리 복원 시에는 순차적으로 적용되므로, splitNote 액션이 있으면 
        // 첫 번째 노트를 원래 노트로 교체하고, 두 번째 노트를 제거해야 함
        // 하지만 히스토리 복원은 순차적이므로, 여기서는 단순히 첫 번째 노트만 처리
        // 실제로는 splitNote가 적용되면 두 노트가 있으므로, noteIndex에서 두 노트를 찾아야 함
        // 하지만 복원 로직에서는 splitNote 자체를 undo하는 것이므로, 원래 노트 하나로 복원
        if (action.noteIndex < notes.length) {
          // 첫 번째 노트를 원래 노트로 교체
          notes[action.noteIndex] = { ...action.originalNote };
          // 두 번째 노트가 바로 다음에 있으면 제거
          if (action.noteIndex + 1 < notes.length) {
            notes.splice(action.noteIndex + 1, 1);
          }
        }
        break;
      case 'mergeNotes':
        // mergeNotes undo: 하나의 노트를 여러 노트로 분리
        // 히스토리 복원 시에는 병합된 노트를 원래 노트들로 교체
        if (action.noteIndices.length > 0) {
          const mergeIndex = action.noteIndices[0];
          if (mergeIndex < notes.length) {
            // 병합된 노트를 원래 노트들로 교체
            const originalNotes = action.originalNotes
              .sort((a, b) => a.index - b.index)
              .map(n => ({ ...n.note }));
            notes.splice(mergeIndex, 1, ...originalNotes);
          }
        }
        break;
    }
  }

  return notes;
}

/**
 * 히스토리 복제 (파트 복제 시 사용)
 */
export function cloneHistory(sourcePartId: string, targetPartId: string): void {
  const sourceHistory = midiPartHistories.get(sourcePartId);
  if (!sourceHistory) return;

  const clonedHistory: MidiPartHistory = {
    undoStack: sourceHistory.undoStack.map(action => {
      // 각 액션의 partId를 새 partId로 변경
      switch (action.type) {
        case 'addNote':
          return { ...action, partId: targetPartId };
        case 'addMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'removeNote':
          return { ...action, partId: targetPartId };
        case 'removeMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'updateNote':
          return { ...action, partId: targetPartId };
        case 'updateMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'splitNote':
          return { ...action, partId: targetPartId };
        case 'mergeNotes':
          return { ...action, partId: targetPartId };
      }
    }),
    redoStack: sourceHistory.redoStack.map(action => {
      switch (action.type) {
        case 'addNote':
          return { ...action, partId: targetPartId };
        case 'addMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'removeNote':
          return { ...action, partId: targetPartId };
        case 'removeMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'updateNote':
          return { ...action, partId: targetPartId };
        case 'updateMultipleNotes':
          return { ...action, partId: targetPartId };
        case 'splitNote':
          return { ...action, partId: targetPartId };
        case 'mergeNotes':
          return { ...action, partId: targetPartId };
      }
    }),
  };
  midiPartHistories.set(targetPartId, clonedHistory);
}

/**
 * 히스토리 삭제 (파트 삭제 시 사용)
 */
export function deleteHistory(partId: string): void {
  midiPartHistories.delete(partId);
}

// ---------------------------------------------------------------------------
// Reset helper (tests)
// ---------------------------------------------------------------------------
/**
 * 테스트를 위해 노트 히스토리를 초기화합니다.
 * 프로덕션 코드에서 직접 호출하지 마세요.
 */
export function resetNoteHistoryForTests(): void {
  midiPartHistories.clear();
}