/**
 * SMF 표준 정합을 위한 Tick 타입
 * SMF header의 timeDivision(=PPQN)와 결합되어 해석되는 tick
 */
export type Tick = number; // integer >= 0

/**
 * 템포 이벤트 (SMF Set Tempo 메타 이벤트에 대응)
 */
export interface TempoEvent {
  /** 이벤트가 발생하는 절대 Tick 위치 */
  tick: Tick;
  /** Microseconds per quarter note (MPQN) */
  mpqn: number;
}

/**
 * 타임 시그니처 이벤트 (SMF Time Signature 메타 이벤트에 대응)
 */
export interface TimeSigEvent {
  /** 이벤트가 발생하는 절대 Tick 위치 */
  tick: Tick;
  /** 분자 (예: 4/4 => 4) */
  num: number;
  /** 분모 (예: 4/4 => 4) */
  den: number;
}

/**
 * MIDI 프로젝트 타이밍 정보 (SMF 표준 정합)
 * SSOT (Single Source of Truth) for BPM/Time Signature
 */
export interface MidiProjectTiming {
  /** Pulses Per Quarter Note (SMF header timeDivision) */
  ppqn: number;
  /** 템포 맵 (tick 오름차순 정렬) */
  tempoMap: TempoEvent[];
  /** 타임 시그니처 맵 (tick 오름차순 정렬) */
  timeSigMap: TimeSigEvent[];
}

/**
 * 프로젝트 데이터 구조
 * DAW 프로젝트의 전체 상태를 나타냅니다.
 */
export interface Project {
  /** 프로젝트 포맷 버전 (마이그레이션 관리용, 버전이 없으면 1로 간주) */
  version?: number;
  
  /** ✅ SSOT: Timing Map (SMF 표준 정합) */
  timing?: MidiProjectTiming;
  
  /** 트랙 배열 (최대 10개) */
  tracks: Track[];
  /** MIDI 파트 배열 */
  midiParts: MidiPart[];
  /** MIDI 파일 데이터 (partId -> base64 인코딩된 MIDI 파일) */
  midiFiles?: { [partId: string]: string };
  /** 마스터 볼륨 (0.0 ~ 1.0) */
  masterVolume?: number;
  /** 마스터 패닝 (-1.0 ~ 1.0) */
  masterPan?: number;
  /** 마스터 이펙터 배열 */
  masterEffects?: Effect[];
  /** Export 범위 시작 (마디 기준) */
  exportRangeMeasureStart?: number | null;
  /** Export 범위 끝 (마디 기준) */
  exportRangeMeasureEnd?: number | null;
}

/**
 * MIDI 노트 데이터
 * 각 노트는 피치, 속도, Tick 기준 위치를 가집니다.
 * 
 * @remarks
 * - startTick/durationTicks: MIDI 표준 Tick 기반 필수 필드
 * - 미디파트 내부 상대 위치 (미디파트의 startTick 기준)
 * - 노트의 절대 위치 = part.startTick + note.startTick
 * - 미디파트가 이동하면 노트도 자동으로 함께 이동함 (파트 종속성)
 * - channel/releaseVelocity: MIDI 표준 준수를 위한 필드 (선택적, 하위 호환성 유지)
 */
export interface MidiNote {
  /** MIDI 노트 번호 (0-127, C4 = 60) */
  note: number;
  /** 노트 속도 (0-127, 0 = 무음, 127 = 최대) */
  velocity: number;
  /** 
   * MIDI 채널 (0-15, 기본값: 0)
   * SMF 표준 준수: NoteOn/NoteOff 이벤트의 채널 정보 보존
   */
  channel?: number;
  /** 
   * NoteOff 이벤트의 velocity (0-127, 선택적)
   * SMF 표준 준수: Release velocity 정보 보존
   * 대부분의 경우 velocity 0이지만, 일부 고급 MIDI 파일에서는 의미 있는 값
   */
  releaseVelocity?: number;
  /** 
   * Tick 기준 시작 위치 (미디파트 내부 상대 위치)
   * MIDI 표준 PPQN 기반 정수 값
   * 미디파트의 startTick을 기준으로 한 상대 위치 (0부터 시작)
   * 절대 위치 = part.startTick + note.startTick
   */
  startTick: number;
  /** 
   * Tick 기준 길이 (Tick 단위)
   * MIDI 표준 PPQN 기반 정수 값
   */
  durationTicks: number;
}

/**
 * MIDI Control Change (CC) events.
 * SSOT: keep controller data here (e.g. sustain CC64).
 */
export interface MidiControlChange {
  /** Absolute tick for the CC event. */
  tick: Tick;
  /** Controller number (0-127). */
  controller: number;
  /** Controller value (0-127). */
  value: number;
  /** MIDI channel (0-15, default 0). */
  channel?: number;
}

/**
 * 이펙터 데이터
 * 오디오 이펙터의 타입과 파라미터를 정의합니다.
 */
