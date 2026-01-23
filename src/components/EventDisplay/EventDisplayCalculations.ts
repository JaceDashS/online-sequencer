/**
 * EventDisplay 컴포넌트의 계산 로직
 * 위치 계산, 스냅 계산, 마디 마커 계산 등의 순수 함수들을 제공합니다.
 */

import type { MeasureMarker } from './EventDisplayTypes';
import type { TempoEvent, MidiPart } from '../../types/project';
import { ticksToSecondsPure, secondsToTicksPure, ticksToMeasurePure } from '../../utils/midiTickUtils';
import type { CalculateSplitPreviewParams } from './EventDisplayLogicTypes';
import { TIMELINE_CONSTANTS } from '../../constants/ui';

/**
 * 마디 마커를 계산합니다.
 * 
 * @param bpm - BPM (Beats Per Minute)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param pixelsPerSecond - 초당 픽셀 수
 * @param startTime - 시작 시간 (초)
 * @param maxMeasures - 최대 마디 수 (기본값: 150)
 * @returns 마디 마커 배열
 */
export function calculateMeasureMarkers(
  bpm: number,
  timeSignature: [number, number],
  pixelsPerSecond: number,
  startTime: number,
  maxMeasures: number = 150
): MeasureMarker[] {
  const beatsPerMeasure = timeSignature[0];
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
  
  // 타임 시그니처에 맞춰서 마디 마커 위치 계산
  const markers: MeasureMarker[] = [];
  for (let i = 0; i <= maxMeasures; i++) {
    const measureTime = i * secondsPerMeasure;
    const xPosition = (measureTime - startTime) * pixelsPerSecond;
    markers.push({
      measure: i,
      x: xPosition,
    });
  }
  return markers;
}

export function calculateMeasureMarkersInRange(
  bpm: number,
  timeSignature: [number, number],
  pixelsPerSecond: number,
  startTime: number,
  rangeStartTime: number,
  rangeEndTime: number,
  maxMeasures: number = 150
): MeasureMarker[] {
  const beatsPerMeasure = timeSignature[0];
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
  if (secondsPerMeasure <= 0) {
    return [];
  }

  const startMeasure = Math.max(0, Math.floor(rangeStartTime / secondsPerMeasure));
  const endMeasure = Math.min(maxMeasures, Math.ceil(rangeEndTime / secondsPerMeasure));
  const markers: MeasureMarker[] = [];
  for (let i = startMeasure; i <= endMeasure; i++) {
    const measureTime = i * secondsPerMeasure;
    const xPosition = (measureTime - startTime) * pixelsPerSecond;
    markers.push({ measure: i, x: xPosition });
  }
  return markers;
}

/**
 * 전체 타임라인 너비를 계산합니다.
 * 박자 변경 시에도 확대/축소가 되지 않도록 timeSignature에 관계없이 고정된 시간 범위 사용
 * 4/4 박자 기준으로 300마디를 고정 너비로 사용
 * 
 * @param bpm - BPM (Beats Per Minute)
 * @param pixelsPerSecond - 초당 픽셀 수
 * @returns 전체 너비 (픽셀)
 */
export function calculateTotalWidth(
  bpm: number,
  pixelsPerSecond: number
): number {
  const baseBeatsPerMeasure = 4; // 고정된 기준 박자 (4/4)
  const baseBeatUnit = 4;
  const baseNoteValueRatio = 4 / baseBeatUnit;
  const baseSecondsPerBeat = (60 / bpm) * baseNoteValueRatio;
  const baseSecondsPerMeasure = baseBeatsPerMeasure * baseSecondsPerBeat;
  const width = TIMELINE_CONSTANTS.DEFAULT_MEASURES * baseSecondsPerMeasure * pixelsPerSecond;
  return width;
}

/**
 * 시간(초)을 비트 단위로 스냅합니다.
 * 
 * @param time - 스냅할 시간 (초)
 * @param bpm - BPM (Beats Per Minute)
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @returns 스냅된 시간 (초)
 */
export function snapTimeToBeat(
  time: number,
  bpm: number,
  timeSignature: [number, number]
): number {
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  return Math.round(time / secondsPerBeat) * secondsPerBeat;
}

