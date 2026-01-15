import { useState, useCallback, useRef } from 'react';

/**
 * Marquee 선택 영역 타입
 */
export interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Marquee 선택 훅
 * Phase 7.1: 공통 선택 로직 추출
 * 
 * MidiEditor와 EventDisplay에서 공통으로 사용하는 Marquee 선택 로직을 제공합니다.
 */
export const useMarqueeSelection = () => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * Marquee 선택 시작
   */
  const startSelection = useCallback((x: number, y: number) => {
    setIsSelecting(true);
    selectionStartRef.current = { x, y };
    setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
  }, []);

  /**
   * Marquee 선택 업데이트 (마우스 이동 중)
   */
  const updateSelection = useCallback((x: number, y: number) => {
    if (!isSelecting || !selectionStartRef.current) return;
    
    setSelectionRect({
      startX: selectionStartRef.current.x,
      startY: selectionStartRef.current.y,
      endX: x,
      endY: y,
    });
  }, [isSelecting]);

  /**
   * Marquee 선택 종료
   */
  const endSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionRect(null);
    selectionStartRef.current = null;
  }, []);

  /**
   * 선택 영역 초기화
   */
  const clearSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionRect(null);
    selectionStartRef.current = null;
  }, []);

  /**
   * 선택 영역 내에 있는 항목들을 필터링하는 헬퍼 함수
   */
  const getItemsInSelection = useCallback(<T extends { x: number; y: number; width: number; height: number }>(
    items: T[],
    rect: SelectionRect | null
  ): T[] => {
    if (!rect) return [];
    
    const minX = Math.min(rect.startX, rect.endX);
    const maxX = Math.max(rect.startX, rect.endX);
    const minY = Math.min(rect.startY, rect.endY);
    const maxY = Math.max(rect.startY, rect.endY);
    
    return items.filter(item => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      
      // 항목이 선택 영역과 겹치는지 확인
      return !(itemRight < minX || item.x > maxX || itemBottom < minY || item.y > maxY);
    });
  }, []);

  return {
    isSelecting,
    selectionRect,
    startSelection,
    updateSelection,
    endSelection,
    clearSelection,
    getItemsInSelection,
  };
};

