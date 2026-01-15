import React from 'react';
import styles from './Toolbar.module.css';
import TransportControls from './TransportControls';
import BpmControl from './BpmControl';
import QuantizeButton from './QuantizeButton';
import CursorModeButton from './CursorModeButton';
import ZoomControl from './ZoomControl';
import TimelinePosition from './TimelinePosition';
import ThemeToggle from './ThemeToggle';
import CollaborationButtons from './CollaborationButtons';
import SaveLoadButtons from './SaveLoadButtons';
import PanelToggleButtons from './PanelToggleButtons';
import { useUIState } from '../../store/uiStore';
import { getProject, cloneMidiPart } from '../../store/projectStore';
import { ticksToMeasurePure, getTimeSignature, getPpqn } from '../../utils/midiTickUtils';

/**
 * 툴바 컴포넌트 Props
 * 프로젝트의 주요 컨트롤을 제공하는 상단 툴바입니다.
 */
interface ToolbarProps {
  /** 현재 BPM */
  bpm: number;
  /** BPM 변경 콜백 함수 */
  onBpmChange: (bpm: number) => void;
  /** 현재 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 줌 레벨 변경 콜백 함수 */
  onPixelsPerSecondChange: (value: number) => void;
  /** 현재 타임 시그니처 */
  timeSignature: [number, number];
  /** 타임 시그니처 변경 콜백 함수 */
  onTimeSignatureChange: (timeSignature: [number, number]) => void;
  /** 녹음 상태 변경 콜백 함수 (선택) */
  onRecordingChange?: (isRecording: boolean) => void;
  /** 트랙 리스트 표시 여부 (기본값: true) */
  showTrackList?: boolean;
  /** 인스펙터 표시 여부 (기본값: true) */
  showInspector?: boolean;
  /** 믹서 표시 여부 (기본값: true) */
  showMixer?: boolean;
  /** 트랙 리스트 토글 콜백 함수 (선택) */
  onTrackListToggle?: () => void;
  /** 인스펙터 토글 콜백 함수 (선택) */
  onInspectorToggle?: () => void;
  /** 믹서 토글 콜백 함수 (선택) */
  onMixerToggle?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  bpm,
  onBpmChange,
  pixelsPerSecond,
  onPixelsPerSecondChange,
  timeSignature,
  onTimeSignatureChange,
  onRecordingChange,
  showTrackList = true,
  showInspector = true,
  showMixer = true,
  onTrackListToggle,
  onInspectorToggle,
  onMixerToggle,
}) => {
  const ui = useUIState();
  
  const handleDuplicate = React.useCallback(() => {
    const selectedPartIds = Array.from(ui.selectedClipIds);
    if (selectedPartIds.length === 0) return;
    
    const project = getProject();
    const newPartIds: string[] = [];
    
    selectedPartIds.forEach(partId => {
      const part = project.midiParts.find(p => p.id === partId);
      if (part) {
        // 원본 파트 바로 뒤에 복제 (파트 길이만큼 오프셋)
        // Tick 기반으로 계산 (SMF 표준 정합)
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const { measureStart: partMeasureStart, measureDuration: partMeasureDuration } = ticksToMeasurePure(
          part.startTick,
          part.durationTicks,
          projectTimeSignature,
          ppqn
        );
        const newMeasureStart = partMeasureStart + partMeasureDuration;
        const newPartId = cloneMidiPart(partId, newMeasureStart, part.trackId);
        if (newPartId) {
          newPartIds.push(newPartId);
        }
      }
    });
    
    if (newPartIds.length > 0) {
      ui.setSelectedClipIds(new Set(newPartIds));
    }
  }, [ui]);
  
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <div className={styles.toolbarLeft}>
          <SaveLoadButtons />
          <CollaborationButtons 
            onStartHost={() => {
              // TODO: 호스트 시작 기능 구현
            }}
            onJoinSession={() => {
              // TODO: 세션 참가 기능 구현
            }}
          />
        </div>
        <div className={styles.toolbarCenter}>
          <TransportControls onRecordingChange={onRecordingChange} />
          <TimelinePosition 
            bpm={bpm} 
            timeSignature={timeSignature}
            onTimeSignatureChange={onTimeSignatureChange}
          />
          <BpmControl initialBpm={bpm} onBpmChange={onBpmChange} />
          <QuantizeButton 
            isActive={ui.isQuantizeEnabled} 
            onToggle={ui.toggleQuantize}
            isMetronomeOn={ui.isMetronomeOn}
            onMetronomeToggle={ui.toggleMetronome}
            isAutoScrollEnabled={ui.isAutoScrollEnabled}
            onAutoScrollToggle={ui.toggleAutoScroll}
          />
          <CursorModeButton
            cursorMode={ui.cursorMode}
            mergeFlashActive={ui.mergeFlashActive}
            duplicateModeActive={ui.duplicateModeActive}
            duplicateFlashActive={ui.duplicateFlashActive}
            hasSelectedParts={ui.selectedClipIds.size > 0}
            isHoveringPart={ui.hoveredPartId !== null}
            isDraggingPart={ui.isDraggingPart}
            onSplitToggle={ui.toggleSplit}
            onMergeToggle={ui.toggleMerge}
            onDuplicate={handleDuplicate}
          />
        </div>
        <div className={styles.toolbarRight}>
          <PanelToggleButtons
            showTrackList={showTrackList}
            showInspector={showInspector}
            showMixer={showMixer}
            onTrackListToggle={onTrackListToggle || (() => {})}
            onInspectorToggle={onInspectorToggle || (() => {})}
            onMixerToggle={onMixerToggle || (() => {})}
          />
          <ZoomControl 
            value={pixelsPerSecond}
            min={10}
            max={200}
            onChange={onPixelsPerSecondChange}
          />
          <ThemeToggle />
        </div>
      </div>
      <div className={styles.toolbarBottom}>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  );
};

export default Toolbar;
