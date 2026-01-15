/**
 * MIDI 파트 관련 액션들
 * 
 * 이 모듈은 MIDI 파트의 추가, 삭제, 수정, 분할, 병합, 복제 등의 작업을 담당합니다.
 * Phase 4 리팩토링의 일부로 projectStore.ts에서 분리되었습니다.
 */

import type { MidiPart, MidiNote, MidiControlChange } from '../types/project';
import { getProject, addMidiPartToProject, removeMidiPartFromProject, removeMultipleMidiPartsFromProject, findMidiPartById, updateMidiPartInIndex } from './projectState';
import { notifyProjectChange, notifyMidiPartChange } from './projectEvents';
import { getMidiPartHistory, cloneHistory as cloneNoteHistory } from './history/noteHistory';
import { addPartLevelHistoryEntry } from './history/partHistory';
import { 
  getTimeSignature,
  getPpqn,
  measureToTicksPure,
  ticksToMeasurePure
} from '../utils/midiTickUtils';

/**
 * MIDI 파트를 프로젝트에 추가합니다.
 * 
 * @param part - 추가할 MIDI 파트 객체
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - startTick과 durationTicks가 필수입니다 (SMF 표준 정합).
 * - 레거시 데이터는 로드 시점에 migrateProjectAtLoad에서 마이그레이션되어야 합니다.
 * - 파트 생성 시 고유의 히스토리 리스트가 자동으로 생성됩니다.
 * - skipHistory가 false이면 파트 레벨 히스토리에 기록됩니다.
 * 
 * @throws {Error} startTick 또는 durationTicks가 없을 경우
 */
export const addMidiPart = (part: MidiPart, skipHistory = false): void => {
  // startTick과 durationTicks는 필수 (레거시 데이터는 로드 시점에 마이그레이션되어야 함)
  if (part.startTick === undefined || part.durationTicks === undefined) {
    throw new Error('MidiPart must have startTick and durationTicks. Legacy parts should be migrated at load time via migrateProjectAtLoad.');
  }
  
  const partToAdd = part;
  
  // 노트 배열이 없으면 초기화
  if (!partToAdd.notes) {
    partToAdd.notes = [];
  }
  
  // 노트들의 startTick과 durationTicks 체크
  if (partToAdd.notes && Array.isArray(partToAdd.notes)) {
    partToAdd.notes.forEach(note => {
      if (note.startTick === undefined || note.durationTicks === undefined) {
        // 개발 환경에서만 경고 출력
        if (import.meta.env?.DEV) {
          console.warn('Note must have startTick and durationTicks');
        }
      }
    });
  }
  
  // 미디파트 생성 시 고유의 히스토리 리스트 생성 (설계 요구사항)
  // getMidiPartHistory는 호출 시 히스토리가 없으면 자동으로 생성하므로 명시적으로 호출
  getMidiPartHistory(partToAdd.id);
  
  // 히스토리에 추가 (이벤트 디스플레이 히스토리) - 노트는 그대로 포함 (파트 추가 시에는 노트가 있어야 함)
  if (!skipHistory) {
    // NOTE: historyIndex는 "삭제 감지 시점"에만 기록한다 (사용자 설계)
    const partToSave = structuredClone(partToAdd);
    addPartLevelHistoryEntry({ type: 'addPart', part: partToSave });
  }

  // 프로젝트에 파트 추가
  addMidiPartToProject(partToAdd);
  notifyProjectChange({ type: 'midiPart' as const, partId: partToAdd.id });
  // 미디파트 변경 이벤트 발행 (동기화용)
  notifyMidiPartChange({ type: 'add', part: structuredClone(partToAdd) });
};

/**
 * MIDI 파트를 프로젝트에서 삭제합니다.
 * 
 * @param partId - 삭제할 MIDI 파트의 ID
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - 파트 삭제 시 히스토리는 유지됩니다 (리두 시 노트 상태 복원에 필요).
 * - skipHistory가 false이면 파트 레벨 히스토리에 기록됩니다.
 */
