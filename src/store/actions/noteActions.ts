/**
 * 노트 관련 액션들
 * 
 * 이 모듈은 MIDI 노트의 추가, 삭제, 수정, 분할, 병합 등의 작업을 담당합니다.
 * P1 리팩토링의 일부로 projectStore.ts에서 분리되었습니다.
 */

import type { MidiNote, MidiPart } from '../../types/project';
import { NOTE_MERGE_CONSTANTS } from '../../constants/ui';
import { getProject, findMidiPartById } from '../projectState';
import { notifyProjectChange, notifyMidiNoteChange } from '../projectEvents';
import { addHistoryEntry } from '../history/noteHistory';
import {
  getTimeSignature,
  measureToTicksPure
} from '../../utils/midiTickUtils';
import {
  getPpqn as getPpqnFromTiming
} from '../../domain/timing/timingUtils';

/**
 * ID로 MIDI 파트를 찾습니다 (인덱스 사용).
 * 
 * @param partId - 찾을 MIDI 파트의 ID
 * @returns 찾은 MIDI 파트 또는 undefined
 */
function findMidiPart(partId: string): MidiPart | undefined {
  return findMidiPartById(partId);
}

/**
 * 노트가 Tick 필드를 가지고 있는지 확인하고 보장하는 헬퍼 함수
 * SMF 표준 정합: Tick 필드만 확인
 * 
 * @param note - MIDI 노트
 * @returns Tick 필드가 보장된 노트
 * @throws {Error} Tick 필드가 없을 경우
 */
function ensureNoteHasTicks(note: MidiNote): MidiNote {
  // startTick과 durationTicks는 필수 필드
  if (note.startTick === undefined || note.durationTicks === undefined) {
    throw new Error('Note must have startTick and durationTicks fields');
  }
  
  return note;
}

/**
 * MIDI 파트 내부의 모든 노트를 가져옵니다.
 * 
 * @param partId - 노트를 가져올 MIDI 파트의 ID
 * @returns 노트 배열 (파트가 없으면 빈 배열)
 */
export const getMidiPartNotes = (partId: string): MidiNote[] => {
  const part = findMidiPart(partId);
  return part?.notes ? [...part.notes] : [];
};

/**
 * MIDI 파트에 노트를 추가합니다.
 * 
 * @param partId - 노트를 추가할 MIDI 파트의 ID
 * @param note - 추가할 MIDI 노트 객체 (startTick은 파트 기준 상대 위치)
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - note.startTick은 파트 내부의 상대 위치로 저장됩니다 (0부터 시작).
 * - 절대 위치 계산: part.startTick + note.startTick
 * - 미디파트가 이동하면 노트도 자동으로 함께 이동합니다 (파트 종속성).
 * - skipHistory가 false이면 노트 레벨 히스토리에 기록됩니다.
 * - 이벤트 디스플레이 히스토리에는 기록되지 않습니다 (노트 편집은 별도의 히스토리).
 */
export const addNoteToMidiPart = (partId: string, note: MidiNote, skipHistory = false): void => {
  const part = findMidiPart(partId);
  if (!part) return;
  
  // startTick과 durationTicks는 필수 (SMF 표준 정합)
  if (note.startTick === undefined || note.durationTicks === undefined) {
    console.warn('Note must have startTick and durationTicks fields');
    return;
  }
  
  // 노트 배열이 없으면 초기화
  if (!part.notes) {
    part.notes = [];
  }
  
  // 노트는 파트 내부의 상대 위치로 저장 (절대 위치 변환 제거)
  // Tick 필드 확인
  const noteWithTicks = ensureNoteHasTicks(note);
  part.notes.push(noteWithTicks);
  
  // 히스토리에 추가 (note-level history만, 이벤트 디스플레이 히스토리는 별개)
  if (!skipHistory) {
    addHistoryEntry(partId, { type: 'addNote', note: { ...noteWithTicks }, partId });
  }

  // 이벤트 디스플레이 히스토리에는 기록하지 않음 (노트 편집은 별도의 히스토리)
  notifyProjectChange({ type: 'midiPart' as const, partId });
  // 미디 노트 변경 이벤트 발행 (동기화용)
  const noteIndex = part.notes.length - 1;
  notifyMidiNoteChange({ type: 'add', partId, note: noteWithTicks, noteIndex });
};

