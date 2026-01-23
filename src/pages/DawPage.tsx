import React, { useRef, useState, useEffect } from 'react';
import styles from './DawPage.module.css';
import Toolbar from '../components/Toolbar/Toolbar';
import TrackHeightSlider from '../components/TrackList/TrackHeightSlider';
import TrackList, { type TrackListRef } from '../components/TrackList/TrackList';
import MeasureRuler from '../components/EventDisplay/MeasureRuler';
import EventDisplay from '../components/EventDisplay/EventDisplay';
import Inspector from '../components/Inspector/Inspector';
import DeveloperPanel from '../components/Inspector/DeveloperPanel';
import Mixer from '../components/Mixer/Mixer';
import { getProject, updateBpm, updateTimeSignature, subscribeToProjectChanges, setProject, updateTrack } from '../store/projectStore';
import { addEffectToMaster } from '../store/projectActions';
import type { Effect } from '../types/project';
import { useUIState } from '../store/uiStore';
import { useResize } from '../hooks/useResize';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { UI_CONSTANTS } from '../constants/ui';
import { APP_VERSION } from '../constants/app';
import { getBpm, getTimeSignature } from '../utils/midiTickUtils';
import { cleanupAllResources } from '../utils/resourceCleanup';
import { importMidiFileToProject } from '../core/midi/MidiParser';
import { checkAndUpdatePartyTime } from '../utils/partyTime';
import { subscribeAudioLoading } from '../utils/audioLoadingStore';
import { initLongTaskLogger } from '../utils/longTaskLogger';

// 초기 로드할 MIDI 파일 목록
const DEFAULT_MIDI_FILES = [
  'Jace - Glassy Snow.mid',
  // 여기에 추가 MIDI 파일을 나열할 수 있습니다
];

