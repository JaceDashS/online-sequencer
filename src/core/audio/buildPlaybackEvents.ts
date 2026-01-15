/**
 * Playback Event Builder
 * 
 * 순수 함수로 오디오 스케줄링 로직을 처리합니다.
 * 프로젝트 데이터를 받아서 재생 가능한 이벤트 배열을 반환합니다.
 * 
 * @remarks
 * - Phase 9.2: 오디오 스케줄링 로직을 순수 함수로 분리
 * - 전역 상태에 의존하지 않음
 * - 테스트 가능한 순수 함수
 */

import { ticksToSecondsPure } from '../../utils/midiTickUtils';
import { 
  getTimeSignature,
  getPpqn
} from '../../domain/timing/timingUtils';
import type { Project, MidiNote, Track } from '../../types/project';

const SUSTAIN_CONTROLLER = 64; // CC64 = Sustain Pedal

export type NoteEvent = {
  note: MidiNote;
  startTime: number;
  duration: number;
  track: Track;
};

/**
 * 프로젝트 데이터로부터 재생 가능한 노트 이벤트 배열을 생성합니다.
 * 
 * @param project - 프로젝트 스냅샷
 * @returns 재생 가능한 노트 이벤트 배열 (시간순 정렬)
 */
export function buildPlaybackEvents(project: Project): NoteEvent[] {
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  const soloTracks = project.tracks.filter((track) => track.solo);
  const hasSolo = soloTracks.length > 0;
  const events: NoteEvent[] = [];

  // 프로젝트에서 타이밍 정보 추출
  const timeSignature = getTimeSignature(project);
  const ppqn = getPpqn(project);
  const tempoMap = project.timing?.tempoMap ?? [];

  // Collect all sustain pedal events (CC64) from all parts
  const sustainEvents: Array<{ time: number; isOn: boolean }> = [];
  for (const part of project.midiParts) {
    if (!part.controlChanges) {
      continue;
    }
    for (const cc of part.controlChanges) {
      if (cc.controller === SUSTAIN_CONTROLLER) {
        const absoluteTick = part.startTick + cc.tick;
        const { startTime } = ticksToSecondsPure(absoluteTick, 0, tempoMap, timeSignature, ppqn);
        const isOn = cc.value >= 64; // CC64 >= 64 means sustain ON
        sustainEvents.push({ time: startTime, isOn });
      }
    }
  }
  sustainEvents.sort((a, b) => a.time - b.time);

  for (const part of project.midiParts) {
    const track = trackById.get(part.trackId);
    if (!track) {
      continue;
    }
    if (hasSolo && !track.solo) {
      continue;
    }
    if (!hasSolo && (track.mute || track.mutedBySolo)) {
      continue;
    }
    if (track.instrument !== 'piano' && track.instrument !== 'drum') {
      continue;
    }

    for (const note of part.notes) {
      // 노트의 상대 위치가 음수이거나 파트 범위 밖이면 재생하지 않음
      const noteStartTickRelative = note.startTick;
      const noteEndTickRelative = noteStartTickRelative + note.durationTicks;
      const partDurationTicks = part.durationTicks;
      
      // 노트가 파트 범위 밖에 있으면 재생하지 않음
      if (noteEndTickRelative <= 0 || noteStartTickRelative >= partDurationTicks) {
        continue;
      }
      
      // 클리핑된 노트 범위 계산 (파트 경계로 클리핑)
      const clippedStartTickRelative = Math.max(0, noteStartTickRelative);
      const clippedEndTickRelative = Math.min(partDurationTicks, noteEndTickRelative);
      const clippedDurationTicks = clippedEndTickRelative - clippedStartTickRelative;
      
      if (clippedDurationTicks <= 0) {
        continue;
      }
      
      // 절대 위치 계산 (클리핑된 시작 위치 사용)
      const absoluteStartTick = part.startTick + clippedStartTickRelative;
      const { startTime, duration } = ticksToSecondsPure(absoluteStartTick, clippedDurationTicks, tempoMap, timeSignature, ppqn);
      
      if (duration <= 0) {
        continue;
      }

      // Calculate actual end time considering sustain pedal
      const noteEndTime = startTime + duration;
      let actualEndTime = noteEndTime;

      // If sustain is ON at note end, extend until sustain turns OFF
      const sustainAtNoteEnd = getSustainStateAt(sustainEvents, noteEndTime);
      if (sustainAtNoteEnd) {
        // Find when sustain turns OFF after note end
        const sustainOffTime = findSustainOffTime(sustainEvents, noteEndTime);
        if (sustainOffTime !== null) {
          actualEndTime = sustainOffTime;
        }
      }

      const actualDuration = actualEndTime - startTime;
      if (actualDuration <= 0) {
        continue;
      }

      events.push({ note, startTime, duration: actualDuration, track });
    }
  }

  events.sort((a, b) => a.startTime - b.startTime);
  return events;
}

/**
 * 특정 시간에서 서스테인 페달 상태를 가져옵니다
 * 
 * @param sustainEvents - 서스테인 이벤트 배열 (시간순 정렬)
 * @param time - 확인할 시간 (초)
 * @returns 해당 시간에서 서스테인이 켜져 있는지 여부
 */
function getSustainStateAt(
  sustainEvents: Array<{ time: number; isOn: boolean }>,
  time: number
): boolean {
  // Find the last sustain event before or at this time
  let lastState = false;
  for (const event of sustainEvents) {
    if (event.time > time) {
      break;
    }
    lastState = event.isOn;
  }
  return lastState;
}

/**
 * 주어진 시간 이후에 서스테인이 꺼지는 시간을 찾습니다
 * 
 * @param sustainEvents - 서스테인 이벤트 배열 (시간순 정렬)
 * @param afterTime - 찾기 시작할 시간 (초)
 * @returns 서스테인이 꺼지는 시간 (초) 또는 null (끝까지 꺼지지 않으면)
 */
function findSustainOffTime(
  sustainEvents: Array<{ time: number; isOn: boolean }>,
  afterTime: number
): number | null {
  for (const event of sustainEvents) {
    if (event.time > afterTime && !event.isOn) {
      return event.time;
    }
  }
  return null; // Sustain never turns off (or file ends)
}

