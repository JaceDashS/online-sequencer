/**
 * MIDI Exporter
 * 프로젝트를 SMF (Standard MIDI File) 형식으로 내보냅니다.
 * 
 * @remarks
 * - SMF 표준 정합: NoteOn/NoteOff 이벤트 쌍을 노트로 변환
 * - SMF Format 1 지원: Conductor Track(첫 번째 트랙)에 템포/타임시그니처 이벤트를 포함
 * - 각 트랙의 이름을 Track Name 메타 이벤트로 포함 (템포/타임시그니처 이벤트는 제외)
 * - 여러 MidiPart를 flatten하여 하나의 트랙으로 병합
 */

import type { Project, MidiNote, MidiPart, TempoEvent, TimeSigEvent, MidiControlChange } from '../../types/project';
import type { SmfFile, SmfTrack, MidiEvent } from './smfTypes';
import { MIDI_CONSTANTS } from '../../constants/midi';

/**
 * 값을 지정된 범위로 클램핑합니다.
 * 
 * @param value - 클램핑할 값
 * @param min - 최소값
 * @param max - 최대값
 * @param fallback - 유효하지 않은 값(무한대, NaN 등)일 때 사용할 기본값
 * @returns 클램핑된 값
 */
function clampToRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * 타임 시그니처 분모를 SMF 표준에 맞게 정규화합니다.
 * 
 * @param denominator - 정규화할 분모 값
 * @returns SMF 표준에 맞는 분모 값 (1, 2, 4, 8, 16, 32, 64, 128 중 하나)
 * 
 * @remarks
 * - SMF 표준에서 타임 시그니처 분모는 2의 거듭제곱만 허용됩니다.
 * - 허용되지 않는 값의 경우 가장 가까운 허용 값으로 변환합니다.
 * - 동일한 거리에 있는 경우 더 큰 값을 선택합니다 (예: 3 -> 4, 2가 아님)
 */
