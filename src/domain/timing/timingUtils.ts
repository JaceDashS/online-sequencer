/**
 * 타이밍 유틸리티 함수
 * 프로젝트에서 타이밍 정보를 추출하는 헬퍼 함수들
 */

import { MIDI_CONSTANTS } from '../../constants/midi';
import type { Project, MidiProjectTiming } from '../../types/project';
import { bpmToMpqn, mpqnToBpm } from './timingConversions';

/**
 * 단일 BPM/TimeSignature를 Timing Map으로 변환
 */
export function createSimpleTiming(
  bpm: number,
  timeSignature: [number, number],
  ppqn: number = MIDI_CONSTANTS.PPQN
): MidiProjectTiming {
  return {
    ppqn,
    tempoMap: [{ tick: 0, mpqn: bpmToMpqn(bpm) }],
    timeSigMap: [{ tick: 0, num: timeSignature[0], den: timeSignature[1] }],
  };
}

/**
 * 프로젝트에서 BPM을 가져옵니다
 * timing.tempoMap[0]에서 계산하거나, 레거시 프로젝트의 bpm 필드 사용 (마이그레이션용)
 */
export function getBpm(project: Project): number {
  if (project.timing && project.timing.tempoMap.length > 0) {
    return mpqnToBpm(project.timing.tempoMap[0].mpqn);
  }
  // 마이그레이션용: 레거시 프로젝트의 bpm 필드 지원
  const legacyProject = project as any;
  return legacyProject.bpm ?? 120;
}

/**
 * 프로젝트에서 TimeSignature를 가져옵니다
 * timing.timeSigMap[0]에서 계산하거나, 레거시 프로젝트의 timeSignature 필드 사용 (마이그레이션용)
 */
export function getTimeSignature(project: Project): [number, number] {
  if (project.timing && project.timing.timeSigMap.length > 0) {
    const timeSig = project.timing.timeSigMap[0];
    return [timeSig.num, timeSig.den];
  }
  // 마이그레이션용: 레거시 프로젝트의 timeSignature 필드 지원
  const legacyProject = project as any;
  return legacyProject.timeSignature ?? [4, 4];
}

/**
 * 프로젝트에서 PPQN을 가져옵니다
 * timing.ppqn 또는 기본값 사용
 */
export function getPpqn(project: Project): number {
  if (project.timing) {
    return project.timing.ppqn;
  }
  // 기본값
  return MIDI_CONSTANTS.PPQN;
}

