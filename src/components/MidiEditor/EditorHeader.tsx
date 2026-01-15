import React from 'react';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import styles from './MidiEditor.module.css';

/**
 * EditorHeader 컴포넌트 Props
 * Phase 7.5: 에디터 헤더 UI 분리
 */
export interface EditorHeaderProps {
  /** 에디터 제목 */
  title?: string;
  /** 에디터를 닫을 때 호출되는 콜백 함수 */
  onClose: () => void;
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 초당 픽셀 수 변경 핸들러 */
  onPixelsPerSecondChange: (value: number) => void;
  /** 사용자가 줌을 수동으로 조정했는지 여부 설정 함수 */
  setHasUserAdjustedZoom?: (value: boolean) => void;
  /** 피아노 키 높이 스케일 */
  pianoKeyHeightScale: number;
  /** 피아노 키 높이 스케일 변경 핸들러 */
  onPianoKeyHeightScaleChange: (value: number) => void;
  /** 최소 줌 레벨 */
  minZoom?: number;
  /** 최대 줌 레벨 */
  maxZoom?: number;
}

/**
 * EditorHeader 컴포넌트
 * Phase 7.5: MidiEditor의 헤더 UI를 담당하는 컴포넌트
 * 
 * 에디터 제목, 줌 컨트롤, 키 높이 컨트롤, 닫기 버튼을 포함합니다.
 */
export const EditorHeader: React.FC<EditorHeaderProps> = ({
  title = 'MIDI Editor',
  onClose,
  pixelsPerSecond,
  onPixelsPerSecondChange,
  setHasUserAdjustedZoom,
  pianoKeyHeightScale,
  onPianoKeyHeightScaleChange,
  minZoom = MIDI_EDITOR_CONSTANTS.MIN_ZOOM,
  maxZoom = MIDI_EDITOR_CONSTANTS.MAX_ZOOM,
}) => {
  const handleZoomChange = (value: number) => {
    onPixelsPerSecondChange(value);
    if (setHasUserAdjustedZoom) {
      setHasUserAdjustedZoom(true);
    }
  };

  return (
    <div className={styles.editorHeader}>
      <h3 className={styles.editorTitle}>{title}</h3>
      
      {/* 줌 컨트롤 */}
      <div className={styles.zoomControl}>
        <span className={styles.zoomLabel}>Zoom:</span>
        <input
          type="range"
          min={minZoom}
          max={maxZoom}
          value={pixelsPerSecond}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className={styles.zoomSlider}
        />
      </div>
      
      {/* 키 높이 컨트롤 */}
      <div className={styles.zoomControl}>
        <span className={styles.zoomLabel}>Key Height:</span>
        <input
          type="range"
          min={MIDI_EDITOR_CONSTANTS.PIANO_KEY_HEIGHT_SLIDER_MIN}
          max={MIDI_EDITOR_CONSTANTS.PIANO_KEY_HEIGHT_SLIDER_MAX}
          value={pianoKeyHeightScale * MIDI_EDITOR_CONSTANTS.PIANO_KEY_HEIGHT_SLIDER_SCALE}
          onChange={(e) => onPianoKeyHeightScaleChange(Number(e.target.value) / MIDI_EDITOR_CONSTANTS.PIANO_KEY_HEIGHT_SLIDER_SCALE)}
          className={styles.zoomSlider}
        />
      </div>
      
      {/* 닫기 버튼 */}
      <button className={styles.closeButton} onClick={onClose}>
        ×
      </button>
    </div>
  );
};

