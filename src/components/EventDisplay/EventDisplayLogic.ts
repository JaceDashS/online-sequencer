export type PartClickSelectionMode = 'ignore' | 'toggle' | 'replace';

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
