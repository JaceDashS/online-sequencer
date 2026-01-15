import { useCallback, useRef } from 'react';

/**
 * 리사이즈 훅 옵션 인터페이스
 */
interface UseResizeOptions {
  /** 최소 크기 */
  minSize: number;
  /** 최대 크기 */
  maxSize: number;
  /** 초기 크기 */
  initialSize: number;
  /** 리사이즈 방향: 'horizontal' | 'vertical' */
  orientation: 'horizontal' | 'vertical';
  /** 리사이즈 시 호출될 콜백 함수 */
  onResize: (newSize: number) => void;
  /** 반대 방향으로 드래그할 때 사용 (Inspector처럼) */
  reverseDirection?: boolean;
}

/**
 * 요소의 크기를 조절하는 커스텀 훅
 * 
 * @param options - 리사이즈 옵션
 * @returns 리사이즈 시작 핸들러 함수
 * 
 * @example
 * ```tsx
 * const handleResizeStart = useResize({
 *   minSize: 100,
 *   maxSize: 800,
 *   initialSize: 300,
 *   orientation: 'horizontal',
 *   onResize: (newSize) => setWidth(newSize),
 * });
 * 
 * return <div onMouseDown={handleResizeStart}>Resize Handle</div>;
 * ```
 */
export const useResize = ({
  minSize,
  maxSize,
  initialSize,
  orientation,
  onResize,
  reverseDirection = false,
}: UseResizeOptions) => {
  const isResizingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(initialSize);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizingRef.current = true;
      
      if (orientation === 'horizontal') {
        startPosRef.current = e.clientX;
      } else {
        startPosRef.current = e.clientY;
      }
      
      startSizeRef.current = initialSize;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;

        let delta: number;
        if (orientation === 'horizontal') {
          delta = moveEvent.clientX - startPosRef.current;
          if (reverseDirection) {
            // Inspector: 오른쪽에서 왼쪽으로 드래그하면 크기 증가
            delta = startPosRef.current - moveEvent.clientX;
          }
        } else {
          // vertical: 위로 드래그하면 높이 증가
          delta = startPosRef.current - moveEvent.clientY;
        }

        const newSize = Math.max(
          minSize,
          Math.min(maxSize, startSizeRef.current + delta)
        );
        onResize(newSize);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [minSize, maxSize, initialSize, orientation, onResize, reverseDirection]
  );

  return handleResizeStart;
};
