// UI 관련 상수
export const UI_CONSTANTS = {
  // 트랙 높이
  TRACK_MIN_HEIGHT: 35, // px
  TRACK_DEFAULT_HEIGHT: 70, // px
  
  // 패널 크기
  PANEL_MIN_WIDTH: 150, // px
  PANEL_MAX_WIDTH: 600, // px
  PANEL_MIN_HEIGHT: 100, // px
  PANEL_MAX_HEIGHT: 600, // px
  
  // 클릭/인터랙션
  DOUBLE_CLICK_TIMEOUT: 200, // ms
  DRAG_MOVE_THRESHOLD: 3, // px
  
  // 스크롤 업데이트 간격
  SCROLL_UPDATE_INTERVAL: 50, // ms
} as const;

// 볼륨/패닝 관련 상수
export const AUDIO_CONSTANTS = {
  // 볼륨: 0-120 표시, 내부적으로 0-1 정규화
  VOLUME_MAX_DISPLAY: 120,
  VOLUME_DEFAULT: 0,
  VOLUME_MIN: 0,
  VOLUME_MAX: 120,
  
  // 패닝: -100 ~ 100 표시, 내부적으로 -1 ~ 1 정규화
  PAN_MAX_DISPLAY: 100,
  PAN_DEFAULT: 0,
  PAN_MIN: -100,
  PAN_MAX: 100,
  
  // 볼륨/패닝 휠 델타
  WHEEL_DELTA: 1,
} as const;

// Audio buffer sizing (playback clock + AudioContext latency hint)
export const AUDIO_BUFFER_CONSTANTS = {
  SAMPLE_RATE: 48000,
  PERIODS: 2,
  BUFFER_SIZES: [64, 128, 256, 512, 1024, 2048],
  DEFAULT_BUFFER_SIZE: 512,
} as const;

// BPM 관련 상수
export const BPM_CONSTANTS = {
  MIN: 30,
  MAX: 400,
  DEFAULT: 120,
  DRAG_SENSITIVITY: 0.5,
} as const;

// 타임라인 관련 상수
export const TIMELINE_CONSTANTS = {
  // 기본 픽셀/초
  DEFAULT_PIXELS_PER_SECOND: 50,
  
  // 마디 수
  DEFAULT_MEASURES: 150,
  
  // 최소 클립 길이 (초)
  MIN_CLIP_DURATION: 0.1,
  
  // 그리드 사이즈 (16분음표 단위)
  GRID_DIVISIONS: 4,
} as const;

// 타임 시그니처 관련 상수
export const TIME_SIGNATURE_CONSTANTS = {
  BEATS_MIN: 1,
  BEATS_MAX: 32,
  BEAT_UNIT_MIN: 1,
  BEAT_UNIT_MAX: 32,
} as const;

// MIDI 관련 상수
export const MIDI_CONSTANTS = {
  // 피아노 키 범위
  PIANO_KEYS_COUNT: 88,
  MIDI_NOTE_MIN: 0, // C-1 (MIDI 표준 최소값)
  MIDI_NOTE_MAX: 127, // G9 (MIDI 표준 최대값)
  
  // 기본값
  DEFAULT_VELOCITY: 100,
} as const;

// 레벨 미터 관련 상수
export const LEVEL_METER_CONSTANTS = {
  BARS_COUNT: 20,
  DB_MIN: -60,
  DB_MAX: 0,
  RANDOM_MULTIPLIER: 0.8,
} as const;

// 이펙트 관련 상수
export const EFFECT_CONSTANTS = {
  MAX_EFFECTS_PER_TRACK: 4,
} as const;

// 드래그 및 인터랙션 관련 상수
export const DRAG_CONSTANTS = {
  TRACK_MOVE_THRESHOLD: 10, // px - 트랙 간 이동 모드 활성화 임계값
  DRAG_THRESHOLD: 5, // px - 드래그로 간주하는 최소 이동 거리
  RESIZE_HANDLE_WIDTH_PX: 15, // px - 리사이즈 핸들 너비
  MIN_PART_DURATION: 0.1, // measure - 최소 파트 길이
} as const;

// 히스토리 관련 상수
export const HISTORY_CONSTANTS = {
  MAX_HISTORY: 100, // 최대 히스토리 항목 수
  MAX_PART_LEVEL_HISTORY: 100, // 최대 파트 레벨 히스토리 항목 수
  PENDING_HISTORY_DELAY: 300, // ms - 지연된 히스토리 추가 대기 시간
} as const;