const DawPage: React.FC = () => {
  // 초기 MIDI 파일 랜덤 로드 (한 번만 실행)
  // Electron 패키징 환경(file://)에서는 랜덤 MIDI 로드 및 이펙트 추가를 하지 않음
  useEffect(() => {
    // Electron 패키징 환경 감지 (file:// 프로토콜)
    const isPackaged = window.location.protocol === 'file:';
    
    // 패키징 환경에서는 빈 프로젝트 상태(트랙 하나만 있는 상태)로 시작
    if (isPackaged) {
      return;
    }

    const loadRandomMidiFile = async () => {
      // 이미 프로젝트에 MIDI 파트가 있으면 로드하지 않음 (새로고침이 아닌 경우)
      const currentProject = getProject();
      if (currentProject.midiParts.length > 0) {
        return;
      }

      if (DEFAULT_MIDI_FILES.length === 0) {
        return;
      }

      try {
        // 랜덤하게 하나 선택
        const randomIndex = Math.floor(Math.random() * DEFAULT_MIDI_FILES.length);
        const selectedFile = DEFAULT_MIDI_FILES[randomIndex];
        // Vite의 public/ 자산은 dist/ 루트에 복사됨.
        // Electron 패키징(file://)에서는 절대경로(/samples/...)가 파일시스템 루트로 해석되어 실패할 수 있으므로
        // index.html 기준 상대경로로 로드한다.
        const filePath = `./samples/midi-files/${selectedFile}`;

        const response = await fetch(filePath);
        if (!response.ok) {
          console.warn(`Failed to load MIDI file: ${filePath}`, response.statusText);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const project = importMidiFileToProject(uint8Array);
        
        // MIDI 파일의 BPM 가져오기 (첫 번째 템포 이벤트의 MPQN을 BPM으로 변환)
        let midiBpm: number | null = null;
        if (project.timing && project.timing.tempoMap.length > 0) {
          const firstTempoEvent = project.timing.tempoMap[0];
          // MPQN을 BPM으로 변환: BPM = 60,000,000 / MPQN
          midiBpm = Math.round(60000000 / firstTempoEvent.mpqn);
        }
        
        setProject(project);
        
        // 프로젝트 설정 후 BPM 업데이트 (이벤트 구독이 제대로 작동하도록)
        if (midiBpm !== null) {
          // 약간의 지연을 두어 setProject가 완전히 처리된 후 updateBpm 호출
          setTimeout(() => {
            updateBpm(midiBpm!);
          }, 0);
        }
        
        // 첫 번째 트랙의 이름을 파일명에서 추출하여 설정 (확장자 제거)
        if (project.tracks.length > 0) {
          const fileNameWithoutExt = selectedFile.replace(/\.(mid|midi)$/i, '');
          updateTrack(project.tracks[0].id, { name: fileNameWithoutExt });
        }
        
        // 마스터 이펙트 추가 (MIDI 파일 로드 시 초기화되므로 다시 추가)
        const delayEffect: Effect = {
          type: 'delay',
          enabled: true,
          params: {
            delayDivision: 0.25, // 1/4
            feedback: 50, // 50%
            mix: 15, // 15%
          },
        };
        const reverbEffect: Effect = {
          type: 'reverb',
          enabled: true,
          params: {
            roomSize: 50, // 50%
            dampening: 30, // 30%
            wetLevel: 30, // 30%
          },
        };
        addEffectToMaster(delayEffect);
        addEffectToMaster(reverbEffect);
      } catch (error) {
        console.warn('Failed to load random MIDI file:', error);
        // 실패해도 빈 프로젝트로 시작
      }
    };

    loadRandomMidiFile();
  }, []); // 빈 배열: 컴포넌트 마운트 시 한 번만 실행
  
  // 초기 파티타임 체크 (컴포넌트 마운트 시)
  useEffect(() => {
    checkAndUpdatePartyTime();
  }, []);

  useEffect(() => {
    initLongTaskLogger();
  }, []);
  
  // 페이지 언마운트 시 모든 리소스 정리
  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 리소스 해제
      void cleanupAllResources();
    };
  }, []);
  
  // 브라우저 이벤트에 cleanup 등록
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 동기적으로 처리하기 위해 void로 호출 (완료를 기다리지 않음)
      void cleanupAllResources();
    };
    
    const handlePageHide = () => {
      // 페이지 숨김 시에도 리소스 해제
      void cleanupAllResources();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // UI 상태 관리
  const ui = useUIState();
  const trackListRef = useRef<TrackListRef>(null);
  
  // 프로젝트 상태 가져오기
  const project = getProject();
  const [bpm, setBpm] = useState(getBpm(project));
  const [timeSignature, setTimeSignature] = useState<[number, number]>(getTimeSignature(project));
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  // 프로젝트 변경 구독
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      if (event.type === 'bpm') {
        const updatedProject = getProject();
        setBpm(getBpm(updatedProject));
      } else if (event.type === 'timeSignature') {
        // 이벤트에서 직접 timeSignature 값을 사용하여 즉시 반영
        setTimeSignature(event.timeSignature);
      }
    });
    



    return unsubscribe;
  }, []);

  useEffect(() => {
    return subscribeAudioLoading((isLoading) => {
      setIsAudioLoading(isLoading);
    });
  }, []);

  // BPM 및 Time Signature 변경 핸들러
  const handleBpmChange = React.useCallback((newBpm: number) => {



    updateBpm(newBpm);



  }, []);

  const handleTimeSignatureChange = React.useCallback((newTimeSignature: [number, number]) => {



    updateTimeSignature(newTimeSignature);



  }, []);

  // 리사이즈 핸들러
  const handleTrackListResizeStart = useResize({
    minSize: UI_CONSTANTS.PANEL_MIN_WIDTH,
    maxSize: UI_CONSTANTS.PANEL_MAX_WIDTH,
    initialSize: ui.trackListWidth,
    orientation: 'horizontal',
    onResize: ui.setTrackListWidth,
  });

  const handleInspectorResizeStart = useResize({
    minSize: UI_CONSTANTS.PANEL_MIN_WIDTH,
    maxSize: UI_CONSTANTS.PANEL_MAX_WIDTH,
    initialSize: ui.inspectorWidth,
    orientation: 'horizontal',
    onResize: ui.setInspectorWidth,
    reverseDirection: true, // Inspector는 오른쪽에서 왼쪽으로 드래그
  });

  const handleMixerResizeStart = useResize({
    minSize: UI_CONSTANTS.PANEL_MIN_HEIGHT,
    maxSize: UI_CONSTANTS.PANEL_MAX_HEIGHT,
    initialSize: ui.mixerHeight,
    orientation: 'vertical',
    onResize: ui.setMixerHeight,
  });

  // 전역 키보드 단축키 처리 (Phase 6.2: 훅으로 분리)
  useKeyboardShortcuts();

  return (
    <div className={styles.dawContainer} style={{ '--tracklist-width': `${ui.trackListWidth}px` } as React.CSSProperties}>
      <Toolbar 
        bpm={bpm}
        onBpmChange={handleBpmChange}
        pixelsPerSecond={ui.pixelsPerSecond}
        onPixelsPerSecondChange={ui.setPixelsPerSecond}
        timeSignature={timeSignature}
        onTimeSignatureChange={handleTimeSignatureChange}
        onRecordingChange={ui.setIsRecording}
        showTrackList={ui.showTrackList}
        showInspector={ui.showInspector}
        showMixer={ui.showMixer}
        onTrackListToggle={ui.toggleTrackList}
        onInspectorToggle={ui.toggleInspector}
        onMixerToggle={ui.toggleMixer}
      />
      <div className={styles.mainSection}>
        {ui.showTrackList && (
          <>
            <div 
              className={styles.trackListSection}
              style={{ width: `${ui.trackListWidth}px` }}
            >
              <TrackHeightSlider 
                trackListRef={trackListRef}
                sliderValue={ui.trackHeightSliderValue}
                onSliderValueChange={ui.setTrackHeightSliderValue}
              />
              <TrackList 
                ref={trackListRef}
                onTrackHeightsChange={ui.setTrackHeights}
                scrollTop={ui.timelineScrollTop}
                selectedTrackId={ui.selectedTrackId}
                onTrackSelect={ui.setSelectedTrackId}
                defaultTrackHeight={ui.trackHeightSliderValue}
              />
            </div>
            <div 
              className={styles.trackListResizeHandle}
              onMouseDown={handleTrackListResizeStart}
            />
          </>
        )}
        <div className={styles.timelineSection}>
          <div className={styles.ruler}>
            <MeasureRuler 
              bpm={bpm} 
              timeSignature={timeSignature}
              pixelsPerSecond={ui.pixelsPerSecond}
              isRecording={ui.isRecording}
            />
          </div>
          <div className={styles.eventDisplay}>
            <EventDisplay 
              bpm={bpm}
              timeSignature={timeSignature}
              pixelsPerSecond={ui.pixelsPerSecond}
              trackHeights={ui.trackHeights}
              onScrollSync={ui.setTimelineScrollTop}
              selectedTrackId={ui.selectedTrackId}
              onTrackSelect={ui.setSelectedTrackId}
              isRecording={ui.isRecording}
            />
          </div>
          <div className={styles.timelineScrollbar} id="timeline-scrollbar">
            <div style={{ width: '3000px', height: '1px' }}></div>
          </div>
          {ui.showMixer && (
          <>
            <div 
              className={styles.mixerResizeHandle}
              onMouseDown={handleMixerResizeStart}
            />
            <div 
              className={styles.mixerSection}
              style={{ height: `${ui.mixerHeight}px`, minHeight: `${ui.mixerHeight}px` }}
            >
              <Mixer 
                selectedTrackId={ui.selectedTrackId}
                onTrackSelect={ui.setSelectedTrackId}
              />
            </div>
          </>
          )}
        </div>
        {ui.showInspector && (
        <div 
          className={styles.inspectorResizeHandle}
          onMouseDown={handleInspectorResizeStart}
        />
        )}
        {ui.showInspector && (
        <div 
          className={styles.inspectorSection}
          style={{ width: `${ui.inspectorWidth}px` }}
        >
          <Inspector selectedTrackId={ui.selectedTrackId || undefined} />
          <DeveloperPanel />
        </div>
        )}
      </div>
      <div className={styles.versionLabel}>v{APP_VERSION}</div>
      {isAudioLoading && (
        <div className={styles.audioLoadingOverlay}>
          <div className={styles.audioLoadingCard}>
            <div className={styles.audioLoadingSpinner} />
            <div className={styles.audioLoadingText}>Loading samples...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DawPage;