export const removeMidiPart = (partId: string, skipHistory = false): void => {
  const part = findMidiPartById(partId);
  if (!part) return;
  
  // 히스토리에 추가 (파트 레벨 언두)
  if (!skipHistory) {
    const deleteDetectedHistoryIndex = getMidiPartHistory(partId).undoStack.length;
    const partToSave = structuredClone(part);
    // 삭제 감지 시점에만 historyIndex 기록 (사용자 설계)
    partToSave.historyIndex = deleteDetectedHistoryIndex;
    addPartLevelHistoryEntry({ type: 'removePart', part: partToSave });
  }
  
  removeMidiPartFromProject(partId);
  
  // 히스토리는 유지 (리두 시 노트 상태 복원에 필요)
  // deleteNoteHistory(partId); // 제거: 파트 삭제 시에도 히스토리는 유지되어야 함
  
  notifyProjectChange({ type: 'midiPart' as const, partId });
  // 미디파트 변경 이벤트 발행 (동기화용)
  notifyMidiPartChange({ type: 'remove', partId });
};

/**
 * MIDI 파트를 업데이트합니다.
 * 
 * @param partId - 업데이트할 MIDI 파트의 ID
 * @param updates - 업데이트할 파트 속성들 (부분 업데이트 가능)
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - startTick과 durationTicks만 업데이트합니다 (SMF 표준 정합).
 * - 레거시 measureStart/measureDuration은 지원하지 않습니다 (로드 시점에 마이그레이션되어야 함).
 * - 이벤트 디스플레이 히스토리에는 노트 편집이 포함되지 않습니다.
 * - notes가 포함된 업데이트는 히스토리에 기록되지 않습니다 (리사이즈 시 노트 위치 조정용).
 * - skipHistory가 false이면 파트 레벨 히스토리에 기록됩니다.
 */
export const updateMidiPart = (partId: string, updates: Partial<MidiPart>, skipHistory = false): void => {
  const part = findMidiPartById(partId);
  if (!part) return;
  
  // 히스토리에 추가 (이벤트 디스플레이 히스토리) - 변경 전 상태 저장 (노트 제외)
  let oldPart: MidiPart | undefined;
  if (!skipHistory) {
    // 노트를 제외한 파트 정보만 저장 (이벤트 디스플레이 히스토리는 노트 편집을 포함하지 않음)
    const { notes, ...partWithoutNotes } = part;
    oldPart = {
      ...structuredClone(partWithoutNotes),
      notes: [] // 노트는 히스토리에 저장하지 않음 (언두 시 현재 노트를 유지)
    };
  }
  
  // updates에서 notes를 제외하고 업데이트 (노트는 별도로 처리)
  const { notes: updatedNotes, ...updatesWithoutNotes } = updates;
  
  // 이전 파트 정보 저장 (인덱스 업데이트용)
  const previousPart = { ...part };
  
  // startTick, durationTicks, trackId 업데이트
  if (updatesWithoutNotes.startTick !== undefined) {
    part.startTick = updatesWithoutNotes.startTick;
  }
  
  if (updatesWithoutNotes.durationTicks !== undefined) {
    part.durationTicks = updatesWithoutNotes.durationTicks;
  }
  
  if (updatesWithoutNotes.trackId !== undefined) {
    part.trackId = updatesWithoutNotes.trackId;
  }

  if (updatesWithoutNotes.controlChanges !== undefined) {
    part.controlChanges = updatesWithoutNotes.controlChanges;
  }
  
  // notes가 있으면 직접 할당 (리사이즈 시 노트 위치 조정용)
  if (updatedNotes !== undefined) {
    part.notes = updatedNotes;
  }
  
  // 인덱스 업데이트 (trackId 변경 시 트랙별 인덱스도 업데이트)
  // 업데이트가 적용된 후 part 객체가 이미 변경되었으므로, 이전 상태와 현재 상태를 비교하여 인덱스 업데이트
  if (updatesWithoutNotes.trackId !== undefined || updatesWithoutNotes.startTick !== undefined || updatesWithoutNotes.durationTicks !== undefined) {
    updateMidiPartInIndex(partId, previousPart, part);
  }
  
  // 히스토리에 추가 (notes 제외, 이벤트 디스플레이 히스토리는 노트 편집을 포함하지 않음)
  if (!skipHistory && oldPart) {
    // notes가 포함된 업데이트인 경우 히스토리에 기록하지 않음 (리사이즈 시 노트 위치 조정은 노트 편집이므로 별도의 히스토리)
    // startTick과 durationTicks 변경만 기록 (SMF 표준 정합)
    addPartLevelHistoryEntry({ 
      type: 'updatePart', 
      partId, 
      oldPart, 
      newPart: updatesWithoutNotes 
    });
  }
  
  notifyProjectChange({ type: 'midiPart' as const, partId });
  
  // 미디파트 변경 이벤트 발행 (동기화용)
  // startTick 변경 시 move 이벤트
  if (updatesWithoutNotes.startTick !== undefined) {
    notifyMidiPartChange({ type: 'move', partId, newStartTick: part.startTick });
  }
  // durationTicks 변경 시 resize 이벤트
  else if (updatesWithoutNotes.durationTicks !== undefined) {
    notifyMidiPartChange({ type: 'resize', partId, newDurationTicks: part.durationTicks });
  }
  // 기타 업데이트
  else if (Object.keys(updatesWithoutNotes).length > 0) {
    notifyMidiPartChange({ type: 'update', partId, changes: updatesWithoutNotes });
  }
};

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
 * ID로 MIDI 파트를 찾습니다 (인덱스 사용).
 * 
 * @param partId - 찾을 MIDI 파트의 ID
 * @returns 찾은 MIDI 파트 또는 undefined
 */
