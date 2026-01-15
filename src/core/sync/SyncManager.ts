/**
 * SyncManager
 * 프로젝트 상태 동기화를 담당합니다.
 * 호스트와 게스트 모두에서 사용됩니다.
 */

import { CollaborationManager } from './CollaborationManager';
import { ConflictResolver } from './ConflictResolver';
import { getProject, setProject } from '../../store/projectState';
import { subscribeToProjectChanges, subscribeToTrackChanges, subscribeToMidiPartChanges, subscribeToMidiNoteChanges } from '../../store/projectEvents';
import type { ProjectChangeEvent, TrackChangeEvent, MidiPartChangeEvent, MidiNoteChangeEvent } from '../../store/projectEvents';
import { createSimpleTiming, getBpm, getTimeSignature } from '../../utils/midiTickUtils';
import { clearTimingCache } from '../../domain/timing/timingCache';
import type { P2PMessage, RemoteChange, InitialStateMessage, ChangeMessage } from './types/p2p';
import type { Project } from '../../types/project';
import { addMidiPart, removeMidiPart, updateMidiPart, findMidiPart } from '../../store/midiPartActions';
import { addNoteToMidiPart, updateNoteInMidiPart, removeNoteFromMidiPart, addMultipleNotesToMidiPart, removeMultipleNotesFromMidiPart } from '../../store/actions/noteActions';

/**
 * SyncManager
 * Star 토폴로지: 호스트가 중앙 집중식으로 상태 관리
 */
export class SyncManager {
  private collaborationManager: CollaborationManager;
  private clientId: string;
  private isHost: boolean;
  private messageHistory: Set<string> = new Set(); // 중복 메시지 방지
  private maxHistorySize: number = 1000;
  private suppressOutgoing: boolean = false;
  private conflictResolver: ConflictResolver = new ConflictResolver();

  // 변경사항 적용 콜백 (UI 업데이트용)
  private changeCallbacks: Array<(change: RemoteChange) => void> = [];
  
  // 충돌 대기 중인 변경사항 (로컬 변경사항)
  private pendingLocalChanges: Map<string, RemoteChange> = new Map();
  
  // 스로틀링 관련
  private throttleTimers: Map<string, number> = new Map();
  
  // 디바운싱 관련
  private debounceTimers: Map<string, number> = new Map();

  constructor(collaborationManager: CollaborationManager) {
    this.collaborationManager = collaborationManager;
    this.clientId = collaborationManager.getClientId();
    this.isHost = collaborationManager.getIsHost();

    // P2P 메시지 수신 콜백 등록
    this.collaborationManager.onP2PMessage((message) => {
      this.handleP2PMessage(message);
    });

    // 프로젝트 변경 이벤트 구독 (호스트/게스트 모두)
    this.subscribeToProjectChanges();
    this.subscribeToTrackChanges();
    this.subscribeToMidiPartChanges();
    this.subscribeToMidiNoteChanges();

  }

  /**
   * 호스트: 게스트 연결 시 초기 상태 전송
   */
  onGuestConnected(guestId: string): void {
    if (!this.isHost) {
      throw new Error('Only host can send initial state');
    }


    const project = getProject();
    const initialStateMessage: InitialStateMessage = {
      type: 'initial-state',
      from: this.clientId,
      timestamp: Date.now(),
      data: {
        projectState: this.serializeProject(project),
        isInitial: true
      }
    };

    this.collaborationManager.sendToGuest(guestId, initialStateMessage);
  }

  /**
   * 호스트: 게스트 변경사항 수신 콜백 등록
   */
  onGuestChange(_guestId: string, callback: (change: RemoteChange) => void): void {
    if (!this.isHost) {
      throw new Error('Only host can register guest change callback');
    }

    // 게스트로부터 메시지 수신 시 콜백 호출
    // handleP2PMessage에서 처리됨
    this.changeCallbacks.push(callback);
  }

  /**
   * 호스트: 모든 게스트에게 변경사항 브로드캐스트
   */
  broadcastChange(change: RemoteChange): void {
    if (!this.isHost) {
      throw new Error('Only host can broadcast changes');
    }

    // 충돌 감지를 위해 로컬 변경사항 저장
    const conflictKey = this.getConflictKey(change);
    this.pendingLocalChanges.set(conflictKey, change);
    
    // 일정 시간 후 pending에서 제거 (충돌이 없으면)
    setTimeout(() => {
      this.pendingLocalChanges.delete(conflictKey);
    }, 5000); // 5초 후 제거
    
    // 성능 최적화: 스로틀링/디바운싱 적용
    if (this.shouldThrottle(change)) {
      this.throttleChange(change, () => this.sendBroadcastChange(change));
    } else if (this.shouldDebounce(change)) {
      this.debounceChange(change, () => this.sendBroadcastChange(change));
    } else {
      // 즉시 전송 (BPM, 타임 시그니처 등)
      this.sendBroadcastChange(change);
    }
  }

