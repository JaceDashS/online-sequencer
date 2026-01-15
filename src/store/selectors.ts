import type { Project, MidiPart, MidiNote, Track, MidiProjectTiming } from '../types/project';
import { getProject as getProjectState, findTrackById, findMidiPartById } from './projectState';

/**
 * 프로젝트 전체를 가져오는 셀렉터
 */
export const selectProject = (): Project => {
  return getProjectState();
};

/**
 * 프로젝트 타이밍 정보를 가져오는 셀렉터
 */
export const selectProjectTiming = (project: Project): MidiProjectTiming | undefined => {
  return project.timing;
};

/**
 * 현재 프로젝트의 타이밍 정보를 가져오는 셀렉터 (편의 함수)
 */
export const selectProjectTimingFromCurrent = (): MidiProjectTiming | undefined => {
  const project = selectProject();
  return selectProjectTiming(project);
};

/**
 * 트랙을 ID로 가져오는 셀렉터 (인덱스 사용)
 */
export const selectTrackById = (project: Project, trackId: string): Track | undefined => {
  // 인덱스를 사용하려면 projectState의 인덱스 함수를 호출해야 하지만,
  // 이 함수는 project를 받으므로 인덱스를 직접 사용할 수 없음
  // 일단은 배열 순회로 처리 (인덱스가 프로젝트 상태에 종속적이므로)
  // TODO: 인덱스 기반 셀렉터 추가 검토
  return project.tracks.find(t => t.id === trackId);
};

/**
 * 현재 프로젝트에서 트랙을 ID로 가져오는 셀렉터 (편의 함수, 인덱스 사용)
 */
export const selectTrackByIdFromCurrent = (trackId: string): Track | undefined => {
  // 인덱스 사용
  return findTrackById(trackId);
};

/**
 * MIDI 파트를 ID로 가져오는 셀렉터 (인덱스 사용)
 */
export const selectMidiPart = (project: Project, partId: string): MidiPart | undefined => {
  // 인덱스를 사용하려면 projectState의 인덱스 함수를 호출해야 하지만,
  // 이 함수는 project를 받으므로 인덱스를 직접 사용할 수 없음
  // 일단은 배열 순회로 처리 (인덱스가 프로젝트 상태에 종속적이므로)
  // TODO: 인덱스 기반 셀렉터 추가 검토
  return project.midiParts.find(p => p.id === partId);
};

/**
 * MIDI 파트를 ID로 가져오는 셀렉터 (별칭)
 */
export const selectMidiPartById = selectMidiPart;

/**
 * 현재 프로젝트에서 MIDI 파트를 가져오는 셀렉터 (편의 함수, 인덱스 사용)
 */
export const selectMidiPartFromCurrent = (partId: string): MidiPart | undefined => {
  // 인덱스 사용
  return findMidiPartById(partId);
};

/**
 * MIDI 파트의 노트들을 가져오는 셀렉터
 */
export const selectMidiPartNotes = (project: Project, partId: string): MidiNote[] => {
  const part = selectMidiPart(project, partId);
  return part?.notes || [];
};

/**
 * MIDI 파트의 노트들을 가져오는 셀렉터 (별칭)
 */
export const selectNotesByPartId = selectMidiPartNotes;

/**
 * 현재 프로젝트에서 MIDI 파트의 노트들을 가져오는 셀렉터 (편의 함수)
 */
export const selectMidiPartNotesFromCurrent = (partId: string): MidiNote[] => {
  const project = selectProject();
  return selectMidiPartNotes(project, partId);
};