export const findMidiPart = (partId: string): MidiPart | undefined => {
  return findMidiPartById(partId);
};

/**
 * 여러 MIDI 파트를 한 번에 삭제합니다.
 * 히스토리에 하나의 액션으로 기록됩니다.
 * 
 * @param partIds - 삭제할 MIDI 파트 ID 배열
 * 
 * @remarks
 * - 각 파트의 historyIndex가 기록되어 리두 시 개별적으로 복원할 수 있습니다.
 * - 빈 배열이면 아무 작업도 수행하지 않습니다.
 */
export const removeMultipleMidiParts = (partIds: string[]): void => {
  if (partIds.length === 0) return;
  
  // 인덱스 사용으로 변경
  const partsToRemove = partIds
    .map(partId => findMidiPartById(partId))
    .filter((part): part is MidiPart => part !== undefined);
  
  if (partsToRemove.length === 0) return;
  
  // 각 파트의 historyIndex 기록
  const partsToSave = partsToRemove.map(part => {
    const deleteDetectedHistoryIndex = getMidiPartHistory(part.id).undoStack.length;
    const partToSave = structuredClone(part);
    partToSave.historyIndex = deleteDetectedHistoryIndex;
    return partToSave;
  });
  
  // 히스토리에 하나의 액션으로 추가
  addPartLevelHistoryEntry({ type: 'removeMultipleParts', parts: partsToSave });
  
  // 모든 파트 삭제
  const partIdsSet = new Set(partIds);
  removeMultipleMidiPartsFromProject(partIdsSet);
  
  // 모든 파트에 대해 변경 알림
  partIds.forEach(partId => {
    notifyProjectChange({ type: 'midiPart' as const, partId });
  });
};

/**
 * 여러 MIDI 파트를 한 번에 업데이트합니다.
 * 드래그 등에서 사용되며, 히스토리를 하나의 액션으로 묶습니다.
 * 
 * @param updates - 업데이트할 파트 정보 배열 [{ partId, updates }, ...]
 * @param skipHistory - 히스토리 기록을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * - 빈 배열이면 아무 작업도 수행하지 않습니다.
 * - 히스토리에 하나의 액션으로 기록되어 언두/리두가 한 번에 처리됩니다.
 */
