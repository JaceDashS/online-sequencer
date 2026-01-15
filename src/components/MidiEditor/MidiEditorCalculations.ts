/**
 * MidiEditor 컴포넌트의 계산 로직
 * 노트 위치, 그리드 계산, 벨로시티 색상 계산 등의 순수 함수들을 제공합니다.
 */

import type { MidiNote, TempoEvent } from '../../types/project';
import { MIDI_CONSTANTS } from '../../constants/midi';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import { ticksToSecondsPure } from '../../utils/midiTickUtils';

/**
 * 피치를 MIDI 노트 범위로 클램핑합니다.
 * 
 * @param pitch - 클램핑할 피치 값
 * @returns 클램핑된 피치 값 (0-127)
 */
export function clampPianoPitch(pitch: number): number {
  return Math.max(
    MIDI_CONSTANTS.NOTE_MIN,
    Math.min(MIDI_CONSTANTS.NOTE_MAX, pitch)
  );
}

/**
 * 노트 이름과 옥타브를 MIDI 노트 번호로 변환합니다.
 * 
 * @param noteName - 노트 이름 ('C', 'C#', 'D', etc.)
 * @param octave - 옥타브 번호
 * @returns MIDI 노트 번호 (0-127)
 */
export function noteNameToMidiNote(noteName: string, octave: number): number {
  const noteMap: { [key: string]: number } = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  };
  return (octave + 1) * 12 + (noteMap[noteName] ?? 0);
}

/**
 * 벨로시티에 따른 색상 채도를 계산합니다.
 * 
 * @param velocity - 벨로시티 값 (0-127)
 * @param isBlackKey - 흑건반 여부
 * @returns HSL 색상 문자열
 */
export function getVelocityColor(velocity: number, isBlackKey: boolean): string {
  // 벨로시티 범위: 0-127, 기본값: 100
  // 벨로시티 100일 때 채도 100%, 벨로시티가 낮아질수록 채도 감소
  const normalizedVelocity = Math.max(0, Math.min(127, velocity));
  const saturation = (normalizedVelocity / 127) * 100; // 0-100%
  
  // 기본 색상 (벨로시티 100일 때)
  // 백건반: #4a9eff (RGB: 74, 158, 255) -> HSL: hsl(214, 100%, 65%)
  // 흑건반: #2a6ecc (RGB: 42, 110, 204) -> HSL: hsl(214, 66%, 48%)
  
  if (isBlackKey) {
    // 흑건반: HSL(214, 66%, 48%) -> 채도만 조정
    const adjustedSaturation = (66 * saturation) / 100;
    return `hsl(214, ${adjustedSaturation}%, 48%)`;
  } else {
    // 백건반: HSL(214, 100%, 65%) -> 채도만 조정
    return `hsl(214, ${saturation}%, 65%)`;
  }
}

/**
 * 벨로시티에 따른 테두리 색상을 계산합니다.
 * 
 * @param velocity - 벨로시티 값 (0-127)
 * @param isBlackKey - 흑건반 여부
 * @returns HSL 색상 문자열
 */
export function getVelocityBorderColor(velocity: number, isBlackKey: boolean): string {
  const normalizedVelocity = Math.max(0, Math.min(127, velocity));
  const saturation = (normalizedVelocity / 127) * 100;
  
  if (isBlackKey) {
    // 흑건반 테두리: #3a7edc -> HSL(214, 66%, 55%)
    const adjustedSaturation = (66 * saturation) / 100;
    return `hsl(214, ${adjustedSaturation}%, 55%)`;
  } else {
    // 백건반 테두리: #6bb0ff -> HSL(214, 100%, 75%)
    return `hsl(214, ${saturation}%, 75%)`;
  }
}

/**
 * 레인 위치를 계산합니다.
 * 피아노 롤에서 각 MIDI 노트(0-127)의 위치와 높이를 계산합니다.
 * 
 * @returns 레인 위치 정보 배열
 */