/**
 * MIDI 파트 내의 노트를 업데이트합니다.
 * 
 * @param partId - 노트가 속한 MIDI 파트의 ID
 * @param noteIndex - 업데이트할 노트의 인덱스
 * @param updates - 업데이트할 노트 속성들 (부분 업데이트 가능)
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - 유효하지 않은 인덱스는 무시됩니다.
 * - skipHistory가 false이면 노트 레벨 히스토리에 기록됩니다.
 */
export const updateNoteInMidiPart = (partId: string, noteIndex: number, updates: Partial<MidiNote>, skipHistory = false): void => {
  const part = findMidiPart(partId);
  if (!part || !part.notes) return;
  
  if (noteIndex < 0 || noteIndex >= part.notes.length) return;
  
  const originalNote = part.notes[noteIndex];
  const updatedNote = { ...originalNote, ...updates };
  
  // Tick 또는 measure 필드 변경 시 양방향 동기화 (SMF 표준 정합, 호환성 레이어)
  const noteWithTicks = ensureNoteHasTicks(updatedNote);
  part.notes[noteIndex] = noteWithTicks;
  
  // 히스토리에 추가 (note-level history만, 이벤트 디스플레이 히스토리는 별개)
  if (!skipHistory) {
    addHistoryEntry(partId, {
      type: 'updateNote',
      noteIndex,
      oldNote: { ...originalNote },
      newNote: updates,
      partId
    });
  }

  // 이벤트 디스플레이 히스토리에는 기록하지 않음 (노트 편집은 별도의 히스토리)
  notifyProjectChange({ type: 'midiPart' as const, partId });
  // 미디 노트 변경 이벤트 발행 (동기화용)
  notifyMidiNoteChange({ type: 'update', partId, noteIndex, changes: updates });
};

/**
 * 여러 MIDI 노트를 한 번에 추가합니다.
 * 
 * @param partId - 노트가 속한 MIDI 파트의 ID
 * @param notes - 추가할 MIDI 노트 배열
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - 모든 노트의 startTick과 durationTicks는 필수입니다 (SMF 표준 정합).
 * - 히스토리에 하나의 액션으로 기록됩니다 (언두 시 모든 노트가 한 번에 제거됨).
 */
export const addMultipleNotesToMidiPart = (partId: string, notes: MidiNote[], skipHistory = false): void => {
  const part = findMidiPart(partId);
  if (!part) return;
  
  // 노트 배열이 없으면 초기화
  if (!part.notes) {
    part.notes = [];
  }
  
  // 유효한 노트만 필터링하고 Tick 필드 확인
  const validNotes: MidiNote[] = [];
  for (const note of notes) {
    if (note.startTick === undefined || note.durationTicks === undefined) {
      console.warn('Note must have startTick and durationTicks fields');
      continue;
    }
    const noteWithTicks = ensureNoteHasTicks(note);
    part.notes.push(noteWithTicks);
    validNotes.push(noteWithTicks);
  }
  
  // 히스토리에 추가 (note-level history만, 이벤트 디스플레이 히스토리는 별개)
  if (!skipHistory && validNotes.length > 0) {
    addHistoryEntry(partId, { type: 'addMultipleNotes', notes: validNotes.map(n => ({ ...n })), partId });
  }
  
  // 이벤트 디스플레이 히스토리에는 기록하지 않음 (노트 편집은 별도의 히스토리)
  if (validNotes.length > 0) {
    notifyProjectChange({ type: 'midiPart' as const, partId });
    // 미디 노트 변경 이벤트 발행 (동기화용)
    notifyMidiNoteChange({ type: 'addMultiple', partId, notes: validNotes });
  }
};

/**
 * MIDI 파트에서 노트를 삭제합니다.
 * 
 * @param partId - 노트가 속한 MIDI 파트의 ID
 * @param noteIndex - 삭제할 노트의 인덱스
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - 유효하지 않은 인덱스는 무시됩니다.
 * - skipHistory가 false이면 노트 레벨 히스토리에 기록됩니다.
 */
export const removeNoteFromMidiPart = (partId: string, noteIndex: number, skipHistory = false): void => {
  const part = findMidiPart(partId);
  if (!part || !part.notes) return;
  
  if (noteIndex < 0 || noteIndex >= part.notes.length) return;
  
  const noteToRemove = part.notes[noteIndex];
  
  // 히스토리에 추가 (note-level history만, 이벤트 디스플레이 히스토리는 별개)
  if (!skipHistory) {
    addHistoryEntry(partId, {
      type: 'removeNote',
      note: { ...noteToRemove },
      partId,
      noteIndex
    });
  }
  
  part.notes.splice(noteIndex, 1);
  // 이벤트 디스플레이 히스토리에는 기록하지 않음 (노트 편집은 별도의 히스토리)
  notifyProjectChange({ type: 'midiPart' as const, partId });
  // 미디 노트 변경 이벤트 발행 (동기화용)
  notifyMidiNoteChange({ type: 'remove', partId, noteIndex });
};