export const updateMultipleMidiParts = (updates: Array<{ partId: string; updates: Partial<MidiPart> }>, skipHistory = false): void => {
  if (updates.length === 0) return;
  
  // 히스토리에 추가할 데이터 준비 (변경 전 상태 저장, 노트 제외)
  const historyEntries: Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> = [];
  
  if (!skipHistory) {
    for (const { partId, updates: partUpdates } of updates) {
      const part = findMidiPart(partId);
      if (!part) continue;
      
      // 노트를 제외한 파트 정보만 저장 (notes는 빈 배열로 설정하여 타입 호환성 유지)
      const { notes, ...partWithoutNotes } = part;
      const oldPart: MidiPart = {
        ...structuredClone(partWithoutNotes),
        notes: [] // 노트는 히스토리에 저장하지 않음 (언두 시 현재 노트를 유지)
      };
      
      // updates에서도 notes를 제외
      const { notes: updatedNotes, ...updatesWithoutNotes } = partUpdates;
      historyEntries.push({ partId, oldPart, newPart: updatesWithoutNotes });
    }
  }
  
  // 실제 업데이트 수행
  for (const { partId, updates: partUpdates } of updates) {
    const part = findMidiPart(partId);
    if (!part) continue;
    
    // 이전 파트 정보 저장 (인덱스 업데이트용)
    const previousPart = { ...part };
    
    // updates에서 notes를 제외하고 업데이트
    const { notes: updatedNotes, ...updatesWithoutNotes } = partUpdates;
    
    // startTick, durationTicks, trackId 업데이트
    if (updatesWithoutNotes.startTick !== undefined) {
      part.startTick = updatesWithoutNotes.startTick;
    }
    
    if (updatesWithoutNotes.durationTicks !== undefined) {
      part.durationTicks = updatesWithoutNotes.durationTicks;
    }
    
    if (updatesWithoutNotes.trackId !== undefined) {
      part.trackId = updatesWithoutNotes.trackId;
    }

    if (updatesWithoutNotes.controlChanges !== undefined) {
      part.controlChanges = updatesWithoutNotes.controlChanges;
    }
    
    // notes는 업데이트하지 않음 (이벤트 디스플레이 히스토리는 노트를 포함하지 않음)
    
    // 인덱스 업데이트 (trackId 변경 시 트랙별 인덱스도 업데이트)
    if (updatesWithoutNotes.trackId !== undefined || updatesWithoutNotes.startTick !== undefined || updatesWithoutNotes.durationTicks !== undefined) {
      updateMidiPartInIndex(partId, previousPart, part);
    }
    
    notifyProjectChange({ type: 'midiPart' as const, partId });
    
    if (updatesWithoutNotes.startTick !== undefined) {
      notifyMidiPartChange({ type: 'move', partId, newStartTick: part.startTick });
    } else if (updatesWithoutNotes.durationTicks !== undefined) {
      notifyMidiPartChange({ type: 'resize', partId, newDurationTicks: part.durationTicks });
    } else if (Object.keys(updatesWithoutNotes).length > 0) {
      notifyMidiPartChange({ type: 'update', partId, changes: updatesWithoutNotes });
    }
  }
  
  // 히스토리에 추가 (하나의 액션으로)
  if (!skipHistory && historyEntries.length > 0) {
    addPartLevelHistoryEntry({
      type: 'updateMultipleParts',
      updates: historyEntries
    });
  }
};

/**
 * 파트 레벨 히스토리 엔트리를 준비합니다.
 * 지연된 히스토리 기록에 사용됩니다.
 * 
 * @param updates - 업데이트할 파트 정보 배열 [{ partId, updates }, ...]
 * @returns 히스토리 엔트리 배열 [{ partId, oldPart, newPart }, ...]
 * 
 * @remarks
 * - 노트는 히스토리에 저장되지 않습니다 (이벤트 디스플레이 히스토리는 노트 편집을 포함하지 않음).
 * - 실제 히스토리 기록은 addPartLevelHistoryEntry를 사용하세요.
 */