  /**
   * 변경사항 전송 (실제 전송 로직)
   */
  private sendBroadcastChange(change: RemoteChange): void {
    const changeMessage: ChangeMessage = {
      type: 'change',
      from: this.clientId,
      timestamp: Date.now(),
      data: {
        change,
        sequence: Date.now()
      }
    };

    this.collaborationManager.broadcastToAll(changeMessage);
  }

  /**
   * 스로틀링이 필요한 변경사항인지 확인
   */
  private shouldThrottle(change: RemoteChange): boolean {
    // 볼륨, 패닝, 이펙트는 스로틀링 적용
    return change.type === 'channel-volume' || 
           change.type === 'channel-pan' || 
           change.type === 'channel-effect' ||
           change.type === 'master-volume' ||
           change.type === 'master-pan' ||
           change.type === 'master-effect' ||
           change.type === 'midi-part' ||
           change.type === 'midi-note';
  }

  /**
   * 디바운싱이 필요한 변경사항인지 확인
   */
  private shouldDebounce(change: RemoteChange): boolean {
    // 노트 드래그, 미디파트 이동 등은 디바운싱 적용
    if (change.type === 'midi-note' && change.value?.action === 'update') {
      return true;
    }
    if (change.type === 'midi-part' && (change.value?.action === 'move' || change.value?.action === 'resize')) {
      return true;
    }
    return false;
  }

  /**
   * 스로틀링 적용
   */
  private throttleChange(_change: RemoteChange, callback: () => void): void {
    const key = this.getConflictKey(_change);
    const delay = 100; // 100ms (최대 10회/초)
    
    if (this.throttleTimers.has(key)) {
      // 이미 스로틀링 중이면 스킵
      return;
    }
    
    // 즉시 실행
    callback();
    
    // 스로틀링 타이머 설정
    const timer = window.setTimeout(() => {
      this.throttleTimers.delete(key);
    }, delay);
    
    this.throttleTimers.set(key, timer);
  }

  /**
   * 디바운싱 적용
   */
  private debounceChange(_change: RemoteChange, callback: () => void): void {
    const key = this.getConflictKey(_change);
    const delay = 300; // 300ms (드래그 종료 후 300ms 대기)
    
    // 기존 타이머 취소
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // 새 타이머 설정
    const timer = window.setTimeout(() => {
      this.debounceTimers.delete(key);
      callback();
    }, delay);
    
    this.debounceTimers.set(key, timer);
  }

  /**
   * 호스트: 변경사항 적용 (로컬 변경사항)
   */
  applyChange(change: RemoteChange): void {
    this.applyRemoteChange(change);
  }

  /**
   * 게스트: 호스트 변경사항 수신 콜백 등록
   */
  onHostChange(callback: (change: RemoteChange) => void): void {
    if (this.isHost) {
      throw new Error('Host cannot register host change callback');
    }
    this.changeCallbacks.push(callback);
  }

  /**
   * 게스트: 호스트에게 변경사항 전송
   */
  sendChangeToHost(change: RemoteChange): void {
    if (this.isHost) {
      throw new Error('Host cannot send change to host');
    }

    // 충돌 감지를 위해 로컬 변경사항 저장
    const conflictKey = this.getConflictKey(change);
    this.pendingLocalChanges.set(conflictKey, change);
    
    // 일정 시간 후 pending에서 제거
    setTimeout(() => {
      this.pendingLocalChanges.delete(conflictKey);
    }, 5000); // 5초 후 제거
    
    // 성능 최적화: 스로틀링/디바운싱 적용
    if (this.shouldThrottle(change)) {
      this.throttleChange(change, () => this.sendChangeToHostMessage(change));
    } else if (this.shouldDebounce(change)) {
      this.debounceChange(change, () => this.sendChangeToHostMessage(change));
    } else {
      // 즉시 전송 (BPM, 타임 시그니처 등)
      this.sendChangeToHostMessage(change);
    }
  }