/**
 * MIDI 파트에서 여러 노트를 한 번에 삭제합니다.
 * 
 * @param partId - 노트를 삭제할 MIDI 파트의 ID
 * @param noteIndices - 삭제할 노트의 인덱스 배열 (역순 정렬 권장)
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - skipHistory가 false이면 히스토리에 하나의 액션으로 기록되어 언두/리두가 한 번에 처리됩니다.
 * - 인덱스는 역순으로 정렬되어 삭제되므로 인덱스 변경 문제가 없습니다.
 */
export const removeMultipleNotesFromMidiPart = (partId: string, noteIndices: number[], skipHistory = false): void => {
  const part = findMidiPart(partId);
  if (!part || !part.notes) return;
  
  // 유효한 인덱스만 필터링
  const validIndices = noteIndices
    .filter(index => index >= 0 && index < part.notes.length)
    .sort((a, b) => b - a); // 역순 정렬하여 삭제 시 인덱스 변경 문제 방지
  
  if (validIndices.length === 0) return;
  
  // 삭제할 노트와 인덱스 정보 수집 (역순 정렬된 인덱스 기준)
  const notesToRemove = validIndices.map(index => ({
    note: { ...part.notes[index] },
    noteIndex: index
  }));
  
  // 히스토리에 추가 (하나의 액션으로)
  if (!skipHistory) {
    addHistoryEntry(partId, {
      type: 'removeMultipleNotes',
      notes: notesToRemove,
      partId
    });
  }
  
  // 역순으로 삭제 (인덱스 변경 문제 방지)
  validIndices.forEach(index => {
    part.notes.splice(index, 1);
  });
  
  // 이벤트 디스플레이 히스토리에는 기록하지 않음 (노트 편집은 별도의 히스토리)
  notifyProjectChange({ type: 'midiPart' as const, partId });
  // 미디 노트 변경 이벤트 발행 (동기화용)
  notifyMidiNoteChange({ type: 'removeMultiple', partId, noteIndices: validIndices });
};

/**
 * MIDI 노트를 지정된 위치에서 분할합니다.
 * Tick 기반으로 작동하며, measure 파라미터는 호환성을 위해 유지됩니다 (SMF 표준 정합).
 * 
 * @param partId - 노트가 속한 MIDI 파트의 ID
 * @param noteIndex - 분할할 노트의 인덱스
 * @param splitMeasurePosition - 분할 위치 (파트 기준 상대 마디 위치, 호환성 유지)
 * @returns 분할된 두 노트의 인덱스 { firstNoteIndex, secondNoteIndex } 또는 null (실패 시)
 * 
 * @remarks
 * - splitMeasurePosition은 노트 내부 위치여야 합니다 (노트 시작과 끝 사이).
 * - 내부적으로 Tick 기반으로 계산하여 정밀도를 보장합니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 */
