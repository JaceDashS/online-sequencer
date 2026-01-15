/**
 * MIDI 유틸리티 함수
 * 
 * @remarks
 * MIDI 노트 및 파트 관련 유틸리티 함수들을 제공합니다
 */
import type { MidiNote, MidiPart } from '../types/project';
import { ticksToMeasurePure } from './midiTickUtils';

/**
 * 노트의 렌더링 범위 계산 (파트 경계로 클리핑)
 * SMF 표준 정합: Tick 기반으로 작동, measure로 반환 (UI 호환성)
 * 
 * 규칙:
 * - 렌더링 시에만 파트의 durationTicks 기준으로 클리핑
 * - 노트가 파트와 겹치지 않으면 null 반환
 * 
 * @param note - MIDI 노트
 * @param part - MIDI 파트 (startTick/durationTicks 사용)
 * @param _bpm - BPM (호환성을 위해 유지, 사용하지 않음)
 * @param timeSignature - 박자 [beatsPerMeasure, beatUnit] (measure 변환용)
 * @param ppqn - Pulses Per Quarter Note (measure 변환용)
 * @returns 클리핑된 렌더링 범위 { measureStart, measureDuration } 또는 null
 */
export function getRenderableNoteRange(
  note: MidiNote,
  part: MidiPart,
  _bpm: number,
  timeSignature: [number, number],
  ppqn: number
): { measureStart: number; measureDuration: number } | null {
  // 노트는 파트 내부의 상대 위치로 저장되어 있음
  const noteStartTickRelative = note.startTick;
  const noteEndTickRelative = note.startTick + note.durationTicks;
  
  // 파트의 길이 (SMF 표준 정합, tick 직접 사용)
  const partDurationTicks = part.durationTicks;
  
  // 노트가 파트와 겹치는지 확인 (상대 위치 기준)
  if (noteEndTickRelative <= 0 || noteStartTickRelative >= partDurationTicks) {
    return null;
  }
  
  // 클리핑된 Tick 범위 (상대 위치)
  const clippedStartTickRelative = Math.max(0, noteStartTickRelative);
  const clippedEndTickRelative = Math.min(partDurationTicks, noteEndTickRelative);
  const clippedDurationTicks = clippedEndTickRelative - clippedStartTickRelative;
  
  // measure로 변환 (UI 호환성, 상대 위치)
  // 순수 함수 버전 사용: timeSignature와 ppqn을 명시적으로 전달
  const { measureStart, measureDuration } = ticksToMeasurePure(
    clippedStartTickRelative,
    clippedDurationTicks,
    timeSignature,
    ppqn
  );
  
  return {
    measureStart,
    measureDuration
  };
}