  /**
   * 호스트에게 변경사항 전송 (실제 전송 로직)
   */
  private sendChangeToHostMessage(change: RemoteChange): void {
    const changeMessage: ChangeMessage = {
      type: 'change',
      from: this.clientId,
      timestamp: Date.now(),
      data: {
        change,
        sequence: Date.now()
      }
    };

    this.collaborationManager.sendToHost(changeMessage);
  }

  /**
   * 게스트: 초기 프로젝트 상태 적용
   */
  applyProjectState(state: any): void {
    if (this.isHost) {
      throw new Error('Host cannot apply project state');
    }


    try {
      this.suppressOutgoing = true;
      const project = this.deserializeProject(state);
      setProject(project);
    } catch (error) {
      console.error('[SyncManager] Failed to apply project state:', error);
    } finally {
      this.suppressOutgoing = false;
    }
  }

  /**
   * Guest: request host state
   */
  requestInitialState(): void {
    if (this.isHost) {
      throw new Error('Host cannot request initial state');
    }

    const requestMessage: P2PMessage = {
      type: 'state-request',
      from: this.clientId,
      timestamp: Date.now()
    };

    this.collaborationManager.sendToHost(requestMessage);
  }

  /**
   * P2P 메시지 처리
   */
  private handleP2PMessage(message: P2PMessage): void {
    // 중복 메시지 방지
    const messageId = `${message.from}-${message.timestamp}-${message.type}`;
    if (this.messageHistory.has(messageId)) {
      return;
    }
    

    // 히스토리 크기 제한
    if (this.messageHistory.size >= this.maxHistorySize) {
      const firstKey = this.messageHistory.values().next().value;
      if (firstKey !== undefined) {
        this.messageHistory.delete(firstKey);
      }
    }
    this.messageHistory.add(messageId);

    if (message.type === 'initial-state') {
      // 게스트: 초기 상태 수신
      const initialStateMessage = message as InitialStateMessage;
      if (!this.isHost) {
        this.applyProjectState(initialStateMessage.data.projectState);
      }
    } else if (message.type === 'state-request') {
      if (this.isHost) {
        this.onGuestConnected(message.from);
      }
    } else if (message.type === 'change') {
      // 변경사항 수신
      const changeMessage = message as ChangeMessage;
      const change = changeMessage.data.change;

      if (this.isHost) {
        // 호스트: 게스트로부터 변경사항 수신
        // 충돌 감지 및 해결
        const resolvedChange = this.resolveConflictIfNeeded(change);
        this.applyChange(resolvedChange);
        
        // 해결된 변경사항을 다른 게스트들에게 브로드캐스트
        const resolvedChangeMessage: ChangeMessage = {
          ...changeMessage,
          data: {
            ...changeMessage.data,
            change: resolvedChange
          }
        };
        this.collaborationManager.broadcastToOthers(changeMessage.from, resolvedChangeMessage);
      } else {
        // 게스트: 호스트로부터 변경사항 수신 → 적용
        this.applyRemoteChange(change);
      }
    }
  }

  /**
   * 충돌 해결 (필요시)
   * 로컬 변경사항과 원격 변경사항 간 충돌을 감지하고 해결합니다.
   */
  private resolveConflictIfNeeded(remoteChange: RemoteChange): RemoteChange {
    const conflictKey = this.getConflictKey(remoteChange);
    const localChange = this.pendingLocalChanges.get(conflictKey);

    if (localChange && this.conflictResolver.detectConflict(localChange, remoteChange)) {
      // 충돌 발견: LWW 전략으로 해결
      const resolved = this.conflictResolver.resolveConflict({
        local: localChange,
        remote: remoteChange,
        conflictType: 'same-resource'
      });
      
      // 해결된 변경사항이 로컬 변경사항이면 pending에서 제거
      if (resolved.clientId === this.clientId) {
        this.pendingLocalChanges.delete(conflictKey);
      }
      
      return resolved;
    }

    // 충돌 없음: 원격 변경사항 그대로 사용
    return remoteChange;
  }

  /**
   * 충돌 키 생성
   */
  private getConflictKey(change: RemoteChange): string {
    switch (change.type) {
      case 'channel-volume':
      case 'channel-pan':
      case 'channel-effect':
        return `${change.type}:${change.trackId}`;
      case 'master-volume':
      case 'master-pan':
      case 'master-effect':
        return change.type;
      case 'midi-part':
        return `${change.type}:${change.partId}`;
      case 'midi-note':
        return `${change.type}:${change.partId}:${change.noteId}`;
      case 'bpm':
      case 'time-signature':
        return change.type;
      default:
        return `${change.type}:${change.timestamp}`;
    }
  }