export const splitNote = (partId: string, noteIndex: number, splitMeasurePosition: number): { firstNoteIndex: number; secondNoteIndex: number } | null => {
  const part = findMidiPart(partId);
  if (!part || !part.notes) return null;
  
  if (noteIndex < 0 || noteIndex >= part.notes.length) return null;
  
  const note = ensureNoteHasTicks(part.notes[noteIndex]);
  
  // Tick 기반으로 계산 (SMF 표준 정합)
  // splitMeasurePosition을 Tick으로 변환 (파트 기준 상대 위치)
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqnFromTiming(project);
  const { startTick: splitTickRelative } = measureToTicksPure(
    splitMeasurePosition,
    0, // duration은 필요 없음
    timeSignature,
    ppqn
  );
  
  // 노트는 파트 내부의 상대 위치로 저장되어 있음
  const noteStartTickRelative = note.startTick; // 상대 위치
  const noteDurationTicks = note.durationTicks ?? 0;
  const noteEndTickRelative = noteStartTickRelative + noteDurationTicks;
  
  // splitTick이 노트 내부 위치인지 확인 (상대 위치 기준)
  if (splitTickRelative <= noteStartTickRelative || splitTickRelative >= noteEndTickRelative) {
    return null; // 유효하지 않은 분할 위치 (노트 내부가 아님)
  }
  
  // 첫 번째 노트: 분할 위치 이전까지 (상대 위치 유지)
  const firstNoteDurationTicks = splitTickRelative - noteStartTickRelative;
  const firstNoteBase: MidiNote = {
    ...note,
    startTick: noteStartTickRelative, // 상대 위치 유지
    durationTicks: firstNoteDurationTicks,
  };
  const firstNote = ensureNoteHasTicks(firstNoteBase);
  
  // 두 번째 노트: 분할 위치에서 시작 (상대 위치)
  const secondNoteStartTickRelative = splitTickRelative;
  const secondNoteDurationTicks = noteDurationTicks - firstNoteDurationTicks;
  const secondNoteBase: MidiNote = {
    ...note,
    startTick: secondNoteStartTickRelative, // 상대 위치
    durationTicks: secondNoteDurationTicks,
  };
  const secondNote = ensureNoteHasTicks(secondNoteBase);
  
  // 검증: 두 노트의 Tick 길이 합이 원본과 일치하는지 확인
  const totalDurationTicks = firstNoteDurationTicks + secondNoteDurationTicks;
  if (Math.abs(totalDurationTicks - noteDurationTicks) > 1) { // Tick은 정수이므로 1 이하 오차 허용
    console.error('Split note duration mismatch', { 
      noteDurationTicks, 
      firstNoteDurationTicks, 
      secondNoteDurationTicks, 
      totalDurationTicks 
    });
    return null;
  }
  
  // 히스토리에 추가 (하나의 액션으로)
  addHistoryEntry(partId, {
    type: 'splitNote',
    noteIndex,
    originalNote: { ...note },
    firstNote: { ...firstNote },
    secondNote: { ...secondNote },
    partId
  });
  
  // 노트를 첫 번째 노트로 교체
  part.notes[noteIndex] = firstNote;
  
  // 두 번째 노트 추가 (첫 번째 노트 바로 다음에)
  part.notes.splice(noteIndex + 1, 0, secondNote);
  
  notifyProjectChange({ type: 'midiPart' as const, partId });
  
  return { firstNoteIndex: noteIndex, secondNoteIndex: noteIndex + 1 };
};

/**
 * 같은 피치이고 시간적으로 인접한 노트들을 하나로 병합합니다.
 * Tick 기반으로 작동합니다 (SMF 표준 정합).
 * 
 * @param partId - 노트들이 속한 MIDI 파트의 ID
 * @param noteIndices - 병합할 노트 인덱스 배열 (최소 2개 필요)
 * @returns 병합된 노트의 인덱스 { mergedNoteIndex } 또는 null (실패 시)
 * 
 * @remarks
 * - 같은 피치(note)여야 합니다.
 * - 시간적으로 인접해야 합니다 (겹치거나 작은 간격 이내).
 * - 최대 간격은 NOTE_MERGE_CONSTANTS.MAX_GAP_FOR_MERGE로 설정됩니다.
 * - 내부적으로 Tick 기반으로 계산하여 정밀도를 보장합니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 */
