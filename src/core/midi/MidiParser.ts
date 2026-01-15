/**
 * MIDI Parser
 * SMF (Standard MIDI File) 형식 파일을 파싱하여 프로젝트로 변환합니다.
 * 
 * @remarks
 * - SMF 표준 정합: NoteOn/NoteOff 이벤트 쌍을 노트로 변환
 * - Tempo/Time Signature 메타 이벤트 파싱
 * - 각 트랙별로 이벤트를 MidiPart로 변환
 */

import type { Project, MidiNote, MidiPart, Track, TempoEvent, TimeSigEvent, MidiProjectTiming, MidiControlChange } from '../../types/project';
import type { SmfFile, SmfTrack, MidiEvent } from './smfTypes';

/**
 * Channel message data length by status high-nibble.
 *
 * MIDI 1.0 (channel voice messages):
 * - 0x8 NoteOff: 2
 * - 0x9 NoteOn: 2
 * - 0xA PolyKeyPressure: 2
 * - 0xB ControlChange: 2
 * - 0xC ProgramChange: 1
 * - 0xD ChannelPressure: 1
 * - 0xE PitchBend: 2
 */
function getChannelDataLength(eventTypeNibble: number): 1 | 2 | 0 {
  if (eventTypeNibble === 0xC || eventTypeNibble === 0xD) return 1;
  if (
    eventTypeNibble === 0x8 ||
    eventTypeNibble === 0x9 ||
    eventTypeNibble === 0xA ||
    eventTypeNibble === 0xB ||
    eventTypeNibble === 0xE
  ) {
    return 2;
  }
  return 0;
}

/**
 * System Common / Real-Time message data lengths (excluding SysEx and Meta).
 * In SMF, 0xF0 and 0xF7 are SysEx events with VLQ length, and 0xFF is Meta.
 */
function getSystemMessageDataLength(statusByte: number): number {
  switch (statusByte) {
    case 0xF1: // MTC Quarter Frame
      return 1;
    case 0xF2: // Song Position Pointer
      return 2;
    case 0xF3: // Song Select
      return 1;
    case 0xF6: // Tune Request
      return 0;
    case 0xF8: // Timing Clock
    case 0xFA: // Start
    case 0xFB: // Continue
    case 0xFC: // Stop
    case 0xFE: // Active Sensing
      return 0;
    default:
      return 0;
  }
}

/**
 * Variable-length quantity 디코딩
 * 
 * @param data - 바이너리 데이터
 * @param offset - 시작 오프셋
 * @returns { value: 디코딩된 값, bytesRead: 읽은 바이트 수 }
 */
