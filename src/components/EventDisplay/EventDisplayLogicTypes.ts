/**
 * EventDisplay 이벤트 핸들러 관련 타입 정의
 */

import type { MidiPart } from '../../types/project';
import type { TempoEvent } from '../../types/project';

/**
 * 드래그 상태 타입
 */
export interface DragState {
  draggedPartId: string | null;
  draggedPartsInfo: Array<{ partId: string; originalStartTick: number; originalTrackId: string }>;
  partDragStart: { x: number; y: number; partStartTick: number; partTrackId: string; clickOffsetX: number } | null;
  partDragOffset: { x: number; y: number };
  hasDraggedPart: boolean;
  isTrackMovingMode: boolean;
  isCtrlPressedDuringDrag: boolean;
}

/**
 * 리사이즈 상태 타입
 */
export interface ResizeState {
  isResizingPart: boolean;
  resizePartId: string | null;
  resizeSide: 'left' | 'right' | null;
  resizeStart: { x: number; originalDurationTicks: number; originalStartTick: number } | null;
  resizePreview: { startTick: number; durationTicks: number } | null;
}

/**
 * 파트 리사이즈 미리보기 계산 함수 파라미터
 */
export interface CalculatePartResizePreviewParams {
  resizeSide: NonNullable<ResizeState['resizeSide']>;
  resizeStart: NonNullable<ResizeState['resizeStart']>;
  mouseX: number;
  timelineStartTime: number;
  pixelsPerSecond: number;
  tempoMap: TempoEvent[];
  timeSignature: [number, number];
  ppqn: number;
  isQuantizeEnabled: boolean;
  minDurationTicks: number;
}

/**
 * 스플릿 상태 타입
 */
export interface SplitState {
  splitPreviewX: number | null;
  splitPreviewPartId: string | null;
}

/**
 * 드롭 위치 계산 결과 타입
 */
export interface DropPositionResult {
  baseTickDelta: number;
  trackIndexDelta: number;
  baseNewTrackId: string;
  partDropPositions: Array<{
    partId: string;
    newStartTick: number;
    newTrackId: string;
  }>;
}

/**
 * 드롭 위치 계산 함수 파라미터
 */
export interface CalculateDropPositionParams {
  partDragStart: NonNullable<DragState['partDragStart']>;
  partDragOffset: DragState['partDragOffset'];
  draggedPartsInfo: DragState['draggedPartsInfo'];
  pixelsPerSecond: number;
  tracks: Array<{ id: string }>;
  trackHeights: Map<string, number>;
  isTrackMovingMode: boolean;
  isQuantizeEnabled: boolean;
  bpm: number;
  timeSignature: [number, number];
  ppqn: number;
}

/**
 * 스플릿 미리보기 계산 함수 파라미터
 */
export interface CalculateSplitPreviewParams {
  mouseX: number;
  part: MidiPart;
  pixelsPerSecond: number;
  timeSignature: [number, number];
  ppqn: number;
  tempoMap: TempoEvent[];
  isQuantizeEnabled: boolean;
  bpm: number;
}
