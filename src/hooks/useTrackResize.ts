import { useCallback, useRef } from 'react';
import { UI_CONSTANTS } from '../constants/ui';

/**
 * 트랙 리사이즈 훅 옵션 인터페이스
 */
interface UseTrackResizeOptions {
  /** 리사이즈할 트랙 DOM 요소 */
  trackElement: HTMLElement | null;
  /** 최소 높이 (기본값: UI_CONSTANTS.TRACK_MIN_HEIGHT) */
  minHeight?: number;
  /** 리사이즈 시 호출될 콜백 함수 */
  onResize: (newHeight: number) => void;
  /** 리사이즈 종료 시 호출될 콜백 함수 */
  onResizeEnd: () => void;
}

/**
 * 개별 트랙의 높이를 조절하는 커스텀 훅
 * 
 * @param options - 트랙 리사이즈 옵션
 * @returns 리사이즈 시작 핸들러 함수
 * 
 * @remarks
 * - 트랙 요소의 높이를 직접 DOM에 적용합니다.
 * - 마우스 드래그로 트랙 높이를 조절할 수 있습니다.
 * 
 * @example
 * ```tsx
 * const trackRef = useRef<HTMLDivElement>(null);
 * const handleResizeStart = useTrackResize({
 *   trackElement: trackRef.current,
 *   minHeight: 50,
 *   onResize: (newHeight) => updateTrackHeight(trackId, newHeight),
 *   onResizeEnd: () => saveTrackHeights(),
 * });
 * 
 * return (
 *   <div ref={trackRef}>
 *     <div onMouseDown={handleResizeStart}>Resize Handle</div>
 *   </div>
 * );
 * ```
 */
export const useTrackResize = ({
  trackElement,
  minHeight = UI_CONSTANTS.TRACK_MIN_HEIGHT,
  onResize,
  onResizeEnd,
}: UseTrackResizeOptions) => {
  const isResizingRef = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!trackElement) return;

      isResizingRef.current = true;
      const startY = e.clientY;
      const startHeight = trackElement.offsetHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current || !trackElement) return;

        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(minHeight, startHeight + deltaY);

        // 즉시 DOM에 높이 적용
        trackElement.style.height = `${newHeight}px`;
        trackElement.style.minHeight = `${newHeight}px`;

        // 콜백 호출
        onResize(newHeight);
      };

      const handleMouseUp = () => {
        if (!isResizingRef.current) return;
        isResizingRef.current = false;
        onResizeEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [trackElement, minHeight, onResize, onResizeEnd]
  );

  return handleResizeStart;
};
