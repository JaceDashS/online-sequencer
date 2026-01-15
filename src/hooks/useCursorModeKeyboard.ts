import { useCallback } from 'react';
import { useUIState, isSplitByKey3Mode } from '../store/uiStore';

/**
 * 커서 모드 키보드 이벤트 핸들러 옵션
 */
export interface CursorModeKeyboardOptions {
  /** split 모드 비활성화 시 호출되는 콜백 (미리보기 상태 초기화용) */
  onSplitModeDeactivate?: () => void;
  /** Alt 키를 눌렀을 때 호출되는 콜백 (prevAltPressedRef 업데이트용) */
  onAltKeyPress?: () => void;
  /** Alt 키를 눌렀을 때 split 모드를 활성화할지 여부 (드래그 중이면 false) */
  shouldActivateSplitOnAlt?: boolean;
  /** 이벤트 전파를 막을지 여부 (MidiEditor에서는 true, EventDisplay에서는 false) */
  stopPropagation?: boolean;
}

/**
 * 커서 모드 관련 키보드 이벤트를 처리하는 훅
 * 
 * @param options - 커서 모드 키보드 옵션
 * @returns 키보드 이벤트 핸들러 함수
 */
export const useCursorModeKeyboard = (options: CursorModeKeyboardOptions = {}) => {
  const ui = useUIState();
  const {
    onSplitModeDeactivate,
    onAltKeyPress,
    shouldActivateSplitOnAlt = true,
    stopPropagation = false,
  } = options;

  const handleKey3 = useCallback((e: KeyboardEvent) => {
    if (e.key === '3' || e.key === 'Digit3') {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (isSplitByKey3Mode(ui.cursorMode)) {
        // 이미 splitByKey3 모드면 비활성화
        ui.setCursorMode(null);
        onSplitModeDeactivate?.();
      } else {
        // splitByKey3 모드 활성화
        ui.setCursorMode('splitByKey3');
      }
    }
  }, [ui, onSplitModeDeactivate, stopPropagation]);

  const handleKey4 = useCallback((e: KeyboardEvent) => {
    if (e.key === '4' || e.key === 'Digit4') {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }

      // splitByKey3 모드가 활성화되어 있으면 먼저 비활성화
      const wasSplitMode = isSplitByKey3Mode(ui.cursorMode);
      if (wasSplitMode) {
        ui.setCursorMode(null);
        onSplitModeDeactivate?.();
      }

      // mergeByKey4 토글 (split 모드에서 전환된 경우가 아니면 토글)
      if (wasSplitMode) {
        // split 모드에서 전환된 경우 항상 merge 모드 활성화
        ui.setCursorMode('mergeByKey4');
      } else if (ui.cursorMode === 'mergeByKey4') {
        // 이미 mergeByKey4 모드면 비활성화
        ui.setCursorMode(null);
      } else {
        // mergeByKey4 모드 활성화
        ui.setCursorMode('mergeByKey4');
      }
    }
  }, [ui, onSplitModeDeactivate, stopPropagation]);

  const handleKey1 = useCallback((e: KeyboardEvent) => {
    if (e.key === '1' || e.key === 'Digit1') {
      if (isSplitByKey3Mode(ui.cursorMode)) {
        ui.setCursorMode(null);
        onSplitModeDeactivate?.();
      } else if (ui.cursorMode === 'mergeByKey4') {
        ui.setCursorMode(null);
      }
    }
  }, [ui, onSplitModeDeactivate]);

  const handleAltKey = useCallback((e: KeyboardEvent) => {
    if ((e.key === 'Alt' || e.altKey) && shouldActivateSplitOnAlt) {
      onAltKeyPress?.();
      ui.setCursorMode('splitByAlt');
    }
  }, [ui, onAltKeyPress, shouldActivateSplitOnAlt]);

  /**
   * 모든 커서 모드 관련 키보드 이벤트를 처리하는 통합 핸들러
   */
  const handleCursorModeKeys = useCallback((e: KeyboardEvent) => {
    handleKey3(e);
    handleKey4(e);
    handleKey1(e);
    handleAltKey(e);
  }, [handleKey3, handleKey4, handleKey1, handleAltKey]);

  return {
    handleKey3,
    handleKey4,
    handleKey1,
    handleAltKey,
    handleCursorModeKeys,
  };
};

