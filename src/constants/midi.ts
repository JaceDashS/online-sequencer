/**
 * MIDI 표준 관련 상수
 * MIDI 파일의 시간 정밀도 및 노트 길이 제한을 정의합니다.
 */

/**
 * MIDI 표준 상수
 */
export const MIDI_CONSTANTS = {
  /**
   * MIDI note number range (0-127).
   */
  NOTE_MIN: 0,
  NOTE_MAX: 127,

  /**
   * Piano key range (88 keys): A0(21) ~ C8(108).
   * We render 0-127 in UI, but constrain piano playback/editing to this range.
   */
  PIANO_KEY_MIN: 21,
  PIANO_KEY_MAX: 108,

  /** 
   * Pulses Per Quarter Note - MIDI 파일의 시간 정밀도
   * 표준값: 480 (960도 가능, 더 높은 정밀도)
   * Quarter Note(4분음표) 1개 = 480 ticks
   */
  PPQN: 480,
  
  /** 
   * 최소 노트 길이 (Tick 단위)
   * 1 Tick = 최소 단위
   */
  MIN_NOTE_DURATION_TICKS: 1,
  
  /** 
   * 최대 노트 길이 (Tick 단위)
   * 약 1시간 @ 120 BPM (4/4 박자 기준)
   * 계산: 120 BPM = 2 beats/sec = 0.5 sec/beat
   *      1 beat = 480 ticks
   *      1시간 = 3600 sec = 7200 beats = 3,456,000 ticks
   */
  MAX_NOTE_DURATION_TICKS: 6912000,
} as const;