function readVariableLengthQuantity(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  
  for (let i = offset; i < data.length; i++) {
    const byte = data[i];
    value = (value << 7) | (byte & 0x7F);
    bytesRead++;
    
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  
  return { value, bytesRead };
}

/**
 * 바이너리 데이터에서 SMF 파일 파싱
 * 
 * @param data - SMF 바이너리 데이터
 * @returns SMF 파일 구조
 */
export function parseSmfFromBinary(data: Uint8Array): SmfFile {
  let offset = 0;
  
  // Header Chunk 파싱
  if (data.length < 14) {
    throw new Error('Invalid SMF file: too short');
  }
  
  // "MThd" 확인
  const headerId = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (headerId !== 'MThd') {
    throw new Error('Invalid SMF file: missing MThd header');
  }
  
  offset = 4;
  
  // Chunk length (6이어야 함)
  const headerLength = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
  if (headerLength !== 6) {
    throw new Error('Invalid SMF file: invalid header length');
  }
  offset += 4;
  
  // Format
  const format = (data[offset] << 8) | data[offset + 1];
  offset += 2;

  if (format === 2) {
    throw new Error('Unsupported SMF format: format 2 is not supported. Only format 0 and 1 are supported.');
  }
  
  if (format !== 0 && format !== 1) {
    throw new Error(`Unsupported SMF format: ${format}. Only format 0 and 1 are supported.`);
  }
  
  // Tracks
  const tracks = (data[offset] << 8) | data[offset + 1];
  offset += 2;
  
  // Time Division
  // 상위 비트(0x80)가 설정되어 있으면 SMPTE 포맷, 아니면 PPQN (Pulses Per Quarter Note)
  const timeDivisionByte1 = data[offset];
  const timeDivisionByte2 = data[offset + 1];
  const isSmpte = (timeDivisionByte1 & 0x80) !== 0;
  offset += 2;
  
  if (isSmpte) {
    // SMPTE timeDivision은 현재 지원하지 않음
    // SMPTE 포맷: 상위 바이트는 음수 프레임 타입, 하위 바이트는 틱/프레임
    const frameType = -(timeDivisionByte1 & 0x7F); // 음수 프레임 타입 (24, 25, 29, 30)
    const ticksPerFrame = timeDivisionByte2;
    throw new Error(
      `SMPTE timeDivision is not supported. ` +
      `Frame type: ${frameType}, Ticks per frame: ${ticksPerFrame}. ` +
      `Only PPQN (Pulses Per Quarter Note) format is supported.`
    );
  }
  
  // PPQN (Pulses Per Quarter Note) - 하위 15비트 사용
  const timeDivision = (timeDivisionByte1 << 8) | timeDivisionByte2;
  
  const header = {
    format,
    tracks,
    timeDivision,
  };
  
  // Track Chunks 파싱
  const smfTracks: SmfTrack[] = [];
  
  for (let i = 0; i < tracks; i++) {
    if (offset >= data.length) {
      throw new Error(`Invalid SMF file: missing track ${i + 1}`);
    }
    
    // "MTrk" 확인
    const trackId = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (trackId !== 'MTrk') {
      throw new Error(`Invalid SMF file: missing MTrk header for track ${i + 1}`);
    }
    offset += 4;
    
    // Track length
    const trackLength = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    offset += 4;
    
    // Track data 파싱
    const trackEnd = offset + trackLength;
    const events: MidiEvent[] = [];
    let currentTick = 0;
    let runningStatus = 0;
    let pendingDelta = 0;
    
    while (offset < trackEnd) {
      // Delta-time 읽기
      const { value: deltaTime, bytesRead } = readVariableLengthQuantity(data, offset);
      offset += bytesRead;
      currentTick += deltaTime;
      pendingDelta += deltaTime;
      
      if (offset >= trackEnd) break;
      
      // 이벤트 타입 읽기
      let statusByte = data[offset];
      
      // Meta 이벤트
      if (statusByte === 0xFF) {
        offset++;
        if (offset >= trackEnd) break;
        
        const metaType = data[offset];
        offset++;
        
        // Meta 이벤트 길이 읽기
        const { value: metaLength, bytesRead: metaLengthBytes } = readVariableLengthQuantity(data, offset);
        offset += metaLengthBytes;
        
        // Meta 데이터 읽기
        const metaData = data.slice(offset, offset + metaLength);
        offset += metaLength;
        
        let metaEventType: 'SetTempo' | 'TimeSignature' | 'TrackName' | 'EndOfTrack' | undefined;
        if (metaType === 0x51) {
          metaEventType = 'SetTempo';
        } else if (metaType === 0x58) {
          metaEventType = 'TimeSignature';
        } else if (metaType === 0x03) {
          metaEventType = 'TrackName';
        } else if (metaType === 0x2F) {
          metaEventType = 'EndOfTrack';
        }
        
        if (metaEventType) {
          events.push({
            deltaTime: pendingDelta,
            type: 'Meta',
            metaType: metaEventType,
            metaData,
          });
          pendingDelta = 0;
        }
        
        if (metaEventType === 'EndOfTrack') {
          // Ensure we skip any remaining bytes in this track chunk.
          offset = trackEnd;
          break;
        }

        // Meta 이벤트는 running status와 무관하지만, 파일 구현 상 안전을 위해 리셋
        runningStatus = 0;
      }
      // SysEx 이벤트 (SMF: 0xF0 또는 0xF7 + VLQ length + data)
      else if (statusByte === 0xF0 || statusByte === 0xF7) {
        offset++; // consume status
        if (offset >= trackEnd) break;

        const { value: sysExLength, bytesRead: sysExLengthBytes } = readVariableLengthQuantity(data, offset);
        offset += sysExLengthBytes;

        // skip SysEx payload
        offset += sysExLength;

        // SysEx also resets running status in most parsers
        runningStatus = 0;
      }
      // System Common / Real-Time (not supported; skip safely)
      else if (statusByte >= 0xF1 && statusByte <= 0xFE) {
        // 0xFF handled above, 0xF0/0xF7 handled above
        const len = getSystemMessageDataLength(statusByte);
        offset++; // consume status
        offset += len; // skip payload bytes (if any)
        runningStatus = 0;
      }
      // MIDI 이벤트
      else if (statusByte >= 0x80 && statusByte <= 0xEF) {
        runningStatus = statusByte;
        offset++;
        
        const eventType = (statusByte >> 4) & 0x0F;
        const channel = statusByte & 0x0F;
        
        if (eventType === 0x9) {
          // Note On
          if (offset + 1 >= trackEnd) break;
          const note = data[offset];
          const velocity = data[offset + 1];
          offset += 2;
          
          if (velocity > 0) {
            events.push({
              deltaTime: pendingDelta,
              type: 'NoteOn',
              channel,
              note,
              velocity,
            });
            pendingDelta = 0;
          } else {
            // Note On velocity=0은 Note Off로 처리
            events.push({
              deltaTime: pendingDelta,
              type: 'NoteOff',
              channel,
              note,
              velocity: 0,
            });
            pendingDelta = 0;
          }
        } else if (eventType === 0x8) {
          // Note Off
          if (offset + 1 >= trackEnd) break;
          const note = data[offset];
          const velocity = data[offset + 1];
          offset += 2;
          
          events.push({
            deltaTime: pendingDelta,
            type: 'NoteOff',
            channel,
            note,
            velocity,
          });
          pendingDelta = 0;
        } else if (eventType === 0xB) {
          // Control Change
          if (offset + 1 >= trackEnd) break;
          const controller = data[offset];
          const value = data[offset + 1];
          offset += 2;

          events.push({
            deltaTime: pendingDelta,
            type: 'ControlChange',
            channel,
            controller,
            value,
          });
          pendingDelta = 0;
        } else {
          // 다른 이벤트 타입은 지원하지 않지만, 트랙 파싱 정합을 위해 데이터 바이트를 스킵해야 함
          const dataLen = getChannelDataLength(eventType);
          if (dataLen === 0) {
            // Unknown/unsupported nibble; try to move forward safely
            // (Do not assume payload length; bail out to avoid desync)
            break;
          }
          if (offset + (dataLen - 1) >= trackEnd) break;
          offset += dataLen;
        }
      }
      // Running Status (이전 상태 재사용)
      else if (statusByte < 0x80 && runningStatus !== 0) {
        const running = runningStatus;
        
        const eventType = (running >> 4) & 0x0F;
        const channel = running & 0x0F;
        const dataLen = getChannelDataLength(eventType);
        if (dataLen === 0) break;
        if (offset + (dataLen - 1) >= trackEnd) break;
        
        if (eventType === 0x9) {
          // Note On
          const note = data[offset];
          const velocity = data[offset + 1];
          offset += 2;
          
          if (velocity > 0) {
            events.push({
              deltaTime: pendingDelta,
              type: 'NoteOn',
              channel,
              note,
              velocity,
            });
            pendingDelta = 0;
          } else {
            events.push({
              deltaTime: pendingDelta,
              type: 'NoteOff',
              channel,
              note,
              velocity: 0,
            });
            pendingDelta = 0;
          }
        } else if (eventType === 0x8) {
          // Note Off
          const note = data[offset];
          const velocity = data[offset + 1];
          offset += 2;
          
          events.push({
            deltaTime: pendingDelta,
            type: 'NoteOff',
            channel,
            note,
            velocity,
          });
          pendingDelta = 0;
        } else if (eventType === 0xB) {
          const controller = data[offset];
          const value = data[offset + 1];
          offset += 2;

          events.push({
            deltaTime: pendingDelta,
            type: 'ControlChange',
            channel,
            controller,
            value,
          });
          pendingDelta = 0;
        } else {
          // Unsupported running-status event type; skip its payload
          offset += dataLen;
        }
      } else {
        // 알 수 없는 이벤트, 건너뛰기
        offset++;
      }
    }
    
    // Track Name 찾기
    let trackName: string | undefined;
    for (const event of events) {
      if (event.type === 'Meta' && event.metaType === 'TrackName' && event.metaData) {
        trackName = new TextDecoder().decode(event.metaData);
        break;
      }
    }
    
    smfTracks.push({
      name: trackName,
      events,
    });
  }
  
  return {
    header,
    tracks: smfTracks,
  };
}

/**
 * NoteOn/NoteOff 이벤트를 노트로 변환
 * 
 * @param events - MIDI 이벤트 배열 (절대 tick 기준)
 * @returns MIDI 노트 배열
 * 
 * @remarks
 * ## 중첩 노트 처리 정책 (SMF 표준 준수)
 * 
 * 동일 채널(channel)과 피치(note)의 NoteOn이 여러 번 발생할 수 있습니다.
 * 예를 들어:
 * - Tick 0: NoteOn (C4, channel 0)
 * - Tick 480: NoteOn (C4, channel 0)  // 중첩
 * - Tick 960: NoteOff (C4, channel 0) // 어떤 NoteOn과 매칭?
 * - Tick 1440: NoteOff (C4, channel 0)
 * 
 * **처리 방식: FIFO (First In, First Out)**
 * - NoteOn 이벤트는 스택(배열)에 쌓입니다
 * - NoteOff 이벤트는 가장 오래된(첫 번째) NoteOn과 매칭됩니다
 * - 이는 SMF 표준과 대부분의 MIDI 시퀀서에서 권장하는 방식입니다
 * 
 * **구현 세부사항:**
 * - Map<"channel-note", NoteOnInfo[]> 구조 사용
 * - 동일 키의 NoteOn은 배열에 push (시간 순서대로)
 * - NoteOff는 배열의 첫 번째 요소(shift)와 매칭
 * - 배열이 비면 Map에서 제거
 * 
 * **예시:**
 * ```
 * Tick 0:   NoteOn(C4, ch0)  → Stack: [NoteOn@0]
 * Tick 480: NoteOn(C4, ch0)  → Stack: [NoteOn@0, NoteOn@480]
 * Tick 960: NoteOff(C4, ch0) → 노트 생성: [0-960], Stack: [NoteOn@480]
 * Tick 1440: NoteOff(C4, ch0) → 노트 생성: [480-1440], Stack: []
 * ```
 * 
 * **참고:**
 * - 일부 시퀀서는 LIFO(Last In, First Out) 방식을 사용할 수 있지만,
 *   SMF 표준과 호환성을 위해 FIFO를 사용합니다.
 * - 중첩 노트는 모두 유지되며, 재생 엔진에서 스택 방식으로 처리됩니다.
 */
interface EventWithAbsoluteTick {
  event: MidiEvent;
  absoluteTick: number;
}

interface NoteOnInfo {
  tick: number;
  channel: number;
  note: number;
  velocity: number;
}

function convertMidiEventsToNotes(events: EventWithAbsoluteTick[]): MidiNote[] {
  // 동일 채널/피치의 중첩 노트를 처리하기 위해 스택 구조 사용 (FIFO)
  // key: "channel-note", value: NoteOnInfo[] (배열로 스택 구현)
  const noteOns: Map<string, NoteOnInfo[]> = new Map();
  const notes: MidiNote[] = [];
  
  for (const { event, absoluteTick } of events) {
    if (event.type === 'NoteOn' && event.velocity && event.velocity > 0) {
      // Note On 기록 (스택에 추가)
      const key = `${event.channel ?? 0}-${event.note}`;
      const noteOnInfo: NoteOnInfo = {
        tick: absoluteTick,
        channel: event.channel ?? 0,
        note: event.note!,
        velocity: event.velocity,
      };
      
      if (!noteOns.has(key)) {
        noteOns.set(key, []);
      }
      noteOns.get(key)!.push(noteOnInfo);
    } else if (event.type === 'NoteOff' || (event.type === 'NoteOn' && (!event.velocity || event.velocity === 0))) {
      // Note Off 처리 (FIFO: 가장 오래된 NoteOn과 매칭)
      const key = `${event.channel ?? 0}-${event.note}`;
      const noteOnStack = noteOns.get(key);
      
      if (noteOnStack && noteOnStack.length > 0) {
        // FIFO: 배열의 첫 번째 요소(가장 오래된 NoteOn)를 사용
        const noteOn = noteOnStack.shift()!;
        
        notes.push({
          note: event.note!,
          velocity: noteOn.velocity,
          channel: noteOn.channel,
          startTick: noteOn.tick,
          durationTicks: absoluteTick - noteOn.tick,
          releaseVelocity: event.type === 'NoteOff' ? event.velocity : undefined,
        });
        
        // 스택이 비면 Map에서 제거
        if (noteOnStack.length === 0) {
          noteOns.delete(key);
        }
      }
    }
  }
  
  return notes;
}

function convertMidiEventsToControlChanges(events: EventWithAbsoluteTick[]): MidiControlChange[] {
  const controlChanges: MidiControlChange[] = [];

  for (const { event, absoluteTick } of events) {
    if (event.type === 'ControlChange' && typeof event.controller === 'number' && typeof event.value === 'number') {
      controlChanges.push({
        tick: absoluteTick,
        controller: event.controller,
        value: event.value,
        channel: event.channel,
      });
    }
  }

  return controlChanges;
}

/**
 * SMF 트랙을 MidiPart로 변환
 * 
 * @param track - SMF 트랙
 * @param trackId - 트랙 ID
 * @returns MidiPart 배열
 */
function convertTrackToParts(
  track: SmfTrack,
  trackId: string
): MidiPart[] {
  // Delta-time을 절대 tick으로 변환
  let absoluteTick = 0;
  const eventsWithTicks: EventWithAbsoluteTick[] = [];
  
  for (const event of track.events) {
    absoluteTick += event.deltaTime;
    eventsWithTicks.push({
      event,
      absoluteTick,
    });
  }
  
  // NoteOn/NoteOff 이벤트만 필터링
  const noteEvents = eventsWithTicks.filter(
    e => e.event.type === 'NoteOn' || e.event.type === 'NoteOff'
  );
  const ccEvents = eventsWithTicks.filter(
    e => e.event.type === 'ControlChange'
  );

  const notes = convertMidiEventsToNotes(noteEvents);
  const controlChanges = convertMidiEventsToControlChanges(ccEvents);

  if (notes.length === 0 && controlChanges.length === 0) {
    return [];
  }

  const minTickCandidates: number[] = [];
  if (notes.length > 0) {
    minTickCandidates.push(...notes.map(n => n.startTick));
  }
  if (controlChanges.length > 0) {
    minTickCandidates.push(...controlChanges.map(cc => cc.tick));
  }
  const minTick = Math.min(...minTickCandidates);

  const maxNoteTick = notes.length > 0
    ? Math.max(...notes.map(n => n.startTick + n.durationTicks))
    : minTick;
  const maxCcTick = controlChanges.length > 0
    ? Math.max(...controlChanges.map(cc => cc.tick))
    : minTick;
  const maxTick = Math.max(maxNoteTick, maxCcTick);

  const relativeNotes = notes.map(note => ({
    ...note,
    startTick: note.startTick - minTick,
  }));
  const relativeControlChanges = controlChanges.map(cc => ({
    ...cc,
    tick: cc.tick - minTick,
  }));

  const part: MidiPart = {
    id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    trackId,
    startTick: minTick,
    durationTicks: maxTick - minTick,
    notes: relativeNotes,
    controlChanges: relativeControlChanges.length ? relativeControlChanges : undefined,
  };

  return [part];
}

/**
 * SMF 파일에서 템포 맵 추출
 * 
 * @param smfFile - SMF 파일
 * @returns TempoEvent 배열 (tick 오름차순 정렬)
 * 
 * @remarks
 * - SMF 표준 준수: 모든 트랙에서 템포 이벤트를 스캔하여 수집
 * - Format 1에서는 첫 번째 트랙(conductor track)에 주로 있지만, 다른 트랙에도 있을 수 있음
 * - 모든 트랙의 이벤트를 시간 순서로 정렬하여 통합된 템포 맵 생성
 */
function extractTempoMap(tracks: SmfTrack[]): TempoEvent[] {
  const tempoMap: TempoEvent[] = [];
  
  // 모든 트랙에서 템포 이벤트 찾기
  for (const track of tracks) {
    let absoluteTick = 0;
    
    for (const event of track.events) {
      absoluteTick += event.deltaTime;
      
      if (event.type === 'Meta' && event.metaType === 'SetTempo' && event.metaData && event.metaData.length >= 3) {
        // MPQN 읽기 (3 bytes, big-endian)
        const mpqn = (event.metaData[0] << 16) | (event.metaData[1] << 8) | event.metaData[2];
        tempoMap.push({
          tick: absoluteTick,
          mpqn,
        });
      }
    }
  }
  
  // tick 오름차순으로 정렬 (중복 제거는 하지 않음 - 동일 tick의 템포 변경도 허용)
  tempoMap.sort((a, b) => a.tick - b.tick);
  
  // 기본값이 없으면 추가
  if (tempoMap.length === 0) {
    tempoMap.push({ tick: 0, mpqn: 500000 }); // 120 BPM
  }
  
  return tempoMap;
}

/**
 * SMF 파일에서 타임 시그니처 맵 추출
 * 
 * @param smfFile - SMF 파일
 * @returns TimeSigEvent 배열 (tick 오름차순 정렬)
 * 
 * @remarks
 * - SMF 표준 준수: 모든 트랙에서 타임 시그니처 이벤트를 스캔하여 수집
 * - Format 1에서는 첫 번째 트랙(conductor track)에 주로 있지만, 다른 트랙에도 있을 수 있음
 * - 모든 트랙의 이벤트를 시간 순서로 정렬하여 통합된 타임 시그니처 맵 생성
 */
function extractTimeSigMap(tracks: SmfTrack[]): TimeSigEvent[] {
  const timeSigMap: TimeSigEvent[] = [];
  
  // 모든 트랙에서 타임 시그니처 이벤트 찾기
  for (const track of tracks) {
    let absoluteTick = 0;
    
    for (const event of track.events) {
      absoluteTick += event.deltaTime;
      
      if (event.type === 'Meta' && event.metaType === 'TimeSignature' && event.metaData && event.metaData.length >= 4) {
        const num = event.metaData[0];
        const denPower = event.metaData[1];
        const den = Math.pow(2, denPower);
        
        timeSigMap.push({
          tick: absoluteTick,
          num,
          den,
        });
      }
    }
  }
  
  // tick 오름차순으로 정렬 (중복 제거는 하지 않음 - 동일 tick의 타임 시그니처 변경도 허용)
  timeSigMap.sort((a, b) => a.tick - b.tick);
  
  // 기본값이 없으면 추가
  if (timeSigMap.length === 0) {
    timeSigMap.push({ tick: 0, num: 4, den: 4 });
  }
  
  return timeSigMap;
}

/**
 * SMF 파일을 프로젝트로 변환
 * 
 * @param smfFile - SMF 파일 구조
 * @returns 프로젝트
 */
export function importSmfToProject(smfFile: SmfFile): Project {
  const ppqn = smfFile.header.timeDivision;
  
  // 템포 맵과 타임 시그니처 맵 추출
  const tempoSourceTracks = smfFile.header.format === 2 ? smfFile.tracks.slice(0, 1) : smfFile.tracks;
  const timeSigSourceTracks = smfFile.header.format === 2 ? smfFile.tracks.slice(0, 1) : smfFile.tracks;
  const tempoMap = extractTempoMap(tempoSourceTracks);
  const timeSigMap = extractTimeSigMap(timeSigSourceTracks);
  
  // Timing 생성
  const timing: MidiProjectTiming = {
    ppqn,
    tempoMap,
    timeSigMap,
  };
  
  // 트랙 생성
  const tracks: Track[] = [];
  const midiParts: MidiPart[] = [];
  
  for (let i = 0; i < smfFile.tracks.length; i++) {
    const smfTrack = smfFile.tracks[i];
    const trackId = `track-${i + 1}`;
    
    // 트랙 생성
    const track: Track = {
      id: trackId,
      name: smfTrack.name || `Track ${i + 1}`,
      instrument: 'piano',
      volume: 100 / 120,
      pan: 0.0,
      effects: [],
      solo: false,
      mute: false,
      mutedBySolo: false,
    };
    tracks.push(track);
    
    // MidiPart 생성
    const parts = convertTrackToParts(smfTrack, trackId);
    midiParts.push(...parts);
  }
  
  // 프로젝트 생성
  const project: Project = {
    version: 2,
    timing,
    tracks,
    midiParts,
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
  
  return project;
}

/**
 * 바이너리 데이터에서 프로젝트로 직접 변환
 * 
 * @param data - SMF 바이너리 데이터
 * @returns 프로젝트
 */
export function importMidiFileToProject(data: Uint8Array): Project {
  const smfFile = parseSmfFromBinary(data);
  return importSmfToProject(smfFile);
}