export const preparePartLevelHistoryEntries = (
  updates: Array<{ partId: string; updates: Partial<MidiPart> }>
): Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> => {
  const historyEntries: Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> = [];
  
  for (const { partId, updates: partUpdates } of updates) {
    const part = findMidiPart(partId);
    if (!part) continue;
    
    // 노트를 제외한 파트 정보만 저장
    const { notes, ...partWithoutNotes } = part;
    const oldPart: MidiPart = {
      ...structuredClone(partWithoutNotes),
      notes: [] // 노트는 히스토리에 저장하지 않음
    };
    
    // updates에서도 notes를 제외
    const { notes: updatedNotes, ...updatesWithoutNotes } = partUpdates;
    historyEntries.push({ partId, oldPart, newPart: updatesWithoutNotes });
  }
  
  return historyEntries;
};

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
export const splitMidiPart = (partId: string, splitMeasurePosition: number): { firstPartId: string; secondPartId: string } | null => {
  const part = findMidiPartById(partId);
  if (!part) return null;
  
  // 파트의 durationTicks를 measure로 변환하여 검증
  const project = getProject();
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqn(project);
  const { measureDuration } = ticksToMeasurePure(0, part.durationTicks, timeSignature, ppqn);
  
  // splitMeasurePosition은 파트 기준 상대 위치 (0 ~ part.durationTicks를 measure로 변환한 값)
  if (splitMeasurePosition <= 0 || splitMeasurePosition >= measureDuration) {
    return null; // 유효하지 않은 분할 위치
  }
  
  // 파트의 startTick 사용 (절대 위치)
  const partStartTick = part.startTick;
  
  // splitMeasurePosition을 Tick으로 변환 (파트 기준 상대)
  const { startTick: splitTickRelative } = measureToTicksPure(
    splitMeasurePosition,
    0, // duration은 필요 없음
    timeSignature,
    ppqn
  );
  
  // 분할 위치의 절대 Tick 위치
  const splitTickAbsolute = partStartTick + splitTickRelative;
  
  // 첫 번째 파트: 새로 생성 (undo/redo 히스토리를 별도로 관리하기 위해)
  const firstPartStartTick = partStartTick;
  const firstPartDurationTicks = splitTickRelative;
  // 첫 번째 파트의 노트: 분할 위치 이전에 끝나는 노트만 포함 (클리핑된 노트 포함)
  // 노트는 파트 내부의 상대 위치로 저장되어 있음
  const firstPartNotes = part.notes
    .map(note => {
      const noteWithTicks = ensureNoteHasTicks(note);
      const noteStartTickRelative = noteWithTicks.startTick; // 상대 위치
      const noteDurationTicks = noteWithTicks.durationTicks;
      const noteEndTickRelative = noteStartTickRelative + noteDurationTicks;
      
      if (noteEndTickRelative <= 0) {
        // 파트 시작 이전에 끝나는 노트는 제외
        return null;
      } else if (noteEndTickRelative <= splitTickRelative) {
        // 분할 위치 이전에 끝나는 노트는 그대로 포함 (상대 위치 유지)
        return noteWithTicks;
      } else if (noteStartTickRelative < splitTickRelative) {
        // 분할 위치를 넘어가는 노트: 클리핑 (상대 위치 유지, 길이만 조정)
        const clippedNoteBase: MidiNote = {
          ...noteWithTicks,
          startTick: noteStartTickRelative, // 상대 위치 유지
          durationTicks: splitTickRelative - noteStartTickRelative,
        };
        return ensureNoteHasTicks(clippedNoteBase);
      } else {
        // 분할 위치 이후에 시작하는 노트는 첫 번째 파트에 포함하지 않음
        return null;
      }
    })
    .filter((note): note is MidiNote => note !== null);
  
  // 두 번째 파트: 새로 생성
  const secondPartStartTick = splitTickAbsolute;
  const secondPartDurationTicks = part.durationTicks - splitTickRelative;
  const secondPartNotes = part.notes
    .map(note => {
      // 노트는 파트 내부의 상대 위치로 저장되어 있음
      const noteWithTicks = ensureNoteHasTicks(note);
      const noteStartTickRelative = noteWithTicks.startTick; // 상대 위치
      const noteDurationTicks = noteWithTicks.durationTicks;
      const noteEndTickRelative = noteStartTickRelative + noteDurationTicks;
      
      if (noteEndTickRelative <= splitTickRelative) {
        // 첫 번째 파트에만 속함
        return null;
      } else if (noteStartTickRelative >= splitTickRelative) {
        // 두 번째 파트에만 속함: 상대 위치 변환 (새 파트 기준으로)
        const newRelativeStartTick = noteStartTickRelative - splitTickRelative;
        const adjustedNoteBase: MidiNote = {
          ...noteWithTicks,
          startTick: newRelativeStartTick, // 새 파트 기준 상대 위치
        };
        return ensureNoteHasTicks(adjustedNoteBase);
      } else {
        // 분할 위치를 넘어가는 노트: 두 번째 파트에도 복사 (새 파트 기준 상대 위치, 시작 위치와 길이 조정)
        const clippedNoteBase: MidiNote = {
          ...noteWithTicks,
          startTick: 0, // 새 파트의 시작 위치에서 시작 (상대 위치)
          durationTicks: noteEndTickRelative - splitTickRelative,
        };
        return ensureNoteHasTicks(clippedNoteBase);
      }
    })
    .filter((note): note is MidiNote => note !== null);
  const controlChanges = part.controlChanges ?? [];
  const firstPartControlChanges: MidiControlChange[] = [];
  const secondPartControlChanges: MidiControlChange[] = [];
  let lastSustainValue: MidiControlChange | null = null;

  const sortedControlChanges = [...controlChanges].sort((a, b) => a.tick - b.tick);
  for (const cc of sortedControlChanges) {
    if (cc.tick < splitTickRelative) {
      firstPartControlChanges.push({ ...cc });
      if (cc.controller === 64) {
        lastSustainValue = cc;
      }
    } else {
      secondPartControlChanges.push({
        ...cc,
        tick: cc.tick - splitTickRelative,
      });
    }
  }

  if (lastSustainValue && lastSustainValue.value >= 64) {
    const sustainChannel = lastSustainValue.channel ?? 0;
    firstPartControlChanges.push({
      tick: splitTickRelative,
      controller: 64,
      value: 0,
      channel: sustainChannel,
    });
    secondPartControlChanges.unshift({
      tick: 0,
      controller: 64,
      value: 127,
      channel: sustainChannel,
    });
  }

  firstPartControlChanges.sort((a, b) => a.tick - b.tick);
  secondPartControlChanges.sort((a, b) => a.tick - b.tick);
  
  // 첫 번째 파트 생성
  const firstPartId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const firstPart: MidiPart = {
    id: firstPartId,
    trackId: part.trackId,
    startTick: firstPartStartTick,
    durationTicks: firstPartDurationTicks,
    notes: firstPartNotes,
    controlChanges: firstPartControlChanges.length ? firstPartControlChanges : undefined,
  };
  
  // 두 번째 파트 생성
  const secondPartId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const secondPart: MidiPart = {
    id: secondPartId,
    trackId: part.trackId,
    startTick: secondPartStartTick,
    durationTicks: secondPartDurationTicks,
    notes: secondPartNotes,
    controlChanges: secondPartControlChanges.length ? secondPartControlChanges : undefined,
  };
  
  // 히스토리에 추가 (파트 레벨 언두)
  const originalPart = structuredClone(part);
  addPartLevelHistoryEntry({
    type: 'splitPart',
    originalPart,
    firstPart: structuredClone(firstPart),
    secondPart: structuredClone(secondPart)
  });
  
  // 원본 파트 삭제 (히스토리 기록 제외)
  removeMidiPart(partId, true);
  
  // 두 개의 새 파트 추가 (히스토리 기록 제외)
  addMidiPart(firstPart, true);
  addMidiPart(secondPart, true);
  
  return { firstPartId, secondPartId };
};

