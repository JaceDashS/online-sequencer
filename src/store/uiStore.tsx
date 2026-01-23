import { createContext, useContext, useCallback, useReducer, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { setDebugLogBufferSize as setDebugLogBufferSizeInLogger } from '../utils/debugLogger';
import { audioLevelStore } from '../utils/audioLevelStore';
import { AUDIO_BUFFER_CONSTANTS } from '../constants/ui';
import { setPlaybackDriftThresholdMs, setPlaybackTime } from '../utils/playbackTimeStore';

/**
 * UI 상태 타입 정의
 * DAW 애플리케이션의 전역 UI 상태를 관리합니다.
 */
export interface UIState {
  // 패널 가시성
  showTrackList: boolean;
  showInspector: boolean;
  showMixer: boolean;
  
  // 패널 크기
  trackListWidth: number;
  inspectorWidth: number;
  mixerHeight: number;
  
  // 줌 및 스크롤
  pixelsPerSecond: number;
  timelineScrollTop: number;
  
  // 트랙 높이 관련
  trackHeights: Map<string, number>;
  trackHeightSliderValue: number;
  
  // 선택 및 재생 상태
  selectedTrackId: string | null;
  selectedClipIds: Set<string>;
  isRecording: boolean;
  currentPlaybackTime: number;
  
  // 퀀타이즈 상태
  isQuantizeEnabled: boolean;
  
  // 메트로놈 상태
  isMetronomeOn: boolean;

  // 오토스크롤 상태
  isAutoScrollEnabled: boolean;

  // 디버그 로그 버퍼 사이즈
  debugLogBufferSize: number;
  audioBufferSize: number;
  playbackDriftMs: number;
  pitchOffsetMaxMs: number; // 같은 음계 간섭 방지를 위한 최대 시간 오프셋 (밀리초)
  scheduleLookaheadSeconds: number;
  levelMeterEnabled: boolean;
  freezeTimelineRender: boolean;
  devModeEnabled: boolean;
  
  // 커서 모드 상태
  cursorMode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null;
  
  // Merge 플래시 상태 (Enter 키로 merge 시 일시적으로 활성화)
  mergeFlashActive: boolean;
  
  // 복제 모드 상태 (드래그 중 Ctrl 키를 누르면 활성화)
  duplicateModeActive: boolean;
  
  // Duplicate 플래시 상태 (노트 복제 시 일시적으로 활성화)
  duplicateFlashActive: boolean;
  
  // Export 범위
  exportRangeStart: number | null;
  exportRangeEnd: number | null;
  
  // 현재 열려있는 미디 에디터의 파트 ID
  editingPartId: string | null;
  
  // 호버된 미디 파트 ID
  hoveredPartId: string | null;
  
  // 드래그 중인지 여부
  isDraggingPart: boolean;
}

/**
 * UI 액션 타입
 * UI 상태를 변경하는 함수들의 집합입니다.
 */
export interface UIActions {
  setShowTrackList: (show: boolean) => void;
  setShowInspector: (show: boolean) => void;
  setShowMixer: (show: boolean) => void;
  toggleTrackList: () => void;
  toggleInspector: () => void;
  toggleMixer: () => void;
  
  setTrackListWidth: (width: number) => void;
  setInspectorWidth: (width: number) => void;
  setMixerHeight: (height: number) => void;
  
  setPixelsPerSecond: (value: number) => void;
  setTimelineScrollTop: (scrollTop: number) => void;
  
  setTrackHeights: (heights: Map<string, number>) => void;
  setTrackHeightSliderValue: (value: number) => void;
  
  setSelectedTrackId: (trackId: string | null) => void;
  setSelectedClipIds: (clipIds: Set<string>) => void;
  addSelectedClipId: (clipId: string) => void;
  removeSelectedClipId: (clipId: string) => void;
  toggleSelectedClipId: (clipId: string) => void;
  clearSelectedClipIds: () => void;
  setIsRecording: (recording: boolean) => void;
  setCurrentPlaybackTime: (time: number) => void;
  setIsQuantizeEnabled: (enabled: boolean) => void;
  toggleQuantize: () => void;
  
  setIsMetronomeOn: (on: boolean) => void;
  toggleMetronome: () => void;

  setIsAutoScrollEnabled: (enabled: boolean) => void;
  toggleAutoScroll: () => void;

  setDebugLogBufferSize: (size: number) => void;
  setAudioBufferSize: (size: number) => void;
  setPlaybackDriftMs: (value: number) => void;
  setPitchOffsetMaxMs: (value: number) => void;
  setScheduleLookaheadSeconds: (value: number) => void;
  setLevelMeterEnabled: (enabled: boolean) => void;
  setFreezeTimelineRender: (enabled: boolean) => void;
  setDevModeEnabled: (enabled: boolean) => void;
  toggleDevMode: () => void;
  
  setCursorMode: (mode: 'splitByKey3' | 'splitByAlt' | 'mergeByKey4' | null) => void;
  toggleSplit: () => void;
  toggleMerge: () => void;
  setMergeFlashActive: (active: boolean) => void;
  setDuplicateModeActive: (active: boolean) => void;
  setDuplicateFlashActive: (active: boolean) => void;
  
  setExportRangeStart: (time: number | null) => void;
  setExportRangeEnd: (time: number | null) => void;
  setExportRange: (start: number | null, end: number | null) => void;
  clearExportRange: () => void;
  
  setEditingPartId: (partId: string | null) => void;
  
  setHoveredPartId: (partId: string | null) => void;
  
  setIsDraggingPart: (isDragging: boolean) => void;
}

/**
 * UI 액션 타입 (리듀서 패턴용)
 * Phase 6.1: 리듀서 패턴 도입
 */
export type UIAction =
  // 패널 가시성
  | { type: 'SET_SHOW_TRACK_LIST'; payload: boolean }
  | { type: 'SET_SHOW_INSPECTOR'; payload: boolean }
  | { type: 'SET_SHOW_MIXER'; payload: boolean }
  | { type: 'TOGGLE_TRACK_LIST' }
  | { type: 'TOGGLE_INSPECTOR' }
  | { type: 'TOGGLE_MIXER' }
  
  // 패널 크기
  | { type: 'SET_TRACK_LIST_WIDTH'; payload: number }
  | { type: 'SET_INSPECTOR_WIDTH'; payload: number }
  | { type: 'SET_MIXER_HEIGHT'; payload: number }
  
  // 줌 및 스크롤
  | { type: 'SET_PIXELS_PER_SECOND'; payload: number }
  | { type: 'SET_TIMELINE_SCROLL_TOP'; payload: number }
  
  // 트랙 높이
  | { type: 'SET_TRACK_HEIGHTS'; payload: Map<string, number> }
  | { type: 'SET_TRACK_HEIGHT_SLIDER_VALUE'; payload: number }
  
  // 선택 및 재생
  | { type: 'SET_SELECTED_TRACK_ID'; payload: string | null }
  | { type: 'SET_SELECTED_CLIP_IDS'; payload: Set<string> }
  | { type: 'ADD_SELECTED_CLIP_ID'; payload: string }
  | { type: 'REMOVE_SELECTED_CLIP_ID'; payload: string }
  | { type: 'TOGGLE_SELECTED_CLIP_ID'; payload: string }
  | { type: 'CLEAR_SELECTED_CLIP_IDS' }
  | { type: 'SET_IS_RECORDING'; payload: boolean }
  | { type: 'SET_CURRENT_PLAYBACK_TIME'; payload: number }
  
  // 퀀타이즈 및 메트로놈
  | { type: 'SET_IS_QUANTIZE_ENABLED'; payload: boolean }
  | { type: 'TOGGLE_QUANTIZE' }
  | { type: 'SET_IS_METRONOME_ON'; payload: boolean }
  | { type: 'TOGGLE_METRONOME' }
  | { type: 'SET_IS_AUTO_SCROLL_ENABLED'; payload: boolean }
  | { type: 'TOGGLE_AUTO_SCROLL' }
  
  // 디버그 및 설정
  | { type: 'SET_DEBUG_LOG_BUFFER_SIZE'; payload: number }
  | { type: 'SET_AUDIO_BUFFER_SIZE'; payload: number }
  | { type: 'SET_PLAYBACK_DRIFT_MS'; payload: number }
  | { type: 'SET_PITCH_OFFSET_MAX_MS'; payload: number }
  | { type: 'SET_SCHEDULE_LOOKAHEAD_SECONDS'; payload: number }
  | { type: 'SET_LEVEL_METER_ENABLED'; payload: boolean }
  | { type: 'SET_FREEZE_TIMELINE_RENDER'; payload: boolean }
  | { type: 'SET_DEV_MODE_ENABLED'; payload: boolean }
  | { type: 'TOGGLE_DEV_MODE' }
  
  // 커서 모드
  | { type: 'SET_CURSOR_MODE'; payload: 'splitByKey3' | 'splitByAlt' | 'mergeByKey4' | null }
  | { type: 'TOGGLE_SPLIT' }
  | { type: 'TOGGLE_MERGE' }
  
  // 플래시 상태
  | { type: 'SET_MERGE_FLASH_ACTIVE'; payload: boolean }
  | { type: 'SET_DUPLICATE_MODE_ACTIVE'; payload: boolean }
  | { type: 'SET_DUPLICATE_FLASH_ACTIVE'; payload: boolean }
  
  // Export 범위
  | { type: 'SET_EXPORT_RANGE_START'; payload: number | null }
  | { type: 'SET_EXPORT_RANGE_END'; payload: number | null }
  | { type: 'SET_EXPORT_RANGE'; payload: { start: number | null; end: number | null } }
  | { type: 'CLEAR_EXPORT_RANGE' }
  
  // 편집 상태
  | { type: 'SET_EDITING_PART_ID'; payload: string | null }
  | { type: 'SET_HOVERED_PART_ID'; payload: string | null }
  | { type: 'SET_IS_DRAGGING_PART'; payload: boolean };

type UIContextType = UIState & UIActions;

// Phase 6.1: Context 분할 (State/Actions 분리)
// State Context (자주 변경)
const UIStateContext = createContext<UIState | undefined>(undefined);

// Actions Context (거의 변경 안 됨)
const UIActionsContext = createContext<UIActions | undefined>(undefined);

// 하위 호환성을 위한 기존 Context (deprecated, Step 11에서 제거 예정)
const UIContext = createContext<UIContextType | undefined>(undefined);

type AudioBufferSize = (typeof AUDIO_BUFFER_CONSTANTS.BUFFER_SIZES)[number];

const isAudioBufferSize = (value: number): value is AudioBufferSize => {
  return AUDIO_BUFFER_CONSTANTS.BUFFER_SIZES.includes(value as AudioBufferSize);
};

// Helper 함수: cursorMode가 split 모드인지 확인
export const isSplitMode = (cursorMode: UIState['cursorMode']): boolean => {
  return cursorMode === 'splitByKey3Normal' || cursorMode === 'splitByKey3Quantized' ||
         cursorMode === 'splitByAltNormal' || cursorMode === 'splitByAltQuantized';
};

// Helper 함수: cursorMode가 splitByKey3 모드인지 확인
export const isSplitByKey3Mode = (cursorMode: UIState['cursorMode']): boolean => {
  return cursorMode === 'splitByKey3Normal' || cursorMode === 'splitByKey3Quantized';
};

// Helper 함수: cursorMode가 splitByAlt 모드인지 확인
export const isSplitByAltMode = (cursorMode: UIState['cursorMode']): boolean => {
  return cursorMode === 'splitByAltNormal' || cursorMode === 'splitByAltQuantized';
};

/**
 * 퀀타이즈 상태에 따라 cursorMode를 변환하는 헬퍼 함수
 * Phase 6.1: 리듀서 패턴 도입 - 상태 간 의존성 로직 추출
 */
function convertCursorModeForQuantize(
  mode: 'splitByKey3' | 'splitByAlt' | 'mergeByKey4' | null,
  quantizeEnabled: boolean
): UIState['cursorMode'] {
  if (mode === 'splitByKey3') {
    return quantizeEnabled ? 'splitByKey3Quantized' : 'splitByKey3Normal';
  } else if (mode === 'splitByAlt') {
    return quantizeEnabled ? 'splitByAltQuantized' : 'splitByAltNormal';
  } else {
    return mode;
  }
}

/**
 * 현재 cursorMode를 퀀타이즈 상태에 맞게 변환하는 헬퍼 함수
 * Phase 6.1: 리듀서 패턴 도입 - TOGGLE_QUANTIZE에서 사용
 */
function convertCurrentCursorModeForQuantize(
  currentMode: UIState['cursorMode'],
  newQuantizeEnabled: boolean
): UIState['cursorMode'] {
  if (currentMode === 'splitByKey3Normal' && newQuantizeEnabled) {
    return 'splitByKey3Quantized';
  } else if (currentMode === 'splitByKey3Quantized' && !newQuantizeEnabled) {
    return 'splitByKey3Normal';
  } else if (currentMode === 'splitByAltNormal' && newQuantizeEnabled) {
    return 'splitByAltQuantized';
  } else if (currentMode === 'splitByAltQuantized' && !newQuantizeEnabled) {
    return 'splitByAltNormal';
  }
  return currentMode;
}

// 초기 UI 상태
const initialState: UIState = {
  showTrackList: true,
  showInspector: true,
  showMixer: true,
  trackListWidth: 250,
  inspectorWidth: 250, 
  mixerHeight: 400,
  pixelsPerSecond: 50,
  timelineScrollTop: 0,
  trackHeights: new Map(),
  trackHeightSliderValue: 70,
  selectedTrackId: 'master', // 초기 상태에서 마스터 채널에 포커스
  selectedClipIds: new Set<string>(),
  isRecording: false,
  currentPlaybackTime: 0,
  isQuantizeEnabled: false,
  isMetronomeOn: false,
  isAutoScrollEnabled: false,
  debugLogBufferSize: 0,
  audioBufferSize: AUDIO_BUFFER_CONSTANTS.DEFAULT_BUFFER_SIZE,
  playbackDriftMs: 20,
  pitchOffsetMaxMs: 3, // 기본값: 3ms
  scheduleLookaheadSeconds: 0.5,
  levelMeterEnabled: true,
  freezeTimelineRender: false,
  devModeEnabled: false,
  cursorMode: null,
    mergeFlashActive: false,
    duplicateModeActive: false,
    duplicateFlashActive: false,
  exportRangeStart: null,
  exportRangeEnd: null,
  editingPartId: null,
  hoveredPartId: null,
  isDraggingPart: false,
};

setDebugLogBufferSizeInLogger(initialState.debugLogBufferSize);
setPlaybackDriftThresholdMs(initialState.playbackDriftMs);

/**
 * UI 상태 리듀서
 * Phase 6.1: 리듀서 패턴 도입 완료
 * 
 * 모든 UI 상태 변경 로직이 이 리듀서에 집중되어 있습니다.
 * 상태 간 의존성은 헬퍼 함수로 처리됩니다.
 */
const uiReducer = (state: UIState, action: UIAction): UIState => {
  switch (action.type) {
    // 패널 가시성
    case 'SET_SHOW_TRACK_LIST':
      return { ...state, showTrackList: action.payload };
    case 'SET_SHOW_INSPECTOR':
      return { ...state, showInspector: action.payload };
    case 'SET_SHOW_MIXER':
      return { ...state, showMixer: action.payload };
    case 'TOGGLE_TRACK_LIST':
      return { ...state, showTrackList: !state.showTrackList };
    case 'TOGGLE_INSPECTOR':
      return { ...state, showInspector: !state.showInspector };
    case 'TOGGLE_MIXER':
      return { ...state, showMixer: !state.showMixer };
    
    // 패널 크기
    case 'SET_TRACK_LIST_WIDTH':
      return { ...state, trackListWidth: action.payload };
    case 'SET_INSPECTOR_WIDTH':
      return { ...state, inspectorWidth: action.payload };
    case 'SET_MIXER_HEIGHT':
      return { ...state, mixerHeight: action.payload };
    
    // 선택 및 재생
    case 'SET_SELECTED_TRACK_ID':
      return { ...state, selectedTrackId: action.payload };
    case 'SET_SELECTED_CLIP_IDS':
      return { ...state, selectedClipIds: new Set(action.payload) };
    case 'ADD_SELECTED_CLIP_ID': {
      const newSet = new Set(state.selectedClipIds);
      newSet.add(action.payload);
      return { ...state, selectedClipIds: newSet };
    }
    case 'REMOVE_SELECTED_CLIP_ID': {
      const newSet = new Set(state.selectedClipIds);
      newSet.delete(action.payload);
      return { ...state, selectedClipIds: newSet };
    }
    case 'TOGGLE_SELECTED_CLIP_ID': {
      const newSet = new Set(state.selectedClipIds);
      if (newSet.has(action.payload)) {
        newSet.delete(action.payload);
      } else {
        newSet.add(action.payload);
      }
      return { ...state, selectedClipIds: newSet };
    }
    case 'CLEAR_SELECTED_CLIP_IDS':
      return { ...state, selectedClipIds: new Set<string>() };
    case 'SET_IS_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'SET_CURRENT_PLAYBACK_TIME':      return { ...state, currentPlaybackTime: action.payload };
    
    // 줌 및 스크롤
    case 'SET_PIXELS_PER_SECOND':
      return { ...state, pixelsPerSecond: action.payload };
    case 'SET_TIMELINE_SCROLL_TOP':
      return { ...state, timelineScrollTop: action.payload };
    
    // 트랙 높이
    case 'SET_TRACK_HEIGHTS':
      return { ...state, trackHeights: action.payload };
    case 'SET_TRACK_HEIGHT_SLIDER_VALUE':
      return { ...state, trackHeightSliderValue: action.payload };
    
    // 메트로놈
    case 'SET_IS_METRONOME_ON':
      return { ...state, isMetronomeOn: action.payload };
    case 'TOGGLE_METRONOME':
      return { ...state, isMetronomeOn: !state.isMetronomeOn };
    
    // 오토스크롤
    case 'SET_IS_AUTO_SCROLL_ENABLED':
      return { ...state, isAutoScrollEnabled: action.payload };
    case 'TOGGLE_AUTO_SCROLL':
      return { ...state, isAutoScrollEnabled: !state.isAutoScrollEnabled };
    
    // 디버그 및 설정
    case 'SET_DEBUG_LOG_BUFFER_SIZE': {
      const nextSize = Number.isFinite(action.payload) 
        ? Math.max(0, Math.floor(action.payload)) 
        : initialState.debugLogBufferSize;
      setDebugLogBufferSizeInLogger(nextSize); // 부작용: debugLogger 업데이트
      return { ...state, debugLogBufferSize: nextSize };
    }
    case 'SET_AUDIO_BUFFER_SIZE': {
      const nextSize = Number.isFinite(action.payload) && isAudioBufferSize(action.payload)
        ? action.payload
        : initialState.audioBufferSize;
      return { ...state, audioBufferSize: nextSize };
    }
    case 'SET_PLAYBACK_DRIFT_MS': {
      const nextValue = Number.isFinite(action.payload) 
        ? Math.max(0, Math.floor(action.payload)) 
        : initialState.playbackDriftMs;
      setPlaybackDriftThresholdMs(nextValue); // 부작용: playbackTimeStore 업데이트
      return { ...state, playbackDriftMs: nextValue };
    }
    case 'SET_PITCH_OFFSET_MAX_MS': {
      const nextValue = Number.isFinite(action.payload) 
        ? Math.max(0, Math.min(20, Math.floor(action.payload))) 
        : initialState.pitchOffsetMaxMs;
      return { ...state, pitchOffsetMaxMs: nextValue };
    }
    case 'SET_SCHEDULE_LOOKAHEAD_SECONDS': {
      const nextValue = Number.isFinite(action.payload)
        ? Math.max(0, Math.min(5, Math.round(action.payload * 100) / 100))
        : initialState.scheduleLookaheadSeconds;
      return { ...state, scheduleLookaheadSeconds: nextValue };
    }
    case 'SET_LEVEL_METER_ENABLED': {
      const nextValue = Boolean(action.payload);
      audioLevelStore.setEnabled(nextValue);
      return { ...state, levelMeterEnabled: nextValue };
    }
    case 'SET_FREEZE_TIMELINE_RENDER': {
      const nextValue = Boolean(action.payload);
      return { ...state, freezeTimelineRender: nextValue };
    }
    case 'SET_DEV_MODE_ENABLED':
      return { ...state, devModeEnabled: action.payload };
    case 'TOGGLE_DEV_MODE':
      return { ...state, devModeEnabled: !state.devModeEnabled };
    
    // 플래시 상태
    case 'SET_MERGE_FLASH_ACTIVE':
      return { ...state, mergeFlashActive: action.payload };
    case 'SET_DUPLICATE_MODE_ACTIVE':
      return { ...state, duplicateModeActive: action.payload };
    case 'SET_DUPLICATE_FLASH_ACTIVE':
      return { ...state, duplicateFlashActive: action.payload };
    
    // Export 범위
    case 'SET_EXPORT_RANGE_START':
      return { ...state, exportRangeStart: action.payload };
    case 'SET_EXPORT_RANGE_END':
      return { ...state, exportRangeEnd: action.payload };
    case 'SET_EXPORT_RANGE':
      return { ...state, exportRangeStart: action.payload.start, exportRangeEnd: action.payload.end };
    case 'CLEAR_EXPORT_RANGE':
      return { ...state, exportRangeStart: null, exportRangeEnd: null };
    
    // 편집 상태
    case 'SET_EDITING_PART_ID':
      return { ...state, editingPartId: action.payload };
    case 'SET_HOVERED_PART_ID':
      return { ...state, hoveredPartId: action.payload };
    case 'SET_IS_DRAGGING_PART':
      return { ...state, isDraggingPart: action.payload };
    
    // 퀀타이즈 (헬퍼 함수 사용)
    case 'SET_IS_QUANTIZE_ENABLED':
      return { ...state, isQuantizeEnabled: action.payload };
    case 'TOGGLE_QUANTIZE': {
      const newQuantizeEnabled = !state.isQuantizeEnabled;
      const newCursorMode = convertCurrentCursorModeForQuantize(state.cursorMode, newQuantizeEnabled);
      return { ...state, isQuantizeEnabled: newQuantizeEnabled, cursorMode: newCursorMode };
    }
    
    // 커서 모드 (헬퍼 함수 사용)
    case 'SET_CURSOR_MODE': {
      const finalMode = convertCursorModeForQuantize(action.payload, state.isQuantizeEnabled);
      return { ...state, cursorMode: finalMode };
    }
    case 'TOGGLE_SPLIT': {
      const isSplitActive = isSplitMode(state.cursorMode);
      const newMode = isSplitActive 
        ? null 
        : (state.isQuantizeEnabled ? 'splitByKey3Quantized' : 'splitByKey3Normal');
      return { ...state, cursorMode: newMode };
    }
    case 'TOGGLE_MERGE':
      return { 
        ...state, 
        cursorMode: state.cursorMode === 'mergeByKey4' ? null : 'mergeByKey4' 
      };
    
    // 기본 케이스: 모든 액션이 처리됨
    default:
      return state;
  }
};

/**
 * UI Provider Props
 */
interface UIProviderProps {
  /** 자식 컴포넌트 */
  children: ReactNode;
}

/**
 * UI 상태를 제공하는 Context Provider 컴포넌트
 * 
 * @param props - UIProviderProps
 * @returns UI 상태와 액션을 제공하는 Context Provider
 * 
 * @example
 * ```tsx
 * <UIProvider>
 *   <App />
 * </UIProvider>
 * ```
 */
export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  // Phase 6.1: useState를 useReducer로 전환
  const [state, dispatch] = useReducer(uiReducer, initialState);

  useEffect(() => {
    setPlaybackTime(state.currentPlaybackTime);
  }, [state.currentPlaybackTime]);

  // Phase 6.1: actions 객체를 dispatch 래퍼로 변환
  const actions: UIActions = {
    // 패널 가시성
    setShowTrackList: useCallback((show: boolean) => {
      dispatch({ type: 'SET_SHOW_TRACK_LIST', payload: show });
    }, []),
    setShowInspector: useCallback((show: boolean) => {
      dispatch({ type: 'SET_SHOW_INSPECTOR', payload: show });
    }, []),
    setShowMixer: useCallback((show: boolean) => {
      dispatch({ type: 'SET_SHOW_MIXER', payload: show });
    }, []),
    toggleTrackList: useCallback(() => {
      dispatch({ type: 'TOGGLE_TRACK_LIST' });
    }, []),
    toggleInspector: useCallback(() => {
      dispatch({ type: 'TOGGLE_INSPECTOR' });
    }, []),
    toggleMixer: useCallback(() => {
      dispatch({ type: 'TOGGLE_MIXER' });
    }, []),
    
    // 패널 크기
    setTrackListWidth: useCallback((width: number) => {
      dispatch({ type: 'SET_TRACK_LIST_WIDTH', payload: width });
    }, []),
    setInspectorWidth: useCallback((width: number) => {
      dispatch({ type: 'SET_INSPECTOR_WIDTH', payload: width });
    }, []),
    setMixerHeight: useCallback((height: number) => {
      dispatch({ type: 'SET_MIXER_HEIGHT', payload: height });
    }, []),
    
    // 줌 및 스크롤
    setPixelsPerSecond: useCallback((value: number) => {
      dispatch({ type: 'SET_PIXELS_PER_SECOND', payload: value });
    }, []),
    setTimelineScrollTop: useCallback((scrollTop: number) => {
      dispatch({ type: 'SET_TIMELINE_SCROLL_TOP', payload: scrollTop });
    }, []),
    
    // 트랙 높이
    setTrackHeights: useCallback((heights: Map<string, number>) => {
      dispatch({ type: 'SET_TRACK_HEIGHTS', payload: heights });
    }, []),
    setTrackHeightSliderValue: useCallback((value: number) => {
      dispatch({ type: 'SET_TRACK_HEIGHT_SLIDER_VALUE', payload: value });
    }, []),
    
    // 선택 및 재생
    setSelectedTrackId: useCallback((trackId: string | null) => {
      dispatch({ type: 'SET_SELECTED_TRACK_ID', payload: trackId });
    }, []),
    setSelectedClipIds: useCallback((clipIds: Set<string>) => {
      dispatch({ type: 'SET_SELECTED_CLIP_IDS', payload: clipIds });
    }, []),
    addSelectedClipId: useCallback((clipId: string) => {
      dispatch({ type: 'ADD_SELECTED_CLIP_ID', payload: clipId });
    }, []),
    removeSelectedClipId: useCallback((clipId: string) => {
      dispatch({ type: 'REMOVE_SELECTED_CLIP_ID', payload: clipId });
    }, []),
    toggleSelectedClipId: useCallback((clipId: string) => {
      dispatch({ type: 'TOGGLE_SELECTED_CLIP_ID', payload: clipId });
    }, []),
    clearSelectedClipIds: useCallback(() => {
      dispatch({ type: 'CLEAR_SELECTED_CLIP_IDS' });
    }, []),
    setIsRecording: useCallback((recording: boolean) => {
      dispatch({ type: 'SET_IS_RECORDING', payload: recording });
    }, []),
    setCurrentPlaybackTime: useCallback((time: number) => {
      dispatch({ type: 'SET_CURRENT_PLAYBACK_TIME', payload: time });
    }, []),
    
    // 퀀타이즈 및 메트로놈
    setIsQuantizeEnabled: useCallback((enabled: boolean) => {
      dispatch({ type: 'SET_IS_QUANTIZE_ENABLED', payload: enabled });
    }, []),
    toggleQuantize: useCallback(() => {
      dispatch({ type: 'TOGGLE_QUANTIZE' });
    }, []),
    setIsMetronomeOn: useCallback((on: boolean) => {
      dispatch({ type: 'SET_IS_METRONOME_ON', payload: on });
    }, []),
    toggleMetronome: useCallback(() => {
      dispatch({ type: 'TOGGLE_METRONOME' });
    }, []),
    setIsAutoScrollEnabled: useCallback((enabled: boolean) => {
      dispatch({ type: 'SET_IS_AUTO_SCROLL_ENABLED', payload: enabled });
    }, []),
    toggleAutoScroll: useCallback(() => {
      dispatch({ type: 'TOGGLE_AUTO_SCROLL' });
    }, []),
    
    // 디버그 및 설정
    setDebugLogBufferSize: useCallback((size: number) => {
      dispatch({ type: 'SET_DEBUG_LOG_BUFFER_SIZE', payload: size });
    }, []),
    setAudioBufferSize: useCallback((size: number) => {
      dispatch({ type: 'SET_AUDIO_BUFFER_SIZE', payload: size });
    }, []),
    setPlaybackDriftMs: useCallback((value: number) => {
      dispatch({ type: 'SET_PLAYBACK_DRIFT_MS', payload: value });
    }, []),
    setPitchOffsetMaxMs: useCallback((value: number) => {
      dispatch({ type: 'SET_PITCH_OFFSET_MAX_MS', payload: value });
    }, []),
    setScheduleLookaheadSeconds: useCallback((value: number) => {
      dispatch({ type: 'SET_SCHEDULE_LOOKAHEAD_SECONDS', payload: value });
    }, []),
    setLevelMeterEnabled: useCallback((enabled: boolean) => {
      dispatch({ type: 'SET_LEVEL_METER_ENABLED', payload: enabled });
    }, []),
    setFreezeTimelineRender: useCallback((enabled: boolean) => {
      dispatch({ type: 'SET_FREEZE_TIMELINE_RENDER', payload: enabled });
    }, []),
    setDevModeEnabled: useCallback((enabled: boolean) => {
      dispatch({ type: 'SET_DEV_MODE_ENABLED', payload: enabled });
    }, []),
    toggleDevMode: useCallback(() => {
      dispatch({ type: 'TOGGLE_DEV_MODE' });
    }, []),
    
    // 커서 모드
    setCursorMode: useCallback((mode: 'splitByKey3' | 'splitByAlt' | 'mergeByKey4' | null) => {
      dispatch({ type: 'SET_CURSOR_MODE', payload: mode });
    }, []),
    toggleSplit: useCallback(() => {
      dispatch({ type: 'TOGGLE_SPLIT' });
    }, []),
    toggleMerge: useCallback(() => {
      dispatch({ type: 'TOGGLE_MERGE' });
    }, []),
    
    // 플래시 상태
    setMergeFlashActive: useCallback((active: boolean) => {
      dispatch({ type: 'SET_MERGE_FLASH_ACTIVE', payload: active });
    }, []),
    setDuplicateModeActive: useCallback((active: boolean) => {
      dispatch({ type: 'SET_DUPLICATE_MODE_ACTIVE', payload: active });
    }, []),
    setDuplicateFlashActive: useCallback((active: boolean) => {
      dispatch({ type: 'SET_DUPLICATE_FLASH_ACTIVE', payload: active });
    }, []),
    
    // Export 범위
    setExportRangeStart: useCallback((time: number | null) => {
      dispatch({ type: 'SET_EXPORT_RANGE_START', payload: time });
    }, []),
    setExportRangeEnd: useCallback((time: number | null) => {
      dispatch({ type: 'SET_EXPORT_RANGE_END', payload: time });
    }, []),
    setExportRange: useCallback((start: number | null, end: number | null) => {
      dispatch({ type: 'SET_EXPORT_RANGE', payload: { start, end } });
    }, []),
    clearExportRange: useCallback(() => {
      dispatch({ type: 'CLEAR_EXPORT_RANGE' });
    }, []),
    
    // 편집 상태
    setEditingPartId: useCallback((partId: string | null) => {
      dispatch({ type: 'SET_EDITING_PART_ID', payload: partId });
    }, []),
    setHoveredPartId: useCallback((partId: string | null) => {
      dispatch({ type: 'SET_HOVERED_PART_ID', payload: partId });
    }, []),
    setIsDraggingPart: useCallback((isDragging: boolean) => {
      dispatch({ type: 'SET_IS_DRAGGING_PART', payload: isDragging });
    }, []),
  };

  // Phase 6.1: actions는 useMemo로 메모이제이션 (거의 변경 안 됨)
  // dispatch는 안정적이므로 의존성 배열에 포함하지 않아도 됨
  const memoizedActions = useMemo(() => actions, []);

  // 하위 호환성을 위한 기존 value (deprecated, Step 11에서 제거 예정)
  const value: UIContextType = {
    ...state,
    ...actions,
  };

  return (
    <UIStateContext.Provider value={state}>
      <UIActionsContext.Provider value={memoizedActions}>
        <UIContext.Provider value={value}>
          {children}
        </UIContext.Provider>
      </UIActionsContext.Provider>
    </UIStateContext.Provider>
  );
};

