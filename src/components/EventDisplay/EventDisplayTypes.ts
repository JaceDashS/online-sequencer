/**
 * EventDisplay 컴포넌트 관련 타입 정의
 */

/**
 * 이벤트 디스플레이 컴포넌트 Props
 * 타임라인에서 MIDI 파트를 표시하고 편집할 수 있는 컴포넌트입니다.
 */
export interface EventDisplayProps {
  /** 프로젝트 BPM (Beats Per Minute) */
  bpm: number;
  /** 타임 시그니처 [beatsPerMeasure, beatUnit] */
  timeSignature: [number, number];
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 시작 시간 (초, 선택) */
  startTime?: number;
  /** 트랙별 높이 맵 (선택) */
  trackHeights?: Map<string, number>;
  /** 스크롤 동기화 콜백 함수 (선택) */
  onScrollSync?: (scrollTop: number) => void;
  /** 선택된 트랙 ID (선택) */
  selectedTrackId?: string | null;
  /** 트랙 선택 콜백 함수 (선택) */
  onTrackSelect?: (trackId: string | null) => void;
  /** 현재 재생 시간 (초, 선택) */
}

/**
 * 마디 마커 인터페이스
 */
export interface MeasureMarker {
  /** 마디 번호 */
  measure: number;
  /** X 좌표 (픽셀) */
  x: number;
}

/**
 * 리사이즈 핸들 크기 (픽셀 단위, 줌 레벨과 무관하게 고정)
 */
export const RESIZE_HANDLE_WIDTH_PX = 15;