/**
 * 여러 MIDI 파트를 하나로 병합합니다.
 * 
 * @param partIds - 병합할 MIDI 파트 ID 배열 (최소 2개 필요)
 * @returns 병합된 파트의 ID { mergedPartId } 또는 null (실패 시)
 * 
 * @remarks
 * - 같은 트랙에 속한 파트만 병합 가능합니다.
 * - 모든 파트의 시작점과 끝점을 확인하여 가장 먼저인 점과 가장 나중인 점을 기준으로 병합됩니다.
 * - 파트1이 파트2를 감싸고 있는 경우 (파트1의 시작 < 파트2의 시작, 파트1의 끝 > 파트2의 끝),
 *   merge 후의 끝점은 파트1의 끝점이 됩니다.
 * - 모든 노트는 가장 왼쪽 파트 기준으로 상대 위치가 변환됩니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 * - 원본 파트들은 삭제되고 새 병합 파트가 생성됩니다.
 */
export const mergeMidiParts = (partIds: string[]): { mergedPartId: string } | null => {
  if (partIds.length < 2) {
    return null; // 최소 2개 파트 필요
  }

  // 선택된 파트들 가져오기 (인덱스 사용)
  const selectedParts = partIds
    .map(id => findMidiPartById(id))
    .filter((part): part is MidiPart => part !== undefined);

  if (selectedParts.length < 2) {
    return null; // 유효한 파트가 2개 미만
  }

  // 같은 트랙에 속하는지 확인
  const firstTrackId = selectedParts[0].trackId;
  if (!selectedParts.every(part => part.trackId === firstTrackId)) {
    return null; // 다른 트랙에 속한 파트는 합칠 수 없음
  }

  // 모든 파트의 시작점과 끝점을 확인하여 가장 먼저인 점과 가장 나중인 점 찾기
  let mergedStartTick = selectedParts[0].startTick;
  let mergedEndTick = selectedParts[0].startTick + selectedParts[0].durationTicks;
  
  for (const part of selectedParts) {
    const partStartTick = part.startTick;
    const partEndTick = part.startTick + part.durationTicks;
    
    // 가장 먼저인 점 (가장 작은 시작점)
    if (partStartTick < mergedStartTick) {
      mergedStartTick = partStartTick;
    }
    
    // 가장 나중인 점 (가장 큰 끝점)
    // 파트1이 파트2를 감싸고 있는 경우, 파트1의 끝점이 merge 후의 끝점이 됨
    if (partEndTick > mergedEndTick) {
      mergedEndTick = partEndTick;
    }
  }
  
  const mergedDurationTicks = mergedEndTick - mergedStartTick;
  
  // 기준 파트는 가장 왼쪽 파트 (노트 위치 변환 기준)
  selectedParts.sort((a, b) => a.startTick - b.startTick);
  const basePart = selectedParts[0];

  // 모든 선택된 파트의 노트를 수집 (기준 파트 기준 상대 위치로 변환)
  const mergedNotes: MidiNote[] = [];
  for (const part of selectedParts) {
    // 각 파트의 노트는 파트 내부의 상대 위치로 저장되어 있음
    // 기준 파트 기준으로 상대 위치 변환 필요
    const partOffsetTicks = part.startTick - basePart.startTick; // 기준 파트 대비 오프셋
    
    for (const note of part.notes) {
      const noteWithTicks = ensureNoteHasTicks(note);
      // 노트의 상대 위치를 기준 파트 기준 상대 위치로 변환
      const mergedNoteBase: MidiNote = {
        ...noteWithTicks,
        startTick: noteWithTicks.startTick + partOffsetTicks, // 기준 파트 기준 상대 위치
      };
      mergedNotes.push(ensureNoteHasTicks(mergedNoteBase));
    }
  }

  // 새로운 병합된 파트 생성 (undo/redo 히스토리를 별도로 관리하기 위해)
  const mergedControlChanges: MidiControlChange[] = [];
  for (const part of selectedParts) {
    const partOffsetTicks = part.startTick - basePart.startTick;
    if (part.controlChanges) {
      for (const cc of part.controlChanges) {
        mergedControlChanges.push({
          ...cc,
          tick: cc.tick + partOffsetTicks,
        });
      }
    }
  }

  mergedControlChanges.sort((a, b) => a.tick - b.tick);

  const mergedPartId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const mergedPart: MidiPart = {
    id: mergedPartId,
    trackId: firstTrackId,
    startTick: mergedStartTick,
    durationTicks: mergedDurationTicks,
    notes: mergedNotes,
    controlChanges: mergedControlChanges.length ? mergedControlChanges : undefined,
  };

  // 히스토리에 추가 (파트 레벨 언두)
  const originalParts = selectedParts.map(p => structuredClone(p));
  addPartLevelHistoryEntry({
    type: 'mergeParts',
    originalParts,
    mergedPart: structuredClone(mergedPart)
  });
  
  // 새 파트 추가 (히스토리 기록 제외)
  addMidiPart(mergedPart, true);

  // 기존 선택된 파트들 모두 삭제 (히스토리 기록 제외)
  for (const part of selectedParts) {
    removeMidiPart(part.id, true);
  }

  return { mergedPartId };
};