  /**
   * 원격 변경사항 적용
   */
  private applyRemoteChange(change: RemoteChange): void {

    try {
      this.suppressOutgoing = true;
      const project = getProject();

      switch (change.type) {
        case 'channel-volume':
          if (change.trackId) {
            const track = project.tracks.find(t => t.id === change.trackId);
            if (track) {
              track.volume = change.value;
            }
          }
          break;

        case 'channel-pan':
          if (change.trackId) {
            const track = project.tracks.find(t => t.id === change.trackId);
            if (track) {
              track.pan = change.value;
            }
          }
          break;

        case 'channel-effect':
          if (change.trackId) {
            const track = project.tracks.find(t => t.id === change.trackId);
            if (track) {
              track.effects = change.value;
            }
          }
          break;

        case 'midi-part': {
          // 미디파트 변경 (추가, 삭제, 업데이트, 이동, 리사이즈)
          const action = change.value.action;
          
          switch (action) {
            case 'add':
              // 파트 추가 (skipHistory=true로 설정하여 동기화 메시지가 다시 전송되지 않도록)
              if (change.value.part) {
                addMidiPart(change.value.part, true);
              }
              break;

            case 'remove':
              // 파트 삭제
              if (change.partId) {
                removeMidiPart(change.partId, true);
              }
              break;

            case 'update':
              // 파트 업데이트
              if (change.partId && change.value.changes) {
                updateMidiPart(change.partId, change.value.changes, true);
              }
              break;

            case 'move':
              // 파트 이동
              if (change.partId && change.value.newStartTick !== undefined) {
                updateMidiPart(change.partId, { startTick: change.value.newStartTick }, true);
              }
              break;

            case 'resize':
              // 파트 리사이즈
              if (change.partId && change.value.newDurationTicks !== undefined) {
                updateMidiPart(change.partId, { durationTicks: change.value.newDurationTicks }, true);
              }
              break;
          }
          break;
        }

        case 'midi-note': {
          // 미디 노트 변경 (추가, 삭제, 업데이트)
          const action = change.value.action;
          const part = change.partId ? findMidiPart(change.partId) : null;

          if (!part) break;

          switch (action) {
            case 'add':
              // 노트 추가
              if (change.value.note) {
                addNoteToMidiPart(change.partId!, change.value.note, true);
              }
              break;

            case 'remove':
              // 노트 삭제
              if (change.value.noteIndex !== undefined) {
                removeNoteFromMidiPart(change.partId!, change.value.noteIndex, true);
              }
              break;

            case 'update':
              // 노트 업데이트
              if (change.value.noteIndex !== undefined && change.value.changes) {
                updateNoteInMidiPart(change.partId!, change.value.noteIndex, change.value.changes, true);
              }
              break;

            case 'addMultiple':
              // 여러 노트 추가
              if (change.value.notes && Array.isArray(change.value.notes)) {
                addMultipleNotesToMidiPart(change.partId!, change.value.notes, true);
              }
              break;

            case 'removeMultiple':
              // 여러 노트 삭제
              if (change.value.noteIndices && Array.isArray(change.value.noteIndices)) {
                removeMultipleNotesFromMidiPart(change.partId!, change.value.noteIndices, true);
              }
              break;
          }
          break;
        }

        case 'time-signature': {
          // 타임 시그니처 변경
          const timeSignature = change.value as [number, number];
          if (!project.timing) {
            const bpm = getBpm(project);
            project.timing = createSimpleTiming(bpm, timeSignature);
          } else {
            // timeSigMap[0] 업데이트 (tick=0의 타임 시그니처 이벤트)
            if (project.timing.timeSigMap.length === 0) {
              project.timing.timeSigMap.push({ tick: 0, num: timeSignature[0], den: timeSignature[1] });
            } else {
              project.timing.timeSigMap[0].num = timeSignature[0];
              project.timing.timeSigMap[0].den = timeSignature[1];
            }
          }
          // 타임 시그니처 변경 시 시간 변환 캐시 클리어
          clearTimingCache();
          break;
        }

        case 'bpm': {
          // BPM 변경
          const bpm = change.value as number;
          if (!project.timing) {
            const timeSignature = getTimeSignature(project);
            project.timing = createSimpleTiming(bpm, timeSignature);
          } else {
            // tempoMap[0] 업데이트 (tick=0의 템포 이벤트)
            if (project.timing.tempoMap.length === 0) {
              project.timing.tempoMap.push({ tick: 0, mpqn: 60000000 / bpm });
            } else {
              project.timing.tempoMap[0].mpqn = 60000000 / bpm;
            }
          }
          // BPM 변경 시 시간 변환 캐시 클리어
          clearTimingCache();
          break;
        }

        case 'master-volume': {
          break;
        }

        case 'master-pan': {
          // 마스터 패닝 변경
          project.masterPan = change.value as number;
          break;
        }

        case 'master-effect': {
          // 마스터 이펙트 변경
          project.masterEffects = change.value as typeof project.masterEffects;
          break;
        }
      }

      setProject(project);

      // 콜백 호출
      this.changeCallbacks.forEach(cb => cb(change));
    } catch (error) {
      console.error('[SyncManager] Failed to apply remote change:', error);
    } finally {
      this.suppressOutgoing = false;
    }
  }

