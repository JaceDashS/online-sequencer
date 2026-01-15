import { useState, useCallback, useRef } from 'react';

/**
 * 드래그 오프셋 정보
 */
export interface DragOffset {
  /** 시간 오프셋 (초) */
  time?: number;
  /** 피치 오프셋 (반음 단위) */
  pitch?: number;
  /** X 오프셋 (픽셀) */
  x?: number;
  /** Y 오프셋 (픽셀) */
  y?: number;
}

/**
 * 노트 드래그 옵션
 */
export interface UseNoteDragOptions<T = unknown> {
  /** 드래그 시작 임계값 (픽셀, 기본값: 3) */
  dragThreshold?: number;
  /** 드래그 시작 시 호출될 콜백 */
  onDragStart?: (dragStartPos: { x: number; y: number }, items: T[]) => void;
  /** 드래그 중 호출될 콜백 */
  onDragMove?: (offset: DragOffset, items: T[]) => void;
  /** 드래그 종료 시 호출될 콜백 */
  onDragEnd?: (offset: DragOffset, items: T[]) => void;
  /** 스냅핑 로직 함수 */
  snapPosition?: (x: number, y: number) => { x: number; y: number };
  /** 드래그 가능 여부 확인 함수 */
  canDrag?: (items: T[]) => boolean;
}

/**
 * 노트 드래그 상태와 로직을 관리하는 훅
 */
export interface UseNoteDragReturn<T = unknown> {
  /** 드래그 중인지 여부 */
  isDragging: boolean;
  /** 드래그 시작 위치 */
  dragStartPos: { x: number; y: number } | null;
  /** 드래그 시작 시의 아이템들 */
  dragStartItems: T[];
  /** 현재 드래그 오프셋 */
  dragOffset: DragOffset;
  /** Ctrl 키가 드래그 중에 눌려있는지 여부 */
  isCtrlPressedDuringDrag: boolean;
  /** 잠재적 드래그 시작 위치 (아직 드래그로 판정되지 않음) */
  potentialDragStartPos: { x: number; y: number } | null;
  /** 잠재적 드래그 아이템들 */
  potentialDragItems: T[];
  /** 마우스 다운 핸들러 */
  handleMouseDown: (x: number, y: number, items: T[], event?: React.MouseEvent | MouseEvent) => void;
  /** 마우스 이동 핸들러 */
  handleMouseMove: (x: number, y: number, event?: React.MouseEvent | MouseEvent) => void;
  /** 마우스 업 핸들러 */
  handleMouseUp: (event?: React.MouseEvent | MouseEvent) => void;
  /** 드래그 취소 */
  cancelDrag: () => void;
}

/**
 * 노트 드래그 로직을 관리하는 커스텀 훅
 * 
 * @param options - 훅 옵션
 * @returns 드래그 상태와 핸들러
 */