/**
 * MIDI 파트를 복제합니다 (히스토리 포함, 딥 클론).
 * 
 * @param partId - 복제할 MIDI 파트의 ID
 * @param newMeasureStart - 새 파트의 시작 마디 위치 (선택, 기본값: 원본과 동일, tick으로 변환됨)
 * @param newTrackId - 새 파트의 트랙 ID (선택, 기본값: 원본과 동일)
 * @returns 새로 생성된 파트의 ID 또는 null (실패 시)
 * 
 * @remarks
 * - 노트와 히스토리가 모두 복제됩니다.
 * - 새 파트는 고유한 ID를 가집니다.
 * - newMeasureStart가 제공되면 tick으로 변환하여 사용합니다.
 * - 히스토리에 하나의 액션으로 기록됩니다.
 */
export const cloneMidiPart = (partId: string, newMeasureStart?: number, newTrackId?: string): string | null => {
  const sourcePart = findMidiPartById(partId);
  if (!sourcePart) {
    return null;
  }

  // 새 ID 생성
  const newPartId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 히스토리 가져오기
  const sourceHistory = getMidiPartHistory(partId);

  // newMeasureStart가 제공되면 tick으로 변환, 아니면 원본의 startTick 사용
  let newStartTick: number;
  if (newMeasureStart !== undefined) {
    const project = getProject();
    const timeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const { startTick } = measureToTicksPure(newMeasureStart, 0, timeSignature, ppqn);
    newStartTick = startTick;
  } else {
    newStartTick = sourcePart.startTick;
  }

  // 파트 딥 클론
  const clonedPart: MidiPart = {
    id: newPartId,
    trackId: newTrackId !== undefined ? newTrackId : sourcePart.trackId,
    startTick: newStartTick,
    durationTicks: sourcePart.durationTicks,
    notes: sourcePart.notes.map(note => ({
      note: note.note,
      velocity: note.velocity,
      startTick: note.startTick,
      durationTicks: note.durationTicks,
    })),
    controlChanges: sourcePart.controlChanges
      ? sourcePart.controlChanges.map(cc => ({ ...cc }))
      : undefined,
    historyIndex: sourcePart.historyIndex !== undefined ? sourcePart.historyIndex : sourceHistory.undoStack.length,
  };

  // 히스토리 복제 (딥 클론)
  if (sourceHistory.undoStack.length > 0) {
    cloneNoteHistory(partId, newPartId);
  }

  // 히스토리에 추가 (파트 레벨 언두)
  addPartLevelHistoryEntry({
    type: 'clonePart',
    originalPartId: partId,
    clonedPart: structuredClone(clonedPart)
  });
  
  // 새 파트 추가 (히스토리 기록 제외)
  addMidiPart(clonedPart, true);
  
  return newPartId;
};

