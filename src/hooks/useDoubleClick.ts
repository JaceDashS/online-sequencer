import { useRef, useCallback } from 'react';
import { UI_CONSTANTS } from '../constants/ui';

interface UseDoubleClickOptions {
  onSingleClick: () => void;
  onDoubleClick: () => void;
  timeout?: number;
}

/**
 * 단일 클릭과 더블 클릭을 구분하는 커스텀 훅
 */
export const useDoubleClick = ({
  onSingleClick,
  onDoubleClick,
  timeout = UI_CONSTANTS.DOUBLE_CLICK_TIMEOUT,
}: UseDoubleClickOptions) => {
  const clickTimeoutRef = useRef<number | null>(null);

  const handleClick = useCallback(() => {
    // 더블클릭을 위한 타이머 처리
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      onDoubleClick();
      return;
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      // 단일 클릭으로 처리
      onSingleClick();
      clickTimeoutRef.current = null;
    }, timeout);
  }, [onSingleClick, onDoubleClick, timeout]);

  return handleClick;
};