function normalizeTimeSignatureDenominator(denominator: number): number {
  const allowed = [1, 2, 4, 8, 16, 32, 64, 128];
  const clamped = clampToRange(denominator, 1, 128, 4);
  if (allowed.includes(clamped)) return clamped;

  // 가장 가까운 허용 값을 찾되, 거리가 같으면 더 큰 값을 선택
  let best = allowed[allowed.length - 1];
  let bestDiff = Math.abs(clamped - best);
  for (const candidate of allowed) {
    const diff = Math.abs(clamped - candidate);
    if (diff < bestDiff || (diff === bestDiff && candidate > best)) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

/**
 * Tick 값을 정규화합니다.
 * 
 * @param value - 정규화할 Tick 값
 * @returns 정규화된 Tick 값 (0 이상의 정수)
 * 
 * @remarks
 * - 유효하지 않은 값(무한대, NaN 등)은 0으로 변환됩니다.
 * - 음수는 0으로 클램핑됩니다.
 * - 소수점은 반올림됩니다.
 */
function normalizeTick(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * MIDI 노트를 Note On/Note Off 이벤트 쌍으로 변환합니다
 * 
 * @param note - MIDI 노트
 * @param durationTicks - 노트의 길이 (tick 단위)
 * @returns MIDI 이벤트 배열 [NoteOn, NoteOff]
 */
function convertNoteToMidiEvents(note: MidiNote, durationTicks: number): MidiEvent[] {
  const channel = clampToRange(note.channel ?? 0, 0, 15, 0);
  const midiNote = clampToRange(note.note, 0, 127, 0);
  const velocity = clampToRange(note.velocity, 0, 127, 0);
  const releaseVelocity = clampToRange(note.releaseVelocity ?? 0, 0, 127, 0);
  
  // Note On 이벤트
  const noteOn: MidiEvent = {
    deltaTime: 0, // 절대 tick 기준이므로 여기서는 delta 0
    type: 'NoteOn',
    channel,
    note: midiNote,
    velocity,
  };
  
  // Note Off 이벤트 (노트 길이만큼 지연)
  const noteOff: MidiEvent = {
    deltaTime: durationTicks, // Note On으로부터의 delta time
    type: 'NoteOff',
    channel,
    note: midiNote,
    velocity: releaseVelocity,
  };
  
  return [noteOn, noteOff];
}

/**
 * 컨트롤 체인지 이벤트를 MIDI Control Change 이벤트로 변환합니다.
 * 
 * @param cc - 컨트롤 체인지 이벤트
 * @returns MIDI Control Change 이벤트
 */
function convertControlChangeToMidiEvent(cc: MidiControlChange): MidiEvent {
  const channel = clampToRange(cc.channel ?? 0, 0, 15, 0);
  const controller = clampToRange(cc.controller, 0, 127, 0);
  const value = clampToRange(cc.value, 0, 127, 0);

  return {
    deltaTime: 0,
    type: 'ControlChange',
    channel,
    controller,
    value,
  };
}

/**
 * 템포 이벤트를 Set Tempo 메타 이벤트로 변환합니다
 * 
 * @param tempoEvent - 템포 이벤트
 * @returns Set Tempo 메타 이벤트
 */
function convertTempoToMetaEvent(tempoEvent: TempoEvent): MidiEvent {
  // MPQN을 3바이트로 변환 (big-endian)
  const mpqn = tempoEvent.mpqn;
  const metaData = new Uint8Array(3);
  metaData[0] = (mpqn >> 16) & 0xFF;
  metaData[1] = (mpqn >> 8) & 0xFF;
  metaData[2] = mpqn & 0xFF;
  
  return {
    deltaTime: 0, // 절대 tick 기준이므로 여기서는 delta 0
    type: 'Meta',
    metaType: 'SetTempo',
    metaData,
  };
}

/**
 * 타임 시그니처 이벤트를 Time Signature 메타 이벤트로 변환합니다
 * 
 * @param timeSigEvent - 타임 시그니처 이벤트
 * @returns Time Signature 메타 이벤트
 */
function convertTimeSigToMetaEvent(timeSigEvent: TimeSigEvent): MidiEvent {
  // Time Signature: [num, den, clocksPerClick, notesPer32nd]
  // den을 2의 거듭제곱으로 정규화 (예: 4 = 2^2)
  const numerator = clampToRange(timeSigEvent.num, 1, 255, 4);
  const denominator = normalizeTimeSignatureDenominator(timeSigEvent.den);
  const denPower = Math.log2(denominator);
  const clocksPerClick = 24; // 기본값
  const notesPer32nd = 8; // 기본값
  
  const metaData = new Uint8Array(4);
  metaData[0] = numerator;
  metaData[1] = denPower;
  metaData[2] = clocksPerClick;
  metaData[3] = notesPer32nd;
  
  return {
    deltaTime: 0, // 절대 tick 기준이므로 여기서는 delta 0
    type: 'Meta',
    metaType: 'TimeSignature',
    metaData,
  };
}

/**
 * 절대 tick 기준 이벤트들을 delta-time 형식으로 변환합니다
 * 
 * @param eventsWithTicks - 이벤트 배열 (각 이벤트에 absoluteTick 속성이 있어야 함)
 * @returns delta-time 형식으로 변환된 이벤트 배열
 */
interface EventWithTick {
  event: MidiEvent;
  absoluteTick: number;
}

function convertToDeltaTime(eventsWithTicks: EventWithTick[]): MidiEvent[] {
  const getEventPriority = (event: MidiEvent): number => {
    // Lower = earlier within the same tick.
    // Rationale (compat-friendly defaults):
    // - Meta events (tempo/time signature/track name) should be applied before musical events at the same tick.
    // - NoteOff should come before NoteOn at the same tick to avoid stuck notes on some players (same pitch retrigger).
    // - EndOfTrack should be last.
    if (event.type === 'Meta') {
      switch (event.metaType) {
        case 'TrackName':
          return 0;
        case 'SetTempo':
          return 1;
        case 'TimeSignature':
          return 2;
        case 'EndOfTrack':
          return 100;
        default:
          return 50;
      }
    }
    if (event.type === 'NoteOff') return 10;
    if (event.type === 'ControlChange') return 15;
    if (event.type === 'NoteOn') return 20;
    return 30;
  };

  // tick 기준으로 정렬 (+ 동일 tick 내 우선순위 적용)
  const sorted = eventsWithTicks
    .map((item, index) => ({ ...item, _index: index }))
    .sort((a, b) => {
      const tickDiff = a.absoluteTick - b.absoluteTick;
      if (tickDiff !== 0) return tickDiff;

      const prioDiff = getEventPriority(a.event) - getEventPriority(b.event);
      if (prioDiff !== 0) return prioDiff;

      // Stable tie-breaker for determinism
      return a._index - b._index;
    })
    .map(({ _index: _unused, ...rest }) => rest);
  
  // delta-time으로 변환
  const result: MidiEvent[] = [];
  let lastTick = 0;
  
  for (const { event, absoluteTick } of sorted) {
    const deltaTime = absoluteTick - lastTick;
    result.push({
      ...event,
      deltaTime,
    });
    lastTick = absoluteTick;
  }
  
  return result;
}

/**
 * 여러 MidiPart를 flatten하여 하나의 SMF 트랙을 생성합니다
 * 
 * @param parts - 병합할 MidiPart 배열
 * @param tempoMap - 템포 맵 (includeTimingMetaEvents가 true일 때만 사용)
 * @param timeSigMap - 타임 시그니처 맵 (includeTimingMetaEvents가 true일 때만 사용)
 * @param trackName - 트랙 이름 (선택)
 * @param includeTimingMetaEvents - 템포/타임시그니처 이벤트를 포함할지 여부 (기본값: false)
 * @param rangeStartTick - 범위 시작 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @param rangeEndTick - 범위 종료 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @returns SMF 트랙
 * 
 * @remarks
 * - SMF Format 1 지원: 템포/타임시그니처 이벤트는 Conductor Track(첫 번째 트랙)에 포함
 * - 각 트랙의 이름만 포함하며 Track Name 메타 이벤트로 설정
 * - 범위가 지정되면 해당 범위와 겹치는 노트만 포함 (노트가 범위와 일부라도 겹치면 포함)
 */
function createTrackFromParts(
  parts: MidiPart[],
  tempoMap: TempoEvent[],
  timeSigMap: TimeSigEvent[],
  trackName?: string,
  includeTimingMetaEvents: boolean = false,
  rangeStartTick?: number,
  rangeEndTick?: number
): SmfTrack {
  const eventsWithTicks: EventWithTick[] = [];
  
  // 모든 파트의 노트를 하나로 병합
  for (const part of parts) {
    for (const note of part.notes) {
      // 노트의 절대 tick 위치
      const noteOnTick = normalizeTick(part.startTick + note.startTick);
      const durationTicks = normalizeTick(note.durationTicks);
      const noteOffTick = noteOnTick + durationTicks;
      
      // 범위 필터링: 범위가 지정되고 노트가 범위와 겹치지 않으면 건너뛰기
      if (rangeStartTick !== undefined && rangeEndTick !== undefined) {
        // 노트가 범위와 겹치는지 확인 (노트의 끝이 범위 시작보다 뒤이고, 노트의 시작이 범위 끝보다 앞)
        if (noteOffTick <= rangeStartTick || noteOnTick >= rangeEndTick) {
          continue; // 범위와 겹치지 않음
        }
      }
      
      // Note On/Note Off 이벤트 생성
      const [noteOn, noteOff] = convertNoteToMidiEvents(note, durationTicks);
      
      eventsWithTicks.push(
        { event: noteOn, absoluteTick: noteOnTick },
        { event: noteOff, absoluteTick: noteOffTick }
      );
    }

    if (part.controlChanges && part.controlChanges.length > 0) {
      for (const cc of part.controlChanges) {
        const ccTick = normalizeTick(part.startTick + cc.tick);
        
        // 범위 필터링: 범위가 지정되고 CC 이벤트가 범위 밖이면 건너뛰기
        if (rangeStartTick !== undefined && rangeEndTick !== undefined) {
          if (ccTick < rangeStartTick || ccTick >= rangeEndTick) {
            continue; // 범위 밖
          }
        }
        
        const ccEvent = convertControlChangeToMidiEvent(cc);
        eventsWithTicks.push({ event: ccEvent, absoluteTick: ccTick });
      }
    }
  }
  
  // 템포 이벤트 추가 (includeTimingMetaEvents가 true일 때만)
  if (includeTimingMetaEvents) {
    for (const tempoEvent of tempoMap) {
      const metaEvent = convertTempoToMetaEvent(tempoEvent);
      eventsWithTicks.push({
        event: metaEvent,
        absoluteTick: tempoEvent.tick,
      });
    }
    
    // 타임 시그니처 이벤트 추가
    for (const timeSigEvent of timeSigMap) {
      const metaEvent = convertTimeSigToMetaEvent(timeSigEvent);
      eventsWithTicks.push({
        event: metaEvent,
        absoluteTick: timeSigEvent.tick,
      });
    }
  }
  
  // Track Name 메타 이벤트 추가 (선택)
  if (trackName) {
    const nameBytes = new TextEncoder().encode(trackName);
    const metaData = new Uint8Array(nameBytes.length);
    metaData.set(nameBytes);
    
    eventsWithTicks.push({
      event: {
        deltaTime: 0,
        type: 'Meta',
        metaType: 'TrackName',
        metaData,
      },
      absoluteTick: 0,
    });
  }
  
  // End of Track 메타 이벤트 추가
  const maxTick = eventsWithTicks.length > 0
    ? Math.max(...eventsWithTicks.map(e => e.absoluteTick))
    : 0;

  eventsWithTicks.push({
    event: {
      deltaTime: 0,
      type: 'Meta',
      metaType: 'EndOfTrack',
      metaData: new Uint8Array(0),
    },
    // SMF: EndOfTrack is typically placed at the last tick of the track.
    // Using maxTick (not maxTick+1) avoids unnecessary length drift on round-trip.
    absoluteTick: maxTick,
  });

  // delta-time으로 변환
  const events = convertToDeltaTime(eventsWithTicks);
  
  return {
    name: trackName,
    events,
  };
}

/**
 * Conductor Track 생성 (SMF Format 1 지원)
 * 
 * @param tempoMap - 템포 맵
 * @param timeSigMap - 타임 시그니처 맵
 * @returns Conductor Track (템포/타임시그니처 이벤트만 포함, 노트 없음)
 * 
 * @remarks
 * - SMF Format 1 지원: 첫 번째 트랙이 Conductor Track입니다
 * - 템포/타임시그니처 이벤트만 포함하며 다른 트랙에는 포함하지 않습니다
 */
function createConductorTrack(
  tempoMap: TempoEvent[],
  timeSigMap: TimeSigEvent[]
): SmfTrack {
  const eventsWithTicks: EventWithTick[] = [];
  
  // Track Name 메타 이벤트 추가
  const trackName = 'Conductor Track';
  const nameBytes = new TextEncoder().encode(trackName);
  const metaData = new Uint8Array(nameBytes.length);
  metaData.set(nameBytes);

  eventsWithTicks.push({
    event: {
      deltaTime: 0,
      type: 'Meta',
      metaType: 'TrackName',
      metaData,
    },
    absoluteTick: 0,
  });

  // 템포 이벤트 추가
  for (const tempoEvent of tempoMap) {
    const metaEvent = convertTempoToMetaEvent(tempoEvent);
    eventsWithTicks.push({
      event: metaEvent,
      absoluteTick: tempoEvent.tick,
    });
  }

  // 타임 시그니처 이벤트 추가
  for (const timeSigEvent of timeSigMap) {
    const metaEvent = convertTimeSigToMetaEvent(timeSigEvent);
    eventsWithTicks.push({
      event: metaEvent,
      absoluteTick: timeSigEvent.tick,
    });
  }

  // End of Track 메타 이벤트 추가
  const maxTick = eventsWithTicks.length > 0
    ? Math.max(...eventsWithTicks.map(e => e.absoluteTick))
    : 0;

  eventsWithTicks.push({
    event: {
      deltaTime: 0,
      type: 'Meta',
      metaType: 'EndOfTrack',
      metaData: new Uint8Array(0),
    },
    absoluteTick: maxTick,
  });

  // delta-time으로 변환
  const events = convertToDeltaTime(eventsWithTicks);
  
  return {
    name: trackName,
    events,
  };
}

/**
 * 프로젝트를 SMF 파일 형식으로 내보냅니다
 * 
 * @param project - 내보낼 프로젝트
 * @param rangeStartTick - 범위 시작 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @param rangeEndTick - 범위 종료 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @returns SMF 파일 객체
 * 
 * @remarks
 * - SMF Format 1 지원: Conductor Track(첫 번째 트랙)에 템포/타임시그니처 이벤트를 포함
 * - 각 트랙의 이름만 포함하며 Track Name 메타 이벤트로 설정 (템포/타임시그니처 이벤트는 제외)
 * - 여러 파트를 하나의 트랙으로 병합하여 각 트랙당 하나의 SMF 트랙을 생성
 * - 범위가 지정되면 해당 범위와 겹치는 노트만 포함
 */
export function exportProjectToSmf(
  project: Project,
  rangeStartTick?: number,
  rangeEndTick?: number
): SmfFile {
  const timing = project.timing || {
    ppqn: MIDI_CONSTANTS.PPQN,
    tempoMap: [{ tick: 0, mpqn: 500000 }], // 120 BPM (500000 microseconds per quarter note = 60000000 / 120)
    timeSigMap: [{ tick: 0, num: 4, den: 4 }],
  };

  const ppqn = clampToRange(timing.ppqn, 1, 0x7FFF, MIDI_CONSTANTS.PPQN);
  
  const tracks: SmfTrack[] = [];
  
  // 1. Conductor Track 생성 (첫 번째 트랙, SMF Format 1 지원)
  // 템포/타임시그니처 이벤트만 포함하며 다른 트랙에는 포함하지 않음
  // 범위가 지정되어도 Conductor Track에는 모든 템포/타임시그니처 이벤트 포함
  const conductorTrack = createConductorTrack(timing.tempoMap, timing.timeSigMap);
  tracks.push(conductorTrack);
  
  // 2. 각 트랙별로 SMF 트랙 생성 (템포/타임시그니처 이벤트 제외)
  for (const track of project.tracks) {
    const parts = project.midiParts.filter(p => p.trackId === track.id);
    
    if (parts.length > 0 || track.name) {
      const smfTrack = createTrackFromParts(
        parts,
        timing.tempoMap, // 파라미터 호환성을 위해 전달하지만 includeTimingMetaEvents=false이므로 사용되지 않음
        timing.timeSigMap,
        track.name,
        false, // 각 트랙에 템포/타임시그니처 이벤트를 포함하지 않음
        rangeStartTick,
        rangeEndTick
      );
      tracks.push(smfTrack);
    }
  }
  
  // Format 1 (여러 트랙) 사용
  const header = {
    format: 1,
    tracks: tracks.length,
    timeDivision: ppqn,
  };
  
  return {
    header,
    tracks,
  };
}

/**
 * SMF 파일 객체를 바이너리 형식으로 인코딩합니다
 * 
 * @param smfFile - SMF 파일 객체
 * @returns 인코딩된 바이너리 (Uint8Array)
 */
export function encodeSmfToBinary(smfFile: SmfFile): Uint8Array {
  const chunks: Uint8Array[] = [];
  
  // Header Chunk (MThd)
  const headerChunk = new Uint8Array(14);
  // "MThd"
  headerChunk.set([0x4D, 0x54, 0x68, 0x64], 0);
  // Chunk length (6 bytes)
  headerChunk.set([0x00, 0x00, 0x00, 0x06], 4);
  // Format (2 bytes, big-endian)
  headerChunk.set([(smfFile.header.format >> 8) & 0xFF, smfFile.header.format & 0xFF], 8);
  // Tracks (2 bytes, big-endian)
  headerChunk.set([(smfFile.header.tracks >> 8) & 0xFF, smfFile.header.tracks & 0xFF], 10);
  // Time Division (2 bytes, big-endian)
  headerChunk.set([(smfFile.header.timeDivision >> 8) & 0xFF, smfFile.header.timeDivision & 0xFF], 12);
  
  chunks.push(headerChunk);
  
  // Track Chunks (MTrk)
  for (const track of smfFile.tracks) {
    const trackData: number[] = [];
    
    // 각 이벤트를 바이너리로 인코딩
    for (const event of track.events) {
      // Variable-length quantity로 delta-time 인코딩
      let delta = event.deltaTime;
      const deltaBytes: number[] = [];
      do {
        deltaBytes.unshift(delta & 0x7F);
        delta >>= 7;
      } while (delta > 0);
      // 마지막 바이트를 제외한 모든 바이트에 MSB 설정
      for (let i = 0; i < deltaBytes.length - 1; i++) {
        deltaBytes[i] |= 0x80;
      }
      trackData.push(...deltaBytes);
      
      // 이벤트 타입에 따라 인코딩
      if (event.type === 'Meta') {
        // Meta 이벤트: 0xFF [type] [length] [data...]
        trackData.push(0xFF);
        if (event.metaType === 'SetTempo') {
          trackData.push(0x51);
          trackData.push(0x03);
          trackData.push(...Array.from(event.metaData!));
        } else if (event.metaType === 'TimeSignature') {
          trackData.push(0x58);
          trackData.push(0x04);
          trackData.push(...Array.from(event.metaData!));
        } else if (event.metaType === 'TrackName') {
          trackData.push(0x03);
          // Variable-length quantity로 길이 인코딩
          let length = event.metaData!.length;
          const lengthBytes: number[] = [];
          do {
            lengthBytes.unshift(length & 0x7F);
            length >>= 7;
          } while (length > 0);
          // 마지막 바이트를 제외한 모든 바이트에 MSB 설정
          for (let i = 0; i < lengthBytes.length - 1; i++) {
            lengthBytes[i] |= 0x80;
          }
          trackData.push(...lengthBytes);
          trackData.push(...Array.from(event.metaData!));
        } else if (event.metaType === 'EndOfTrack') {
          trackData.push(0x2F);
          trackData.push(0x00);
        }
      } else if (event.type === 'NoteOn') {
        // Note On: 0x9n [note] [velocity]
        trackData.push(0x90 | (event.channel ?? 0));
        trackData.push(event.note!);
        trackData.push(event.velocity!);
      } else if (event.type === 'NoteOff') {
        // Note Off: 0x8n [note] [velocity]
        trackData.push(0x80 | (event.channel ?? 0));
        trackData.push(event.note!);
        trackData.push(event.velocity!);
      } else if (event.type === 'ControlChange') {
        // Control Change: 0xBn [controller] [value]
        trackData.push(0xB0 | (event.channel ?? 0));
        trackData.push(event.controller!);
        trackData.push(event.value!);
      }
    }
    
    // Track Chunk (MTrk)
    const trackChunk = new Uint8Array(8 + trackData.length);
    // "MTrk"
    trackChunk.set([0x4D, 0x54, 0x72, 0x6B], 0);
    // Chunk length (4 bytes, big-endian)
    const trackLength = trackData.length;
    trackChunk.set([
      (trackLength >> 24) & 0xFF,
      (trackLength >> 16) & 0xFF,
      (trackLength >> 8) & 0xFF,
      trackLength & 0xFF,
    ], 4);
    // Track data
    trackChunk.set(trackData, 8);
    
    chunks.push(trackChunk);
  }
  
  // 모든 청크를 하나로 병합
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * 프로젝트를 SMF 바이너리 형식으로 내보냅니다 (편의 함수)
 * 
 * @param project - 내보낼 프로젝트
 * @param rangeStartTick - 범위 시작 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @param rangeEndTick - 범위 종료 tick (선택, 제공되면 이 범위 내의 이벤트만 포함)
 * @returns SMF 바이너리 데이터
 */
export function exportProjectToMidiFile(
  project: Project,
  rangeStartTick?: number,
  rangeEndTick?: number
): Uint8Array {
  const smfFile = exportProjectToSmf(project, rangeStartTick, rangeEndTick);
  return encodeSmfToBinary(smfFile);
}