export const useNoteDrag = <T = unknown>(
  options: UseNoteDragOptions<T> = {}
): UseNoteDragReturn<T> => {
  const {
    dragThreshold = 3,
    onDragStart,
    onDragMove,
    onDragEnd,
    snapPosition,
    canDrag,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartItems, setDragStartItems] = useState<T[]>([]);
  const [dragOffset, setDragOffset] = useState<DragOffset>({});
  const [isCtrlPressedDuringDrag, setIsCtrlPressedDuringDrag] = useState(false);
  const [potentialDragStartPos, setPotentialDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [potentialDragItems, setPotentialDragItems] = useState<T[]>([]);

  // 최신 Ctrl 키 상태를 추적하기 위한 ref
  const isCtrlPressedRef = useRef(false);

  /**
   * 마우스 다운 핸들러
   * 드래그를 시작하기 전 잠재적 드래그 상태를 설정
   */
  const handleMouseDown = useCallback((
    x: number,
    y: number,
    items: T[],
    event?: React.MouseEvent | MouseEvent
  ) => {
    // 드래그 가능 여부 확인
    if (canDrag && !canDrag(items)) {
      return;
    }

    // Ctrl 키 상태 저장
    if (event && 'ctrlKey' in event) {
      isCtrlPressedRef.current = event.ctrlKey || event.metaKey || false;
    }

    // 스냅핑이 있으면 적용
    let finalX = x;
    let finalY = y;
    if (snapPosition) {
      const snapped = snapPosition(x, y);
      finalX = snapped.x;
      finalY = snapped.y;
    }

    // 잠재적 드래그 시작 위치 저장 (아직 드래그로 판정하지 않음)
    setPotentialDragStartPos({ x: finalX, y: finalY });
    setPotentialDragItems(items);
    
    // 기존 드래그 상태 초기화
    setIsDragging(false);
    setDragStartPos(null);
    setDragStartItems([]);
    setDragOffset({});
    setIsCtrlPressedDuringDrag(false);
  }, [canDrag, snapPosition]);

  /**
   * 마우스 이동 핸들러
   * 잠재적 드래그를 실제 드래그로 전환하거나 드래그 오프셋 업데이트
   */
  const handleMouseMove = useCallback((
    x: number,
    y: number,
    event?: React.MouseEvent | MouseEvent
  ) => {
    // Ctrl 키 상태 업데이트
    if (event && 'ctrlKey' in event) {
      const isCtrlPressed = event.ctrlKey || event.metaKey || false;
      isCtrlPressedRef.current = isCtrlPressed;
      if (isDragging) {
        setIsCtrlPressedDuringDrag(isCtrlPressed);
      }
    }

    // 잠재적 드래그가 있고 아직 드래그로 판정되지 않았을 때
    if (potentialDragStartPos && !isDragging && potentialDragItems.length > 0) {
      const deltaX = x - potentialDragStartPos.x;
      const deltaY = y - potentialDragStartPos.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // 임계값을 넘으면 드래그 시작
      if (distance > dragThreshold) {
        setIsDragging(true);
        setDragStartPos(potentialDragStartPos);
        setDragStartItems(potentialDragItems);
        setPotentialDragStartPos(null);
        setPotentialDragItems([]);
        setIsCtrlPressedDuringDrag(isCtrlPressedRef.current);

        // 드래그 시작 콜백 호출
        if (onDragStart) {
          onDragStart(potentialDragStartPos, potentialDragItems);
        }
      }
    }

    // 드래그 중일 때 오프셋 계산
    if (isDragging && dragStartPos && dragStartItems.length > 0) {
      // 스냅핑이 있으면 적용
      let finalX = x;
      let finalY = y;
      if (snapPosition) {
        const snapped = snapPosition(x, y);
        finalX = snapped.x;
        finalY = snapped.y;
      }

      const offset: DragOffset = {
        x: finalX - dragStartPos.x,
        y: finalY - dragStartPos.y,
      };

      setDragOffset(offset);

      // 드래그 이동 콜백 호출
      if (onDragMove) {
        onDragMove(offset, dragStartItems);
      }
    }
  }, [
    potentialDragStartPos,
    potentialDragItems,
    isDragging,
    dragStartPos,
    dragStartItems,
    dragThreshold,
    snapPosition,
    onDragStart,
    onDragMove,
  ]);

  /**
   * 마우스 업 핸들러
   * 드래그 종료 처리
   */
  const handleMouseUp = useCallback(() => {
    // 잠재적 드래그만 있고 실제 드래그가 시작되지 않았으면 초기화
    if (potentialDragStartPos && !isDragging) {
      setPotentialDragStartPos(null);
      setPotentialDragItems([]);
      return;
    }

    // 실제 드래그가 있었을 때만 종료 처리
    if (isDragging && dragStartItems.length > 0) {
      // 드래그 종료 콜백 호출
      if (onDragEnd) {
        onDragEnd(dragOffset, dragStartItems);
      }

      // 상태 초기화
      setIsDragging(false);
      setDragStartPos(null);
      setDragStartItems([]);
      setDragOffset({});
      setIsCtrlPressedDuringDrag(false);
      setPotentialDragStartPos(null);
      setPotentialDragItems([]);
    }
  }, [
    potentialDragStartPos,
    isDragging,
    dragStartItems,
    dragOffset,
    onDragEnd,
  ]);

  /**
   * 드래그 취소
   * 모든 드래그 관련 상태를 초기화
   */
  const cancelDrag = useCallback(() => {
    setIsDragging(false);
    setDragStartPos(null);
    setDragStartItems([]);
    setDragOffset({});
    setIsCtrlPressedDuringDrag(false);
    setPotentialDragStartPos(null);
    setPotentialDragItems([]);
  }, []);

  return {
    isDragging,
    dragStartPos,
    dragStartItems,
    dragOffset,
    isCtrlPressedDuringDrag,
    potentialDragStartPos,
    potentialDragItems,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancelDrag,
  };
};