export const mergeNotes = (partId: string, noteIndices: number[]): { mergedNoteIndex: number } | null => {
  const part = findMidiPart(partId);
  if (!part || !part.notes) {
    return null;
  }
  
  if (noteIndices.length < 2) {
    return null; // 최소 2개 노트 필요
  }
  
  // 유효한 인덱스 확인
  const validIndices = noteIndices
    .filter(index => index >= 0 && index < part.notes.length)
    .sort((a, b) => a - b);
  
  if (validIndices.length < 2) {
    return null;
  }
  
  // 같은 피치인지 확인
  const firstNote = part.notes[validIndices[0]];
  const samePitch = validIndices.every(index => part.notes[index].note === firstNote.note);
  if (!samePitch) {
    return null; // 같은 피치가 아니면 병합 불가
  }
  
  // Tick 기반으로 정렬 및 검증 (SMF 표준 정합)
  // 노트들을 Tick 기준으로 정렬
  const notesToMerge = validIndices
    .map(index => ({ 
      index, 
      note: ensureNoteHasTicks(part.notes[index])
    }))
    .sort((a, b) => {
      // Tick 기반 정렬
      return a.note.startTick - b.note.startTick;
    });
  
  // 시간적으로 인접한지 확인 (Tick 기반)
  const MAX_GAP_FOR_MERGE = NOTE_MERGE_CONSTANTS.MAX_GAP_FOR_MERGE;
  // 프로젝트에서 timing 정보 가져오기
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqnFromTiming(project);
  // MAX_GAP_FOR_MERGE를 Tick으로 변환
  const { durationTicks: maxGapTicks } = measureToTicksPure(
    0,
    MAX_GAP_FOR_MERGE,
    timeSignature,
    ppqn
  );
  
  for (let i = 1; i < notesToMerge.length; i++) {
    const prevNote = notesToMerge[i - 1].note;
    const currNote = notesToMerge[i].note;
    
    // Tick 기반으로 계산
    const prevNoteStartTick = prevNote.startTick;
    const prevNoteDurationTicks = prevNote.durationTicks;
    const prevNoteEndTick = prevNoteStartTick + prevNoteDurationTicks;
    
    const currNoteStartTick = currNote.startTick;
    const gapTicks = currNoteStartTick - prevNoteEndTick;
    
    // 이전 노트가 끝나기 전에 다음 노트가 시작하거나, 작은 간격 이내여야 함
    if (gapTicks > maxGapTicks) {
      return null; // 간격이 너무 크면 병합 불가
    }
  }
  
  // 병합된 노트 생성 (Tick 기반)
  const firstNoteInTime = notesToMerge[0].note;
  const lastNoteInTime = notesToMerge[notesToMerge.length - 1].note;
  
  const firstNoteStartTick = firstNoteInTime.startTick;
  const lastNoteStartTick = lastNoteInTime.startTick;
  const lastNoteDurationTicks = lastNoteInTime.durationTicks;
  const lastNoteEndTick = lastNoteStartTick + lastNoteDurationTicks;
  
  // 병합된 노트: 첫 번째 노트의 시작부터 마지막 노트의 끝까지
  const mergedNoteStartTick = firstNoteStartTick;
  const mergedNoteDurationTicks = lastNoteEndTick - mergedNoteStartTick;
  
  const mergedNoteBase: MidiNote = {
    ...firstNoteInTime,
    startTick: mergedNoteStartTick,
    durationTicks: mergedNoteDurationTicks,
  };
  const mergedNote = ensureNoteHasTicks(mergedNoteBase);
  
  // 히스토리에 추가 (하나의 액션으로)
  const originalNotes = notesToMerge.map(({ index, note }) => ({ index, note: { ...note } }));
  
  addHistoryEntry(partId, {
    type: 'mergeNotes',
    noteIndices: validIndices,
    originalNotes,
    mergedNote: { ...mergedNote },
    partId
  });
  
  // 첫 번째 노트를 병합된 노트로 교체
  const firstIndexInArray = validIndices[0];
  part.notes[firstIndexInArray] = mergedNote;
  
  // 나머지 노트들 삭제 (역순으로 삭제하여 인덱스 문제 방지)
  for (let i = validIndices.length - 1; i >= 1; i--) {
    part.notes.splice(validIndices[i], 1);
  }
  
  notifyProjectChange({ type: 'midiPart' as const, partId });
  
  return { mergedNoteIndex: firstIndexInArray };
};

/**
 * MIDI 노트의 길이를 조절합니다.
 * measureDuration 파라미터를 받지만 내부적으로 Tick 기반으로 작동합니다 (SMF 표준 정합, 호환성 레이어).
 * 
 * @param partId - 노트가 속한 MIDI 파트의 ID
 * @param noteIndex - 리사이즈할 노트의 인덱스
 * @param newMeasureDuration - 새로운 마디 단위 길이 (호환성 유지)
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - newMeasureDuration이 0 이하면 무시됩니다.
 * - 내부적으로 Tick으로 변환하여 정밀도를 보장합니다.
 * - updateNoteInMidiPart를 내부적으로 사용합니다.
 */
export const resizeNote = (partId: string, noteIndex: number, newMeasureDuration: number, skipHistory = false): void => {
  if (newMeasureDuration <= 0) return; // 유효하지 않은 길이
  
  const part = findMidiPart(partId);
  if (!part || !part.notes) return;
  
  if (noteIndex < 0 || noteIndex >= part.notes.length) return;
  
  // measureDuration을 Tick으로 변환하여 업데이트 (UI 입력 변환)
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqnFromTiming(project);
  const { durationTicks: newDurationTicks } = measureToTicksPure(
    0, // start는 필요 없음
    newMeasureDuration,
    timeSignature,
    ppqn
  );
  
  // Tick 기반으로 업데이트
  updateNoteInMidiPart(partId, noteIndex, { 
    durationTicks: newDurationTicks
  }, skipHistory);
};