export function calculateLanePositions(): Array<{ index: number; top: number; height: number; isBlackKey: boolean }> {
  const lanes: Array<{ index: number; top: number; height: number; isBlackKey: boolean }> = [];
  const totalHeight = 100;
  const numLanes = 128; // MIDI 노트 0-127
  const blackKeyHeightRatio = MIDI_EDITOR_CONSTANTS.BLACK_KEY_LANE_HEIGHT_RATIO;
  
  // IMPORTANT:
  // 기존 구현은 blackKeyHeightRatio(<1) 를 그대로 적용하면서 누적해버려서
  // 전체 lane 높이 합이 100%보다 작아지고(= 아래쪽 빈 공간) 스크롤 시 공백이 보였습니다.
  // black/white "가중치"를 100%로 정규화하여 항상 꽉 차도록 만듭니다.
  const isBlack = (midiNote: number) => [1, 3, 6, 8, 10].includes(midiNote % 12);
  const weights: number[] = [];
  let blackKeyCount = 0;
  for (let i = 0; i < numLanes; i++) {
    const black = isBlack(i);
    if (black) blackKeyCount++;
    weights.push(black ? blackKeyHeightRatio : 1);
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // 레인을 역순으로 계산 (피아노 키와 동일: 위쪽이 높은 음, 아래쪽이 낮은 음)
  // MIDI 127 (G9)이 위(top: 0), MIDI 0 (C-1)이 아래
  let currentTop = 0;
  for (let i = numLanes - 1; i >= 0; i--) {
    const midiNote = i; // 실제 MIDI 노트 번호 (127부터 0까지 역순)
    const isBlackKey = isBlack(midiNote);
    const laneHeight = (weights[i] / totalWeight) * totalHeight;

    lanes.push({
      index: midiNote,
      top: currentTop,
      height: laneHeight,
      isBlackKey,
    });

    currentTop += laneHeight;
  }
  
  // 부동소수점 오차로 인한 빈 공간 제거: 마지막 레인의 높이를 강제로 조정하여 정확히 100%를 채움
  // 마지막 레인(MIDI 0, C-1)이 항상 정확히 100%에 도달하도록 보장
  if (lanes.length > 0) {
    const lastLane = lanes[lanes.length - 1];
    // 마지막 레인의 bottom이 정확히 100%가 되도록 높이를 조정
    lastLane.height = totalHeight - lastLane.top;
  }
  
  return lanes;
}

/**
 * 시간을 그리드 크기에 맞춰 퀀타이즈합니다.
 * 
 * @param time - 퀀타이즈할 시간 (초)
 * @param gridSize - 그리드 크기 (초)
 * @returns 퀀타이즈된 시간 (초)
 */
export function quantizeNote(time: number, gridSize: number): number {
  return Math.round(time / gridSize) * gridSize;
}

/**
 * 노트의 픽셀 위치를 계산합니다.
 * Tick 기반 노트 정보를 픽셀 좌표로 변환합니다.
 * 
 * @param note - MIDI 노트 (상대 tick 위치)
 * @param tempoMap - 템포 맵
 * @param timeSignature - 타임 시그니처
 * @param ppqn - PPQN
 * @param pixelsPerSecond - 초당 픽셀 수
 * @param lanes - 레인 위치 정보 배열
 * @param rectHeight - 컨테이너 높이 (픽셀)
 * @returns 노트의 픽셀 위치 정보
 */
export function calculateNotePixelPosition(
  note: MidiNote,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number,
  pixelsPerSecond: number,
  lanes: Array<{ index: number; top: number; height: number; isBlackKey: boolean }>,
  rectHeight: number
): { x: number; width: number; y: number; height: number; startTime: number; duration: number } | null {
  const noteStartTickRelative = note.startTick;
  const noteDurationTicks = note.durationTicks ?? 0;
  
  const { startTime: noteStartTime, duration: noteDuration } = ticksToSecondsPure(
    noteStartTickRelative,
    noteDurationTicks,
    tempoMap,
    timeSignature,
    ppqn
  );
  
  const noteX = noteStartTime * pixelsPerSecond;
  const noteWidth = noteDuration * pixelsPerSecond;
  
  const laneIndex = note.note;
  const lane = lanes.find(l => l.index === laneIndex);
  
  if (!lane) return null;
  
  const noteY = (lane.top / 100) * rectHeight;
  const noteHeight = (lane.height / 100) * rectHeight;
  
  return {
    x: noteX,
    width: noteWidth,
    y: noteY,
    height: noteHeight,
    startTime: noteStartTime,
    duration: noteDuration,
  };
}

/**
 * 시간을 비트 단위로 스냅합니다 (BPM 및 타임 시그니처 기반).
 * 
 * @param time - 스냅할 시간 (초)
 * @param bpm - BPM
 * @param timeSignature - 타임 시그니처
 * @returns 스냅된 시간 (초)
 */
export function snapTimeToBeat(time: number, bpm: number, timeSignature: [number, number]): number {
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  return Math.round(time / secondsPerBeat) * secondsPerBeat;
}