/**
 * 여러 MIDI 파트를 한 번에 복제합니다 (히스토리 포함, 딥 클론).
 * 
 * @param clones - 복제할 파트 정보 배열 [{ partId, newMeasureStart?, newTrackId? }]
 * @returns 새로 생성된 파트 ID 배열
 * 
 * @remarks
 * - 모든 파트의 노트와 히스토리가 복제됩니다.
 * - 새 파트들은 고유한 ID를 가집니다.
 * - 히스토리에 하나의 액션으로 기록됩니다 (언두 시 모든 클론된 파트가 한 번에 제거됨).
 */
export const cloneMultipleMidiParts = (clones: Array<{ partId: string; newMeasureStart?: number; newTrackId?: string }>): string[] => {
  const clonedParts: Array<{ originalPartId: string; clonedPart: MidiPart }> = [];
  const newPartIds: string[] = [];

  for (const { partId, newMeasureStart, newTrackId } of clones) {
    const sourcePart = findMidiPartById(partId);
    if (!sourcePart) continue;

    // 새 ID 생성
    const newPartId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 히스토리 가져오기
    const sourceHistory = getMidiPartHistory(partId);

    // newMeasureStart가 제공되면 tick으로 변환, 아니면 원본의 startTick 사용
    let newStartTick: number;
    if (newMeasureStart !== undefined) {
      const project = getProject();
      const timeSignature = getTimeSignature(project);
      const ppqn = getPpqn(project);
      const { startTick } = measureToTicksPure(newMeasureStart, 0, timeSignature, ppqn);
      newStartTick = startTick;
    } else {
      newStartTick = sourcePart.startTick;
    }

    // 파트 딥 클론
    const clonedPart: MidiPart = {
      id: newPartId,
      trackId: newTrackId !== undefined ? newTrackId : sourcePart.trackId,
      startTick: newStartTick,
      durationTicks: sourcePart.durationTicks,
      notes: sourcePart.notes.map(note => ({
        note: note.note,
        velocity: note.velocity,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
      })),
      controlChanges: sourcePart.controlChanges
        ? sourcePart.controlChanges.map(cc => ({ ...cc }))
        : undefined,
      historyIndex: sourcePart.historyIndex !== undefined ? sourcePart.historyIndex : sourceHistory.undoStack.length,
    };

    // 히스토리 복제 (딥 클론)
    if (sourceHistory.undoStack.length > 0) {
      cloneNoteHistory(partId, newPartId);
    }

    clonedParts.push({
      originalPartId: partId,
      clonedPart: structuredClone(clonedPart)
    });

    // 새 파트 추가 (히스토리 기록 제외)
    addMidiPart(clonedPart, true);
    newPartIds.push(newPartId);
  }

  // 히스토리에 추가 (파트 레벨 언두) - 하나의 액션으로 묶음
  if (clonedParts.length > 0) {
    addPartLevelHistoryEntry({
      type: 'cloneMultipleParts',
      clones: clonedParts
    });
  }

  return newPartIds;
};