  /**
   * 호스트: 프로젝트 변경 이벤트 구독
   */
  private subscribeToProjectChanges(): void {
    subscribeToProjectChanges((event) => {
      if (this.suppressOutgoing) {
        return;
      }
      // 로컬 변경사항을 RemoteChange로 변환
      const change = this.projectChangeToRemoteChange(event);
      if (change) {
        if (this.isHost) {
          this.broadcastChange(change);
        } else {
          this.sendChangeToHost(change);
        }
      }
    });
  }

  /**
   * 호스트: 트랙 변경 이벤트 구독
   */
  private subscribeToTrackChanges(): void {
    subscribeToTrackChanges((event) => {
      if (this.suppressOutgoing) {
        return;
      }
      // 트랙 변경사항을 RemoteChange로 변환
      const change = this.trackChangeToRemoteChange(event);
      if (change) {
        if (this.isHost) {
          this.broadcastChange(change);
        } else {
          this.sendChangeToHost(change);
        }
      }
    });
  }

  /**
   * 호스트: 미디파트 변경 이벤트 구독
   */
  private subscribeToMidiPartChanges(): void {
    subscribeToMidiPartChanges((event) => {
      if (this.suppressOutgoing) {
        return;
      }
      // 미디파트 변경사항을 RemoteChange로 변환
      const change = this.midiPartChangeToRemoteChange(event);
      if (change) {
        if (this.isHost) {
          this.broadcastChange(change);
        } else {
          this.sendChangeToHost(change);
        }
      }
    });
  }

  /**
   * 호스트: 미디 노트 변경 이벤트 구독
   */
  private subscribeToMidiNoteChanges(): void {
    subscribeToMidiNoteChanges((event) => {
      if (this.suppressOutgoing) {
        return;
      }
      // 미디 노트 변경사항을 RemoteChange로 변환
      const change = this.midiNoteChangeToRemoteChange(event);
      if (change) {
        if (this.isHost) {
          this.broadcastChange(change);
        } else {
          this.sendChangeToHost(change);
        }
      }
    });
  }

  /**
   * 트랙 변경 이벤트를 RemoteChange로 변환
   */
  private trackChangeToRemoteChange(event: TrackChangeEvent): RemoteChange | null {
    const timestamp = Date.now();

    // changes 객체에서 변경된 속성 확인
    // 볼륨, 패닝, 이펙트만 동기화 (다른 속성은 동기화하지 않음)
    if (event.changes.volume !== undefined) {
      return {
        type: 'channel-volume',
        trackId: event.trackId,
        value: event.changes.volume,
        timestamp,
        clientId: this.clientId
      };
    }


    if (event.changes.pan !== undefined) {
      return {
        type: 'channel-pan',
        trackId: event.trackId,
        value: event.changes.pan,
        timestamp,
        clientId: this.clientId
      };
    }

    if (event.changes.effects !== undefined) {
      return {
        type: 'channel-effect',
        trackId: event.trackId,
        value: event.changes.effects,
        timestamp,
        clientId: this.clientId
      };
    }

    // 다른 트랙 속성 변경은 동기화하지 않음 (예: name, color 등)
    return null;
  }

