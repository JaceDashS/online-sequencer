/**
 * SMF (Standard MIDI File) 타입 정의
 * SMF 표준 포맷에 정합된 타입들을 정의합니다.
 */

/**
 * MIDI 이벤트 타입
 */
export type MidiEventType = 
  | 'NoteOn'
  | 'NoteOff'
  | 'ControlChange'
  | 'ProgramChange'
  | 'PitchBend'
  | 'Meta';

/**
 * MIDI 메타 이벤트 타입
 */
export type MetaEventType =
  | 'SetTempo'
  | 'TimeSignature'
  | 'TrackName'
  | 'EndOfTrack';

/**
 * MIDI 이벤트 (SMF 트랙 이벤트)
 */
export interface MidiEvent {
  /** Delta time (이전 이벤트로부터의 tick 간격) */
  deltaTime: number;
  /** 이벤트 타입 */
  type: MidiEventType;
  /** MIDI 채널 (0-15, NoteOn/NoteOff/ControlChange 등에 사용) */
  channel?: number;
  /** 노트 번호 (0-127, NoteOn/NoteOff에 사용) */
  note?: number;
  /** 속도 (0-127, NoteOn/NoteOff에 사용) */
  velocity?: number;
  /** 메타 이벤트 타입 (Meta 이벤트에 사용) */
  metaType?: MetaEventType;
  /** 메타 이벤트 데이터 (Meta 이벤트에 사용) */
  metaData?: Uint8Array;
  /** Control Change controller number (0-127). */
  controller?: number;
  /** Control Change value (0-127). */
  value?: number;
}

/**
 * SMF 헤더 정보
 */
export interface SmfHeader {
  /** 포맷 타입 (0: 단일 트랙, 1: 멀티 트랙 동기, 2: 멀티 트랙 비동기) */
  format: number;
  /** 트랙 수 */
  tracks: number;
  /** Time Division (PPQN 또는 SMPTE) */
  timeDivision: number;
}

/**
 * SMF 트랙
 */
export interface SmfTrack {
  /** 트랙 이름 (선택) */
  name?: string;
  /** 이벤트 배열 (시간 순서대로 정렬) */
  events: MidiEvent[];
}

/**
 * SMF 파일 구조
 */
export interface SmfFile {
  /** 헤더 */
  header: SmfHeader;
  /** 트랙 배열 */
  tracks: SmfTrack[];
}

