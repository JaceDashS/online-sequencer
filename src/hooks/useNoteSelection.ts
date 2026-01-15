import { useState, useCallback } from 'react';

/**
 * 노트 선택 상태와 로직을 관리하는 훅
 * 
 * @remarks
 * - 다중 선택 (Ctrl/Cmd + 클릭)
 * - 범위 선택 (Shift + 클릭) - 향후 구현
 * - 선택 상태 관리
 */
export interface UseNoteSelectionOptions {
  /** 초기 선택된 노트 인덱스들 */
  initialSelectedNotes?: Set<number>;
}

export interface UseNoteSelectionReturn {
  /** 현재 선택된 노트 인덱스들 */
  selectedNotes: Set<number>;
  /** 노트 선택 설정 */
  setSelectedNotes: (notes: Set<number>) => void;
  /** 노트 클릭 핸들러 (다중 선택 로직 포함) */
  handleNoteClick: (
    noteIndex: number,
    event: React.MouseEvent | MouseEvent,
    options?: {
      /** merge 모드 활성화 여부 */
      isMergeMode?: boolean;
      /** 커스텀 선택 로직 콜백 */
      customSelectionLogic?: (clickedIndex: number, currentSelection: Set<number>, event: React.MouseEvent | MouseEvent) => Set<number>;
    }
  ) => void;
  /** 모든 선택 해제 */
  clearSelection: () => void;
  /** 특정 노트를 선택에 추가 */
  addToSelection: (noteIndex: number) => void;
  /** 특정 노트를 선택에서 제거 */
  removeFromSelection: (noteIndex: number) => void;
  /** 특정 노트가 선택되어 있는지 확인 */
  isSelected: (noteIndex: number) => boolean;
  /** 선택 토글 */
  toggleSelection: (noteIndex: number) => void;
}

/**
 * 노트 선택 로직을 관리하는 커스텀 훅
 * 
 * @param options - 훅 옵션
 * @returns 선택 상태와 핸들러
 */
export const useNoteSelection = (
  options: UseNoteSelectionOptions = {}
): UseNoteSelectionReturn => {
  const { initialSelectedNotes = new Set<number>() } = options;
  const [selectedNotes, setSelectedNotes] = useState<Set<number>>(initialSelectedNotes);

  /**
   * 노트 클릭 핸들러
   * Ctrl/Cmd 키를 누르고 있으면 다중 선택 모드
   * Shift 키를 누르고 있으면 범위 선택 모드 (향후 구현)
   * merge 모드일 때는 자동으로 다중 선택
   */
  const handleNoteClick = useCallback((
    noteIndex: number,
    event: React.MouseEvent | MouseEvent,
    options?: {
      isMergeMode?: boolean;
      customSelectionLogic?: (clickedIndex: number, currentSelection: Set<number>, event: React.MouseEvent | MouseEvent) => Set<number>;
    }
  ) => {
    const { isMergeMode = false, customSelectionLogic } = options || {};
    
    // 커스텀 선택 로직이 있으면 사용
    if (customSelectionLogic) {
      const newSelection = customSelectionLogic(noteIndex, selectedNotes, event);
      setSelectedNotes(newSelection);
      return;
    }

    // merge 모드: 기존 선택에 추가 (이미 선택된 노트면 제거)
    if (isMergeMode) {
      const newSelection = new Set(selectedNotes);
      if (newSelection.has(noteIndex)) {
        newSelection.delete(noteIndex);
      } else {
        newSelection.add(noteIndex);
      }
      setSelectedNotes(newSelection);
      return;
    }

    // 일반 모드: Ctrl/Cmd 키가 있으면 기존 선택에 추가, 없으면 새로 선택
    const isCtrlOrCmdPressed = 'ctrlKey' in event 
      ? (event.ctrlKey || event.metaKey)
      : false; // MouseEvent는 기본적으로 ctrlKey/metaKey가 없음
    
    // 이미 선택된 노트를 클릭하면 선택 유지
    if (selectedNotes.has(noteIndex) && !isCtrlOrCmdPressed) {
      return; // 선택 유지
    }

    if (isCtrlOrCmdPressed) {
      // 다중 선택: 기존 선택에 추가
      const newSelection = new Set(selectedNotes);
      newSelection.add(noteIndex);
      setSelectedNotes(newSelection);
    } else {
      // 단일 선택: 새로 선택
      setSelectedNotes(new Set([noteIndex]));
    }
  }, [selectedNotes]);

  /**
   * 모든 선택 해제
   */
  const clearSelection = useCallback(() => {
    setSelectedNotes(new Set());
  }, []);

  /**
   * 특정 노트를 선택에 추가
   */
  const addToSelection = useCallback((noteIndex: number) => {
    setSelectedNotes(prev => {
      const newSelection = new Set(prev);
      newSelection.add(noteIndex);
      return newSelection;
    });
  }, []);

  /**
   * 특정 노트를 선택에서 제거
   */
  const removeFromSelection = useCallback((noteIndex: number) => {
    setSelectedNotes(prev => {
      const newSelection = new Set(prev);
      newSelection.delete(noteIndex);
      return newSelection;
    });
  }, []);

  /**
   * 특정 노트가 선택되어 있는지 확인
   */
  const isSelected = useCallback((noteIndex: number) => {
    return selectedNotes.has(noteIndex);
  }, [selectedNotes]);

  /**
   * 선택 토글
   */
  const toggleSelection = useCallback((noteIndex: number) => {
    setSelectedNotes(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(noteIndex)) {
        newSelection.delete(noteIndex);
      } else {
        newSelection.add(noteIndex);
      }
      return newSelection;
    });
  }, []);

  return {
    selectedNotes,
    setSelectedNotes,
    handleNoteClick,
    clearSelection,
    addToSelection,
    removeFromSelection,
    isSelected,
    toggleSelection,
  };
};

