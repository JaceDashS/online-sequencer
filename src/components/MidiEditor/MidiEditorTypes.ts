/**
 * MidiEditor 컴포넌트 관련 타입 정의 및 상수
 */

/**
 * MIDI 에디터 컴포넌트 Props
 */
export interface MidiEditorProps {
  /** 편집할 MIDI 파트의 ID */
  partId: string;
  /** 에디터를 닫을 때 호출되는 콜백 함수 */
  onClose: () => void;
  /** 프로젝트 BPM (Beats Per Minute) */
  bpm: number;
  /** 타임 시그니처 [beatsPerMeasure, beatUnit] */
  timeSignature: [number, number];
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
}

/**
 * 뷰포트 오버스캔 시간 (초)
 * 화면 밖의 노트도 렌더링하여 스크롤 시 부드러운 전환을 위해 사용
 */
export const VIEWPORT_OVERSCAN_SECONDS = 1;

