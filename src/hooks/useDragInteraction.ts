import { useState, useCallback, useRef } from 'react';

/**
 * 드래그 오프셋 타입
 */
export interface DragOffset {
  x: number;
  y: number;
}

/**
 * 잠재적 드래그 시작 정보
 */
interface PotentialDragStart<T> {
  position: { x: number; y: number };
  items: T[];
}

/**
 * 드래그 상호작용 훅
 * Phase 7.1: 공통 드래그 로직 추출
 * 
 * MidiEditor와 EventDisplay에서 공통으로 사용하는 드래그 로직을 제공합니다.
 * 
 * @template T 드래그되는 항목의 타입
 */
export const useDragInteraction = <T = unknown>(options?: {
  /** 드래그 시작을 감지하기 위한 최소 이동 거리 (픽셀) */
  dragThreshold?: number;
  /** Ctrl 키를 누르고 있을 때 복제 모드 활성화 여부 */
  enableDuplicateMode?: boolean;
  /** 복제 모드 변경 콜백 */
  onDuplicateModeChange?: (enabled: boolean) => void;
}) => {
  const {
    dragThreshold = 3,
    enableDuplicateMode = false,
    onDuplicateModeChange,
  } = options || {};

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartItems, setDragStartItems] = useState<T[]>([]);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isCtrlPressedDuringDrag, setIsCtrlPressedDuringDrag] = useState(false);
  
  // 잠재적 드래그 시작 정보 (클릭은 했지만 아직 드래그를 시작하지 않은 상태)
  const [potentialDragStart, setPotentialDragStart] = useState<PotentialDragStart<T> | null>(null);
  
  const isCtrlPressedRef = useRef(false);

  /**
   * 잠재적 드래그 시작 (클릭 시)
   */
  const startPotentialDrag = useCallback((x: number, y: number, items: T[]) => {
    setPotentialDragStart({ position: { x, y }, items });
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  /**
   * 마우스 이동 중 드래그 시작 감지
   */
  const checkDragStart = useCallback((
    currentX: number,
    currentY: number,
    ctrlKey?: boolean
  ): boolean => {
    if (!potentialDragStart || potentialDragStart.items.length === 0) {
      return false;
    }

    const deltaX = currentX - potentialDragStart.position.x;
    const deltaY = currentY - potentialDragStart.position.y;
    
    if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
      // 드래그 시작
      setIsDragging(true);
      setDragStartItems(potentialDragStart.items);
      setDragStartPos(potentialDragStart.position);
      setPotentialDragStart(null);
      
      const isCtrlPressed = ctrlKey ?? false;
      setIsCtrlPressedDuringDrag(isCtrlPressed);
      isCtrlPressedRef.current = isCtrlPressed;
      
      if (enableDuplicateMode && onDuplicateModeChange) {
        onDuplicateModeChange(isCtrlPressed);
      }
      
      return true;
    }
    
    return false;
  }, [potentialDragStart, dragThreshold, enableDuplicateMode, onDuplicateModeChange]);

  /**
   * 드래그 업데이트 (마우스 이동 중)
   */
  const updateDrag = useCallback((
    currentX: number,
    currentY: number,
    ctrlKey?: boolean
  ) => {
    if (!isDragging || !dragStartPos) return;

    const deltaX = currentX - dragStartPos.x;
    const deltaY = currentY - dragStartPos.y;
    
    setDragOffset({ x: deltaX, y: deltaY });
    
    const isCtrlPressed = ctrlKey ?? false;
    if (isCtrlPressed !== isCtrlPressedRef.current) {
      setIsCtrlPressedDuringDrag(isCtrlPressed);
      isCtrlPressedRef.current = isCtrlPressed;
      
      if (enableDuplicateMode && onDuplicateModeChange) {
        onDuplicateModeChange(isCtrlPressed);
      }
    }
  }, [isDragging, dragStartPos, enableDuplicateMode, onDuplicateModeChange]);

  /**
   * 드래그 종료
   */
  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDragStartPos(null);
    setDragStartItems([]);
    setDragOffset({ x: 0, y: 0 });
    setPotentialDragStart(null);
    setIsCtrlPressedDuringDrag(false);
    isCtrlPressedRef.current = false;
    
    if (enableDuplicateMode && onDuplicateModeChange) {
      onDuplicateModeChange(false);
    }
  }, [enableDuplicateMode, onDuplicateModeChange]);

  /**
   * 드래그 취소 (클릭만 하고 드래그하지 않은 경우)
   */
  const cancelPotentialDrag = useCallback(() => {
    setPotentialDragStart(null);
  }, []);

  /**
   * 드래그 상태 초기화
   */
  const resetDrag = useCallback(() => {
    setIsDragging(false);
    setDragStartPos(null);
    setDragStartItems([]);
    setDragOffset({ x: 0, y: 0 });
    setPotentialDragStart(null);
    setIsCtrlPressedDuringDrag(false);
    isCtrlPressedRef.current = false;
  }, []);

  return {
    isDragging,
    dragStartPos,
    dragStartItems,
    dragOffset,
    isCtrlPressedDuringDrag,
    potentialDragStart: potentialDragStart?.items ?? [],
    startPotentialDrag,
    checkDragStart,
    updateDrag,
    endDrag,
    cancelPotentialDrag,
    resetDrag,
  };
};