/**
 * Tick을 비트 단위로 스냅합니다.
 * 
 * @param tick - 스냅할 Tick 값
 * @param ppqn - Pulses Per Quarter Note
 * @returns 스냅된 Tick 값
 */
export function snapTickToBeat(
  tick: number,
  ppqn: number
): number {
  return Math.round(tick / ppqn) * ppqn;
}

/**
 * 파트의 시작 시간과 길이를 Tick에서 픽셀 위치로 변환합니다.
 * 
 * @param partStartTick - 파트 시작 Tick
 * @param partDurationTicks - 파트 길이 (Tick)
 * @param tempoMap - 템포 맵
 * @param timeSignature - 타임 시그니처 [beatsPerMeasure, beatUnit]
 * @param ppqn - Pulses Per Quarter Note
 * @param pixelsPerSecond - 초당 픽셀 수
 * @returns 파트의 픽셀 위치와 크기 { x: 픽셀, width: 픽셀, startTime: 초, duration: 초 }
 */
export function calculatePartPixelPosition(
  partStartTick: number,
  partDurationTicks: number,
  tempoMap: TempoEvent[],
  timeSignature: [number, number],
  ppqn: number,
  pixelsPerSecond: number
): { x: number; width: number; startTime: number; duration: number } {
  const { startTime, duration } = ticksToSecondsPure(
    partStartTick,
    partDurationTicks,
    tempoMap,
    timeSignature,
    ppqn
  );
  const x = startTime * pixelsPerSecond;
  const width = duration * pixelsPerSecond;
  return { x, width, startTime, duration };
}

/**
 * 마우스 X 좌표를 시간(초)으로 변환합니다.
 * 
 * @param x - 마우스 X 좌표 (픽셀)
 * @param pixelsPerSecond - 초당 픽셀 수
 * @param startTime - 시작 시간 (초, 선택)
 * @returns 시간 (초)
 */
export function pixelToTime(
  x: number,
  pixelsPerSecond: number,
  startTime: number = 0
): number {
  return (x / pixelsPerSecond) + startTime;
}

/**
 * 시간(초)을 픽셀 좌표로 변환합니다.
 * 
 * @param time - 시간 (초)
 * @param pixelsPerSecond - 초당 픽셀 수
 * @param startTime - 시작 시간 (초, 선택)
 * @returns 픽셀 좌표
 */
export function timeToPixel(
  time: number,
  pixelsPerSecond: number,
  startTime: number = 0
): number {
  return (time - startTime) * pixelsPerSecond;
}

/**
 * 파트 내부에서 클릭한 위치를 상대 시간으로 변환합니다.
 * 
 * @param clickX - 클릭한 X 좌표 (픽셀)
 * @param partX - 파트 시작 X 좌표 (픽셀)
 * @param pixelsPerSecond - 초당 픽셀 수
 * @returns 파트 내부 상대 시간 (초)
 */
export function calculateRelativeClickTime(
  clickX: number,
  partX: number,
  pixelsPerSecond: number
): number {
  return (clickX - partX) / pixelsPerSecond;
}

/**
 * 스냅된 시간이 파트 범위 내에 있는지 확인합니다.
 * 
 * @param snappedTime - 스냅된 상대 시간 (초)
 * @param partDuration - 파트 길이 (초)
 * @returns 파트 범위 내에 있으면 true
 */
export function isSnappedTimeInPartRange(
  snappedTime: number,
  partDuration: number
): boolean {
  return snappedTime >= 0 && snappedTime <= partDuration;
}

/**
 * 스플릿 미리보기 X 좌표를 계산합니다.
 * 
 * @param params - 스플릿 미리보기 계산 파라미터
 * @returns 미리보기 X 좌표 또는 null (파트 범위를 벗어났을 때)
 */
