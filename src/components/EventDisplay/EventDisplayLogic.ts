import type { DragState } from './EventDisplayLogicTypes';

export type PartClickSelectionMode = 'ignore' | 'toggle' | 'replace';

export type PartDragResetState = Pick<
  DragState,
  | 'draggedPartId'
  | 'draggedPartsInfo'
  | 'partDragStart'
  | 'partDragOffset'
  | 'hasDraggedPart'
  | 'isTrackMovingMode'
  | 'isCtrlPressedDuringDrag'
>;

interface GetPartClickSelectionModeParams {
  hasDraggedPart: boolean;
  isDraggingPart: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

interface CanOpenPartEditorParams {
  hasActiveCursorMode: boolean;
  hasDraggedPart: boolean;
  isDraggingPart: boolean;
}

/**
 * 파트 드래그가 끝난 뒤 적용할 초기 상태를 생성합니다.
 */
export function createPartDragResetState(): PartDragResetState {
  return {
    draggedPartId: null,
    draggedPartsInfo: [],
    partDragStart: null,
    partDragOffset: { x: 0, y: 0 },
    hasDraggedPart: false,
    isTrackMovingMode: false,
    isCtrlPressedDuringDrag: false,
  };
}

/**
 * 클립 클릭 시 적용할 선택 방식을 결정합니다.
 */
export function getPartClickSelectionMode({
  hasDraggedPart,
  isDraggingPart,
  ctrlKey,
  metaKey,
  shiftKey,
}: GetPartClickSelectionModeParams): PartClickSelectionMode {
  if (hasDraggedPart || isDraggingPart) {
    return 'ignore';
  }

  if (ctrlKey || metaKey || shiftKey) {
    return 'toggle';
  }

  return 'replace';
}

/**
 * 현재 상호작용 상태에서 MIDI 편집기를 열 수 있는지 확인합니다.
 */
export function canOpenPartEditor({
  hasActiveCursorMode,
  hasDraggedPart,
  isDraggingPart,
}: CanOpenPartEditorParams): boolean {
  return !hasActiveCursorMode && !hasDraggedPart && !isDraggingPart;
}