export interface Effect {
  /** 이펙터 타입: 'eq' | 'delay' | 'reverb' */
  type: 'eq' | 'delay' | 'reverb';
  /** 이펙터 활성화 여부 */
  enabled: boolean;
  /** 이펙터 파라미터 */
  params: {
    // EQ parameters
    /** 저음 게인 (-12 ~ 12 dB) */
    lowGain?: number;
    /** 중음 게인 (-12 ~ 12 dB) */
    midGain?: number;
    /** 고음 게인 (-12 ~ 12 dB) */
    highGain?: number;
    /** Q 값 (0.1 ~ 10, 모든 밴드에 공통 적용) */
    q?: number;
    // Delay parameters
    /** 딜레이 박자 분할 (0.0625 = 1/16, 0.125 = 1/8, 0.25 = 1/4, 0.5 = 1/2, 1 = 1, 2 = 2, 4 = 4) */
    delayDivision?: number;
    /** 딜레이 시간 (0 ~ 1000 ms, 레거시 호환성용, delayDivision이 우선) */
    delayTime?: number;
    /** 피드백 (0 ~ 100%) */
    feedback?: number;
    /** 믹스 레벨 (0 ~ 100%) */
    mix?: number;
    // Reverb parameters
    /** 룸 크기 (0 ~ 100%) */
    roomSize?: number;
    /** 댐핑 (0 ~ 100%) */
    dampening?: number;
    /** 웻 레벨 (0 ~ 100%) */
    wetLevel?: number;
  };
}

/**
 * 트랙 데이터
 * 각 트랙은 악기 설정, 볼륨/패닝, 이펙터 정보를 포함합니다.
 */
export interface Track {
  id: string;
  name: string;
  /** 악기 식별자 (예: 'piano', 'guitar', 'drum', 등) */
  instrument: string;
  /** 볼륨 (0.0 ~ 1.0) */
  volume: number;
  /** 패닝 (-1.0 = 왼쪽, 0.0 = 중앙, 1.0 = 오른쪽) */
  pan: number;
  /** 이펙터 배열 */
  effects: Effect[];
  solo: boolean;
  mute: boolean;
  mutedBySolo: boolean; // 솔로 룰에 의해 자동으로 뮤트된 상태
  previousMute?: boolean; // 솔로 활성화 전의 뮤트 상태를 저장 (솔로 해제 시 복원용)
}

/**
 * Phase 8: 레거시 타입 정의
 * 마이그레이션 전의 레거시 데이터 구조를 나타냅니다.
 */

/**
 * 레거시 프로젝트 타입 (버전 1, measure 기반)
 */
export interface LegacyProject {
  version?: number;
  /** 레거시: bpm 필드 (버전 1) */
  bpm?: number;
  /** 레거시: timeSignature 필드 (버전 1) */
  timeSignature?: [number, number];
  timing?: MidiProjectTiming;
  tracks: Track[];
  midiParts: LegacyPart[];
  midiFiles?: { [partId: string]: string };
  masterVolume?: number;
  masterPan?: number;
  masterEffects?: Effect[];
  exportRangeMeasureStart?: number | null;
  exportRangeMeasureEnd?: number | null;
}

/**
 * 레거시 미디 파트 타입 (measure 기반)
 */
export interface LegacyPart {
  id: string;
  trackId: string;
  /** 레거시: measure 기반 시작 위치 */
  measureStart?: number;
  /** 레거시: measure 기반 길이 */
  measureDuration?: number;
  /** Tick 기반 필드 (마이그레이션 후) */
  startTick?: Tick;
  durationTicks?: Tick;
  notes: LegacyNote[];
  controlChanges?: MidiControlChange[];
}

/**
 * 레거시 미디 노트 타입 (measure 기반)
 */
export interface LegacyNote {
  note: number;
  velocity: number;
  channel?: number;
  releaseVelocity?: number;
  /** 레거시: measure 기반 시작 위치 */
  measureStart?: number;
  /** 레거시: measure 기반 길이 */
  measureDuration?: number;
  /** Tick 기반 필드 (마이그레이션 후) */
  startTick?: number;
  durationTicks?: number;
}

/**
 * 미디 파트 데이터
 * 각 미디 파트는 자신만의 미디 노트 배열을 가지고 있습니다.
 * 
 * @remarks
 * - startTick/durationTicks: SMF 표준 정합을 위한 Tick 기반 필수 필드
 */
export interface MidiPart {
  id: string;
  trackId: string;
  /** Tick 기준 시작 위치 (프로젝트 기준 절대 위치, SMF 표준 정합) */
  startTick: Tick;
  /** Tick 기준 길이 (SMF 표준 정합) */
  durationTicks: Tick;
  /** 이 미디 파트의 MIDI 노트 배열 */
  notes: MidiNote[];
  /** MIDI CC ??? (?: Sustain CC64) */
  controlChanges?: MidiControlChange[];
  /** 노트 레벨 히스토리의 현재 위치 (undoStack의 길이를 나타냄, 파트 레벨 undo/redo 시 노트 상태 복원에 사용) */
  historyIndex?: number;
}