  /**
   * 프로젝트 변경 이벤트를 RemoteChange로 변환
   */
  private projectChangeToRemoteChange(event: ProjectChangeEvent): RemoteChange | null {
    const timestamp = Date.now();

    switch (event.type) {
      case 'bpm': {
        // BPM 변경
        return {
          type: 'bpm',
          value: event.bpm,
          timestamp,
          clientId: this.clientId
        };
      }

      case 'timeSignature': {
        // 타임 시그니처 변경
        return {
          type: 'time-signature',
          value: event.timeSignature,
          timestamp,
          clientId: this.clientId
        };
      }

      case 'master': {
        // Master changes: sync pan/effects only (volume excluded).
        if (event.changes.pan !== undefined) {
          return {
            type: 'master-pan',
            value: event.changes.pan,
            timestamp,
            clientId: this.clientId
          };
        }

        if (event.changes.effects !== undefined) {
          return {
            type: 'master-effect',
            value: event.changes.effects,
            timestamp,
            clientId: this.clientId
          };
        }

        return null;
      }

      case 'track': {
        // 트랙 변경 (어떤 변경인지 알 수 없음)
        // ProjectChangeEvent가 구체적인 변경 정보를 포함하지 않으므로 동기화 불가
        // 실제로는 TrackChangeEvent를 통해 처리됨
        return null;
      }

      case 'midiPart': {
        // 미디파트 변경 (어떤 변경인지 알 수 없음)
        // ProjectChangeEvent가 구체적인 변경 정보를 포함하지 않으므로 동기화 불가
        // 실제로는 MidiPartChangeEvent를 통해 처리됨
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * 미디파트 변경 이벤트를 RemoteChange로 변환
   */
  private midiPartChangeToRemoteChange(event: MidiPartChangeEvent): RemoteChange | null {
    const timestamp = Date.now();

    switch (event.type) {
      case 'add':
        return {
          type: 'midi-part',
          partId: event.part.id,
          trackId: event.part.trackId,
          value: { action: 'add', part: event.part },
          timestamp,
          clientId: this.clientId
        };

      case 'remove':
        return {
          type: 'midi-part',
          partId: event.partId,
          value: { action: 'remove', partId: event.partId },
          timestamp,
          clientId: this.clientId
        };

      case 'update':
        return {
          type: 'midi-part',
          partId: event.partId,
          value: { action: 'update', changes: event.changes },
          timestamp,
          clientId: this.clientId
        };

      case 'move':
        return {
          type: 'midi-part',
          partId: event.partId,
          value: { action: 'move', newStartTick: event.newStartTick },
          timestamp,
          clientId: this.clientId
        };

      case 'resize':
        return {
          type: 'midi-part',
          partId: event.partId,
          value: { action: 'resize', newDurationTicks: event.newDurationTicks },
          timestamp,
          clientId: this.clientId
        };

      default:
        return null;
    }
  }

  /**
   * 미디 노트 변경 이벤트를 RemoteChange로 변환
   */
  private midiNoteChangeToRemoteChange(event: MidiNoteChangeEvent): RemoteChange | null {
    const timestamp = Date.now();

    switch (event.type) {
      case 'add':
        return {
          type: 'midi-note',
          partId: event.partId,
          value: { action: 'add', note: event.note, noteIndex: event.noteIndex },
          timestamp,
          clientId: this.clientId
        };

      case 'remove':
        return {
          type: 'midi-note',
          partId: event.partId,
          value: { action: 'remove', noteIndex: event.noteIndex },
          timestamp,
          clientId: this.clientId
        };

      case 'update':
        return {
          type: 'midi-note',
          partId: event.partId,
          value: { action: 'update', noteIndex: event.noteIndex, changes: event.changes },
          timestamp,
          clientId: this.clientId
        };

      case 'addMultiple':
        return {
          type: 'midi-note',
          partId: event.partId,
          value: { action: 'addMultiple', notes: event.notes },
          timestamp,
          clientId: this.clientId
        };

      case 'removeMultiple':
        return {
          type: 'midi-note',
          partId: event.partId,
          value: { action: 'removeMultiple', noteIndices: event.noteIndices },
          timestamp,
          clientId: this.clientId
        };

      default:
        return null;
    }
  }

  /**
   * 프로젝트 직렬화 (초기 상태 전송용)
   */
  private serializeProject(project: Project): any {
    // TODO: 프로젝트를 직렬화 가능한 형태로 변환
    // 순환 참조 제거, 함수 제거 등
    return JSON.parse(JSON.stringify(project));
  }

  /**
   * 프로젝트 역직렬화 (초기 상태 수신용)
   */
  private deserializeProject(state: any): Project {
    // TODO: 직렬화된 상태를 Project 타입으로 변환
    return state as Project;
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    this.messageHistory.clear();
    this.changeCallbacks = [];
    this.pendingLocalChanges.clear();
    
    // 타이머 정리
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
    
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }
}