export function calculateSplitPreviewX(
  params: CalculateSplitPreviewParams
): number | null {
  const {
    mouseX,
    part,
    pixelsPerSecond,
    timeSignature,
    ppqn,
    tempoMap,
    isQuantizeEnabled,
    bpm
  } = params;

  // 파트 위치 계산
  const partStartTick = part.startTick;
  const partDurationTicks = part.durationTicks;
  const { startTime: partStartTime, duration: partDuration } = ticksToSecondsPure(
    partStartTick,
    partDurationTicks,
    tempoMap,
    timeSignature,
    ppqn
  );
  const partX = partStartTime * pixelsPerSecond;
  const partWidth = partDuration * pixelsPerSecond;
  const partRight = partX + partWidth;

  // 파트 내부에 있는지 확인
  if (mouseX >= partX && mouseX <= partRight) {
    let previewX = mouseX;
    
    // 퀀타이즈가 활성화되어 있으면 그리드에 스냅
    if (isQuantizeEnabled) {
      // 마우스 X 좌표를 절대 시간으로 변환
      const clickTime = calculateRelativeClickTime(mouseX, partX, pixelsPerSecond);
      const absoluteClickTime = partStartTime + clickTime;
      
      // 퀀타이즈 그리드에 스냅
      const snappedAbsoluteTime = snapTimeToBeat(absoluteClickTime, bpm, timeSignature);
      
      // 스냅된 시간이 파트 범위 내에 있는지 확인
      const snappedTime = snappedAbsoluteTime - partStartTime;
      if (isSnappedTimeInPartRange(snappedTime, partDuration)) {
        // 다시 픽셀 좌표로 변환
        previewX = partX + snappedTime * pixelsPerSecond;
        return previewX;
      }
    }
    
    return previewX;
  }
  
  return null;
}

/**
 * 스플릿 실행 시 사용할 measure 위치를 계산합니다.
 * 
 * @param clickX - 클릭한 X 좌표 (픽셀)
 * @param part - 파트 정보
 * @param partX - 파트의 X 좌표 (픽셀)
 * @param partStartTime - 파트 시작 시간 (초)
 * @param partDuration - 파트 길이 (초)
 * @param pixelsPerSecond - 초당 픽셀 수
 * @param timeSignature - 타임 시그니처
 * @param ppqn - PPQN
 * @param tempoMap - 템포 맵
 * @param isQuantizeEnabled - 퀀타이즈 활성화 여부
 * @param bpm - BPM
 * @returns 상대 measure 위치 또는 null (범위를 벗어났을 때)
 */
export function calculateSplitMeasure(
  clickX: number,
  part: MidiPart,
  partX: number,
  partStartTime: number,
  partDuration: number,
  pixelsPerSecond: number,
  timeSignature: [number, number],
  ppqn: number,
  tempoMap: TempoEvent[],
  isQuantizeEnabled: boolean,
  bpm: number
): number | null {
  // 클릭한 위치를 절대 시간으로 변환
  const clickTime = calculateRelativeClickTime(clickX, partX, pixelsPerSecond);
  let absoluteClickTime = partStartTime + clickTime;
  
  // 퀀타이즈가 활성화되어 있으면 그리드에 스냅
  if (isQuantizeEnabled) {
    const snappedAbsoluteTime = snapTimeToBeat(absoluteClickTime, bpm, timeSignature);
    
    // 스냅된 시간이 파트 범위를 벗어나면 원래 시간 사용
    const snappedTime = snappedAbsoluteTime - partStartTime;
    if (!isSnappedTimeInPartRange(snappedTime, partDuration)) {
      absoluteClickTime = partStartTime + clickTime;
    } else {
      absoluteClickTime = snappedAbsoluteTime;
    }
  }
  
  // 절대 시간을 tick으로 변환
  const { startTick: absoluteSplitTick } = secondsToTicksPure(
    absoluteClickTime,
    0,
    tempoMap,
    timeSignature,
    ppqn
  );
  
  // 파트 기준 상대 위치로 변환 (tick → measure)
  const relativeSplitTick = absoluteSplitTick - part.startTick;
  const { measureDuration: relativeSplitMeasure } = ticksToMeasurePure(0, relativeSplitTick, timeSignature, ppqn);
  
  const { measureDuration: partMeasureDuration } = ticksToMeasurePure(0, part.durationTicks, timeSignature, ppqn);
  
  // 범위 확인
  if (relativeSplitMeasure > 0 && relativeSplitMeasure < partMeasureDuration) {
    return relativeSplitMeasure;
  }
  
  return null;
}