/**
 * UI 상태만 가져오는 훅 (새로운 API)
 * Phase 6.1: Context 분할 - State만 구독하여 불필요한 리렌더링 방지
 * 
 * @returns UI 상태
 * @throws {Error} UIProvider 외부에서 사용할 경우 에러 발생
 * 
 * @example
 * ```tsx
 * const state = useUIStateOnly();
 * console.log(state.selectedTrackId);
 * ```
 */
export const useUIStateOnly = (): UIState => {
  const context = useContext(UIStateContext);
  if (context === undefined) {
    throw new Error('useUIStateOnly must be used within a UIProvider');
  }
  return context;
};

/**
 * UI 액션만 가져오는 훅
 * Phase 6.1: Context 분할 - Actions만 구독하여 불필요한 리렌더링 방지
 * 
 * @returns UI 액션 함수들
 * @throws {Error} UIProvider 외부에서 사용할 경우 에러 발생
 * 
 * @example
 * ```tsx
 * const actions = useUIActions();
 * actions.setSelectedTrackId('track-1');
 * actions.toggleQuantize();
 * ```
 */
export const useUIActions = (): UIActions => {
  const context = useContext(UIActionsContext);
  if (context === undefined) {
    throw new Error('useUIActions must be used within a UIProvider');
  }
  return context;
};

