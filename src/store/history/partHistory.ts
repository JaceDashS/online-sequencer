/**
 * 파트 레벨 히스토리 관리
 * 파트 추가, 삭제, 이동, 리사이즈, 스플릿, 머지, 복제 등의 작업을 관리합니다.
 */

import type { MidiPart } from '../../types/project';

// 이벤트 디스플레이 히스토리 액션 타입 (파트 추가, 삭제, 이동, 리사이즈, 스플릿, 머지, 복제 등. 노트 편집은 제외)
export type MidiPartLevelAction =
  | { type: 'addPart'; part: MidiPart }
  | { type: 'removePart'; part: MidiPart }
  | { type: 'removeMultipleParts'; parts: MidiPart[] }
  | { type: 'updatePart'; partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }
  | { type: 'updateMultipleParts'; updates: Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> }
  | { type: 'splitPart'; originalPart: MidiPart; firstPart: MidiPart; secondPart: MidiPart }
  | { type: 'mergeParts'; originalParts: MidiPart[]; mergedPart: MidiPart }
  | { type: 'clonePart'; originalPartId: string; clonedPart: MidiPart }
  | { type: 'cloneMultipleParts'; clones: Array<{ originalPartId: string; clonedPart: MidiPart }> };

export type MidiPartLevelHistory = {
  undoStack: MidiPartLevelAction[];
  redoStack: MidiPartLevelAction[];
};

// 이벤트 디스플레이 히스토리 (파트 레벨 작업용: 파트 추가, 삭제, 이동, 리사이즈, 스플릿, 머지, 복제 등. 노트 편집 언두와 별개)
const midiPartLevelHistory: MidiPartLevelHistory = {
  undoStack: [],
  redoStack: [],
};

import { HISTORY_CONSTANTS } from '../../constants/ui';

const MAX_PART_LEVEL_HISTORY = HISTORY_CONSTANTS.MAX_PART_LEVEL_HISTORY;

// 지연된 히스토리를 즉시 추가하는 콜백 (EventDisplay에서 설정)
let flushPendingHistoryCallback: (() => void) | null = null;

/**
 * 파트 레벨 히스토리 가져오기
 */
export function getPartLevelHistory(): MidiPartLevelHistory {
  return midiPartLevelHistory;
}

/**
 * 파트 레벨 히스토리에 액션 추가
 */
export function addPartLevelHistoryEntry(action: MidiPartLevelAction): void {
  midiPartLevelHistory.undoStack.push(action);
  midiPartLevelHistory.redoStack.length = 0; // Redo 스택 초기화
  if (midiPartLevelHistory.undoStack.length > MAX_PART_LEVEL_HISTORY) {
    midiPartLevelHistory.undoStack.shift();
  }
}

/**
 * 지연된 히스토리 플러시 콜백 설정
 */
export function setFlushPendingHistoryCallback(callback: (() => void) | null): void {
  flushPendingHistoryCallback = callback;
}

/**
 * 지연된 히스토리 즉시 플러시
 */
export function flushPendingHistory(): void {
  if (flushPendingHistoryCallback) {
    flushPendingHistoryCallback();
  }
}

/**
 * 히스토리 엔트리 준비 (드래그 등에서 사용)
 * 이 함수는 projectStore에서 구현되어야 함 (currentProject 접근 필요)
 * 여기서는 타입만 export
 */
export type PrepareHistoryEntriesInput = Array<{ partId: string; updates: Partial<MidiPart> }>;
export type PrepareHistoryEntriesOutput = Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }>;

// ---------------------------------------------------------------------------
// Reset helper (tests)
// ---------------------------------------------------------------------------
/**
 * 테스트를 위해 파트 히스토리를 초기화합니다.
 * 프로덕션 코드에서 직접 호출하지 마세요.
 */
export function resetPartHistoryForTests(): void {
  midiPartLevelHistory.undoStack.length = 0;
  midiPartLevelHistory.redoStack.length = 0;
  flushPendingHistoryCallback = null;
}