// MIDI 에디터 관련 상수
export const MIDI_EDITOR_CONSTANTS = {
  // 피아노 건반 스케일
  WHITE_KEY_SCALE: 0.15, // 백건반 확장 비율 (0~1)
  PIANO_KEY_HEIGHT_SCALE_MIN: 1.5, // 건반 높이 스케일 최소값 (슬라이더 150 / 100)
  PIANO_KEY_HEIGHT_SCALE_MAX: 4.0, // 건반 높이 스케일 최대값 (슬라이더 400 / 100)
  get PIANO_KEY_HEIGHT_SCALE_DEFAULT() {
    return (this.PIANO_KEY_HEIGHT_SCALE_MIN + this.PIANO_KEY_HEIGHT_SCALE_MAX) / 2;
  }, // 건반 높이 스케일 기본값 (min과 max의 중간값)
  
  // 에디터 크기
  EDITOR_WIDTH_RATIO: 0.9, // 뷰포트 너비 대비 에디터 너비 비율
  EDITOR_MAX_WIDTH: 1200, // 에디터 최대 너비 (px)
  PIANO_KEYS_WIDTH: 80, // 피아노 건반 폭 (px)
  RULER_HEIGHT: 30, // 룰러 높이 (px)
  
  // 줌 범위
  MIN_ZOOM: 10, // 최소 줌 레벨 (pixels per second)
  MAX_ZOOM: 500, // 최대 줌 레벨 (pixels per second)
  
  // 부동소수점 비교 임계값
  FLOAT_EPSILON: 0.001, // 일반적인 부동소수점 비교 임계값
  FLOAT_EPSILON_STRICT: 0.0001, // 엄격한 부동소수점 비교 임계값
  
  // 최소 길이
  MIN_NOTE_DURATION: 0.1, // 최소 노트 길이 (measure)
  
  // UI 상태
  INITIAL_CLICKED_NOTE_INDEX: -1, // 클릭한 노트 인덱스 초기값
  INITIAL_PLAYBACK_TIME: 0, // 재생 위치 초기값
  
  // 투명도
  NOTE_OPACITY_DRAGGING: 0.7, // 드래그 중 노트 투명도
  NOTE_OPACITY_NORMAL: 1.0, // 일반 노트 투명도
  OVERLAY_BACKGROUND_OPACITY: 0.7, // 오버레이 배경 투명도
  
  // 건반 높이 슬라이더 범위 (퍼센트 단위로 표시)
  PIANO_KEY_HEIGHT_SLIDER_MIN: 150, // 슬라이더 최소값 (1.5배)
  PIANO_KEY_HEIGHT_SLIDER_MAX: 400, // 슬라이더 최대값 (4.0배)
  PIANO_KEY_HEIGHT_SLIDER_SCALE: 100, // 슬라이더 값을 실제 스케일로 변환하는 배율
  
  // 검은 건반 레인 높이 비율
  BLACK_KEY_LANE_HEIGHT_RATIO: 0.7, // 검은 건반 레인 높이 비율 (0~1)
} as const;

// 노트 병합 관련 상수
export const NOTE_MERGE_CONSTANTS = {
  MAX_GAP_FOR_MERGE: 1.0, // 병합 가능한 최대 간격 (measure)
} as const;

// 이벤트 디스플레이 관련 상수
export const EVENT_DISPLAY_CONSTANTS = {
  // 투명도
  PART_OPACITY_DRAGGING: 0.8, // 드래그 중 파트 투명도
  PART_OPACITY_RESIZING: 0.7, // 리사이즈 중 파트 투명도
  PART_OPACITY_NORMAL: 1.0, // 일반 파트 투명도
  
  // Z-Index
  PART_Z_INDEX_DRAGGING: 10, // 드래그 중 파트 z-index
  PART_Z_INDEX_NORMAL: 5, // 일반 파트 z-index
} as const;

// 화면 폭 브레이크포인트 (반응형 디자인)
export const BREAKPOINTS = {
  // 모바일 미지원: 이 값 이하일 때 모바일 미지원 메시지 표시
  MOBILE_NOT_SUPPORTED: 1120, // px
  
  // 패널 토글 버튼 숨김: 이 값 이하일 때 Track List, Inspector, Mixer 토글 버튼 숨김
  HIDE_PANEL_TOGGLES: 1250, // px
  
  // 아이콘만 표시: 이 값 이하일 때 File과 Collab 버튼의 텍스트와 드롭다운 화살표 숨김
  ICON_ONLY: 1400, // px
  
  // 텍스트 단축: 이 값 이하일 때 Collab 버튼 텍스트를 "Collab"으로 표시
  TEXT_SHORT: 1500, // px
} as const;