/**
 * UI 상태와 액션을 모두 가져오는 훅 (하위 호환성)
 * Phase 6.1: 기존 코드와의 호환성을 위해 제공
 * 
 * @returns UI 상태와 액션 함수들을 포함한 객체
 * @throws {Error} UIProvider 외부에서 사용할 경우 에러 발생
 * 
 * @example
 * ```tsx
 * const ui = useUIStateAndActions();
 * ui.setSelectedTrackId('track-1');
 * ui.toggleQuantize();
 * ```
 */
export const useUIStateAndActions = (): UIContextType => {
  const state = useUIStateOnly();
  const actions = useUIActions();
  return { ...state, ...actions };
};

/**
 * UI 상태를 사용하기 위한 커스텀 훅 (하위 호환성)
 * Phase 6.1: 기존 코드와의 호환성을 위해 유지
 * 
 * @deprecated 새로운 코드는 useUIStateOnly()와 useUIActions()를 분리하여 사용하세요.
 * @returns UI 상태와 액션 함수들을 포함한 객체
 * @throws {Error} UIProvider 외부에서 사용할 경우 에러 발생
 * 
 * @example
 * ```tsx
 * const ui = useUIState();
 * ui.setSelectedTrackId('track-1');
 * ui.toggleQuantize();
 * ```
 */
export const useUIState = (): UIContextType => {
  return useUIStateAndActions();
};

