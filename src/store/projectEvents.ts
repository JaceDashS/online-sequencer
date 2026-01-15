import type { Track, Effect, MidiPart, MidiNote } from '../types/project';

/**
 * 트랙 변경 이벤트 타입
 * Publisher-Subscriber 패턴을 사용하여 트랙 변경을 구독자에게 알립니다.
 */
export type TrackChangeEvent = {
  /** 변경된 트랙의 ID */
  trackId: string;
  /** 변경된 트랙 속성들 */
  changes: Partial<Track>;
  /** 변경 타입: 'update' | 'add' | 'remove' */
  type: 'update' | 'add' | 'remove';
};

/**
 * 미디파트 변경 이벤트 타입
 * Publisher-Subscriber 패턴을 사용하여 미디파트 변경을 구독자에게 알립니다.
 */
export type MidiPartChangeEvent = 
  | { type: 'add'; part: MidiPart }
  | { type: 'remove'; partId: string }
  | { type: 'update'; partId: string; changes: Partial<MidiPart> }
  | { type: 'move'; partId: string; newStartTick: number }
  | { type: 'resize'; partId: string; newDurationTicks: number };

/**
 * 미디 노트 변경 이벤트 타입
 * Publisher-Subscriber 패턴을 사용하여 미디 노트 변경을 구독자에게 알립니다.
 */
export type MidiNoteChangeEvent = 
  | { type: 'add'; partId: string; note: MidiNote; noteIndex?: number }
  | { type: 'remove'; partId: string; noteIndex: number }
  | { type: 'update'; partId: string; noteIndex: number; changes: Partial<MidiNote> }
  | { type: 'addMultiple'; partId: string; notes: MidiNote[] }
  | { type: 'removeMultiple'; partId: string; noteIndices: number[] };

/**
 * 프로젝트 변경 이벤트 타입 (Discriminated Union)
 * Publisher-Subscriber 패턴을 사용하여 프로젝트 변경을 구독자에게 알립니다.
 */
export type ProjectChangeEvent = 
  | { type: 'bpm'; bpm: number }
  | { type: 'timeSignature'; timeSignature: [number, number] }
  | { type: 'master'; changes: { volume?: number; pan?: number; effects?: Effect[] } }
  | { type: 'track'; trackId?: string }
  | { type: 'midiPart'; partId?: string };

type TrackSubscriber = (event: TrackChangeEvent) => void;
type ProjectSubscriber = (event: ProjectChangeEvent) => void;
type MidiPartSubscriber = (event: MidiPartChangeEvent) => void;
type MidiNoteSubscriber = (event: MidiNoteChangeEvent) => void;

const trackSubscribers = new Set<TrackSubscriber>();
const projectSubscribers = new Set<ProjectSubscriber>();
const midiPartSubscribers = new Set<MidiPartSubscriber>();
const midiNoteSubscribers = new Set<MidiNoteSubscriber>();

/**
 * 트랙 변경 이벤트를 구독합니다.
 * 
 * @param callback - 트랙 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 * 
 * @example
 * ```ts
 * const unsubscribe = subscribeToTrackChanges((event) => {
 *   console.log('Track changed:', event.trackId);
 * });
 * // 나중에 구독 해제
 * unsubscribe();
 * ```
 */
export const subscribeToTrackChanges = (callback: TrackSubscriber): (() => void) => {
  trackSubscribers.add(callback);
  return () => trackSubscribers.delete(callback);
};

/**
 * 프로젝트 변경 이벤트를 구독합니다.
 * 
 * @param callback - 프로젝트 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 * 
 * @example
 * ```ts
 * const unsubscribe = subscribeToProjectChanges((event) => {
 *   if (event.type === 'bpm') {
 *     console.log('BPM changed:', event.bpm);
 *   }
 * });
 * // 나중에 구독 해제
 * unsubscribe();
 * ```
 */
export const subscribeToProjectChanges = (callback: ProjectSubscriber): (() => void) => {
  projectSubscribers.add(callback);
  return () => {
    projectSubscribers.delete(callback);
  };
};

/**
 * 트랙 변경 이벤트 발행
 */
export const notifyTrackChange = (trackId: string, changes: Partial<Track>, type: 'update' | 'add' | 'remove') => {
  const event: TrackChangeEvent = { trackId, changes, type };
  trackSubscribers.forEach((cb) => {
    try {
      cb(event);
    } catch (error) {
      // 에러는 로깅 시스템으로 처리 (나중에 개선)
      console.error('Error in track subscriber:', error);
    }
  });
};

/**
 * 프로젝트 변경 이벤트 발행
 */
export const notifyProjectChange = (event: ProjectChangeEvent) => {
  projectSubscribers.forEach(cb => {
    try {
      cb(event);
    } catch (error) {
      // 에러는 로깅 시스템으로 처리 (나중에 개선)
      console.error('Error in project subscriber:', error);
    }
  });
};

/**
 * 미디파트 변경 이벤트를 구독합니다.
 * 
 * @param callback - 미디파트 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export const subscribeToMidiPartChanges = (callback: MidiPartSubscriber): (() => void) => {
  midiPartSubscribers.add(callback);
  return () => midiPartSubscribers.delete(callback);
};

/**
 * 미디 노트 변경 이벤트를 구독합니다.
 * 
 * @param callback - 미디 노트 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export const subscribeToMidiNoteChanges = (callback: MidiNoteSubscriber): (() => void) => {
  midiNoteSubscribers.add(callback);
  return () => midiNoteSubscribers.delete(callback);
};

/**
 * 미디파트 변경 이벤트 발행
 */
export const notifyMidiPartChange = (event: MidiPartChangeEvent) => {
  midiPartSubscribers.forEach(cb => {
    try {
      cb(event);
    } catch (error) {
      console.error('Error in midi part subscriber:', error);
    }
  });
};

/**
 * 미디 노트 변경 이벤트 발행
 */
export const notifyMidiNoteChange = (event: MidiNoteChangeEvent) => {
  midiNoteSubscribers.forEach(cb => {
    try {
      cb(event);
    } catch (error) {
      console.error('Error in midi note subscriber:', error);
    }
  });
};

