import { subscribeToTrackChanges, getProject, subscribeToProjectChanges } from '../../store/projectStore';
import { getPlaybackTime } from '../../utils/playbackTimeStore';
import { getBpm, getTimeSignature } from '../../utils/midiTickUtils';
import type { Project } from '../../types/project';
import { AudioEngine } from './AudioEngine';
import { buildPlaybackEvents, type NoteEvent } from './buildPlaybackEvents';

const SCHEDULE_LOOKAHEAD_SECONDS = 0.5;
const SCHEDULE_INTERVAL_MS = 100;

export class PlaybackController {
  private engine = new AudioEngine();
  
  /**
   * AudioEngine 인스턴스 접근 (내부 설정용)
   */
  getEngine(): AudioEngine {
    return this.engine;
  }
  private isPlaying = false;
  private startToken = 0;
  private scheduleTimer: number | null = null;
  private scheduledUntil = 0;
  private events: NoteEvent[] = [];
  private eventIndex = 0;
  private projectSnapshot: Project | null = null;

  constructor() {
    // 프로젝트 변경을 구독하여 BPM/time signature 변경 시 타이밍 업데이트
    subscribeToProjectChanges((event) => {
      if (event.type === 'bpm' || event.type === 'timeSignature') {
        const project = getProject();
        const bpm = getBpm(project);
        const timeSignature = getTimeSignature(project);
        this.engine.setTiming(bpm, timeSignature);
      }
      
      // 마스터 볼륨/패닝/이펙트 변경 시 즉시 업데이트
      if (event.type === 'master') {
        if (event.changes.volume !== undefined) {
          this.engine.updateMasterVolume(event.changes.volume);
        }
        if (event.changes.pan !== undefined) {
          this.engine.updateMasterPan(event.changes.pan);
        }
        if (event.changes.effects !== undefined) {
          this.engine.updateMasterEffects(event.changes.effects);
        }
      }
    });

    // 트랙 변경을 구독하여 mute/solo 변경 시 즉시 재스케줄링
    subscribeToTrackChanges((event) => {
      // mute, solo, mutedBySolo 변경 시에만 재스케줄링
      if (event.changes.mute !== undefined || 
          event.changes.solo !== undefined || 
          event.changes.mutedBySolo !== undefined) {
        this.handleMuteSoloChange();
      }
      
      // 볼륨/패닝 변경 시 즉시 업데이트
      if (event.trackId) {
        const project = getProject();
        const track = project.tracks.find(t => t.id === event.trackId);
        if (track) {
          if (event.changes.volume !== undefined) {
            this.engine.updateTrackVolume(event.trackId, track.volume ?? 1);
          }
          if (event.changes.pan !== undefined) {
            this.engine.updateTrackPan(event.trackId, track.pan ?? 0);
          }
        }
      }
      
      // 이펙터 변경 시 AudioEngine에 즉시 반영
      if (event.changes.effects !== undefined && event.trackId) {
        // 최신 프로젝트 상태 가져오기
        const project = getProject();
        const track = project.tracks.find(t => t.id === event.trackId);
        if (track) {
          this.engine.updateTrackEffects(event.trackId, track.effects || []);
        }
      }
    });

    // 초기 타이밍 설정
    const project = getProject();
    const bpm = getBpm(project);
    const timeSignature = getTimeSignature(project);
    this.engine.setTiming(bpm, timeSignature);
  }

  /**
   * 프로젝트 스냅샷을 업데이트합니다.
   * 
   * @param project - 프로젝트 스냅샷
   */
  updateProjectSnapshot(project: Project): void {
    this.projectSnapshot = project;
    
    // BPM과 time signature 업데이트
    const bpm = getBpm(project);
    const timeSignature = getTimeSignature(project);
    this.engine.setTiming(bpm, timeSignature);
    
    // 마스터 볼륨/패닝/이펙트 업데이트
    this.engine.updateMasterVolume(project.masterVolume ?? 1);
    this.engine.updateMasterPan(project.masterPan ?? 0);
    this.engine.updateMasterEffects(project.masterEffects || []);
    
    // 트랙의 볼륨/패닝/이펙터 업데이트 (트랙 노드를 미리 생성하여 볼륨 미터가 작동하도록)
    for (const track of project.tracks) {
      const trackVolume = track.volume ?? 1;
      const trackPan = track.pan ?? 0;
      // 트랙 노드 생성 (없으면 생성, 있으면 업데이트)
      this.engine.updateTrackVolume(track.id, trackVolume);
      this.engine.updateTrackPan(track.id, trackPan);
      this.engine.updateTrackEffects(track.id, track.effects || []);
    }
    
    // 재생 중이면 즉시 재스케줄링
    if (this.isPlaying) {
      const playbackTime = getPlaybackTime();
      if (Number.isFinite(playbackTime)) {
        this.resetSchedule(playbackTime);
      }
    }
  }

  /**
   * mute/solo 변경 시 즉시 재스케줄링
   */
  private handleMuteSoloChange(): void {
    if (!this.isPlaying || !this.projectSnapshot) {
      return;
    }

    // 현재 재생 중인 오디오 중지
    this.engine.stopAll();
    
    // 현재 재생 시간에서 다시 스케줄링
    const playbackTime = getPlaybackTime();
    if (Number.isFinite(playbackTime)) {
      this.resetSchedule(playbackTime);
    }
  }

  /**
   * 트랙의 오디오 레벨을 가져옵니다
   * 
   * @param trackId - 트랙 ID
   * @returns 오디오 레벨 { left: dB, right: dB } 또는 null
   */
  getTrackLevel(trackId: string): { left: number; right: number } | null {
    return this.engine.getTrackLevel(trackId);
  }

  /**
   * 마스터 오디오 레벨을 가져옵니다
   * 
   * @returns 오디오 레벨 { left: dB, right: dB } 또는 null
   */
  getMasterLevel(): { left: number; right: number } | null {
    return this.engine.getMasterLevel();
  }

  /**
   * 재생을 시작합니다
   * 
   * @param playbackTime - 시작할 재생 시간 (초)
   * @param project - 프로젝트 스냅샷
   */
  async start(playbackTime: number, project: Project): Promise<void> {
    this.projectSnapshot = project;
    this.isPlaying = true;
    const token = ++this.startToken;

    await this.engine.ensureReady();
    if (!this.isPlaying || token !== this.startToken) {
      return;
    }

    // BPM과 time signature 설정
    const bpm = getBpm(project);
    const timeSignature = getTimeSignature(project);
    this.engine.setTiming(bpm, timeSignature);

    // 마스터 볼륨/패닝/이펙트 초기화
    this.engine.updateMasterVolume(project.masterVolume ?? 1);
    this.engine.updateMasterPan(project.masterPan ?? 0);
    this.engine.updateMasterEffects(project.masterEffects || []);
    
    // 트랙의 볼륨/패닝/이펙터 초기화 (트랙 노드를 미리 생성하여 볼륨 미터가 작동하도록)
    for (const track of project.tracks) {
      const trackVolume = track.volume ?? 1;
      const trackPan = track.pan ?? 0;
      // 트랙 노드 생성 (없으면 생성, 있으면 업데이트)
      this.engine.updateTrackVolume(track.id, trackVolume);
      this.engine.updateTrackPan(track.id, trackPan);
      this.engine.updateTrackEffects(track.id, track.effects || []);
    }

    const currentPlaybackTime = Number.isFinite(playbackTime) ? playbackTime : getPlaybackTime();
    this.resetSchedule(currentPlaybackTime);
  }

  /**
   * 재생을 일시 정지합니다
   */
  pause(): void {
    this.isPlaying = false;
    this.startToken += 1;
    this.clearScheduleTimer();
    this.engine.stopAll();
  }

  /**
   * 재생을 중지합니다
   */
  stop(): void {
    this.isPlaying = false;
    this.startToken += 1;
    this.clearScheduleTimer();
    this.engine.stopAll();
  }

  /**
   * 재생 위치를 이동합니다 (시킹)
   * 
   * @param playbackTime - 이동할 재생 시간 (초)
   * @param project - 프로젝트 스냅샷
   */
  async seek(playbackTime: number, project: Project): Promise<void> {
    if (!this.isPlaying) {
      return;
    }

    this.projectSnapshot = project;
    await this.engine.ensureReady();
    if (!this.isPlaying) {
      return;
    }

    this.engine.stopAll();
    this.resetSchedule(playbackTime);
  }

  /**
   * 재생 스케줄을 리셋합니다
   * 
   * @param playbackTime - 현재 재생 시간 (초)
   */
  private resetSchedule(playbackTime: number): void {
    if (!this.projectSnapshot) {
      return;
    }
    this.events = buildPlaybackEvents(this.projectSnapshot);
    this.eventIndex = this.findStartIndex(this.events, playbackTime);
    this.scheduledUntil = playbackTime;

    this.scheduleLookahead();
    this.startScheduleTimer();
  }

  /**
   * 스케줄 타이머를 시작합니다
   * 주기적으로 앞으로의 이벤트를 스케줄링합니다
   */
  private startScheduleTimer(): void {
    this.clearScheduleTimer();
    const token = this.startToken;
    this.scheduleTimer = window.setInterval(() => {
      if (!this.isPlaying || token !== this.startToken) {
        return;
      }
      this.scheduleLookahead();
    }, SCHEDULE_INTERVAL_MS);
  }

  /**
   * 스케줄 타이머를 중지합니다
   */
  private clearScheduleTimer(): void {
    if (this.scheduleTimer !== null) {
      window.clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  /**
   * 앞으로의 이벤트를 미리 스케줄링합니다 (Lookahead)
   * SCHEDULE_LOOKAHEAD_SECONDS만큼 앞서서 스케줄링하여 지연을 방지합니다
   */
  private scheduleLookahead(): void {
    const playbackTime = getPlaybackTime();
    if (!Number.isFinite(playbackTime)) {
      return;
    }
    const windowEnd = playbackTime + SCHEDULE_LOOKAHEAD_SECONDS;
    if (windowEnd <= this.scheduledUntil) {
      return;
    }
    this.scheduleWindow(playbackTime, this.scheduledUntil, windowEnd);
    this.scheduledUntil = windowEnd;
  }

  /**
   * 지정된 시간 윈도우 내의 이벤트를 스케줄링합니다
   * 
   * @param playbackTime - 현재 재생 시간 (초)
   * @param windowStart - 스케줄링할 윈도우 시작 시간 (초)
   * @param windowEnd - 스케줄링할 윈도우 종료 시간 (초)
   */
  private scheduleWindow(playbackTime: number, windowStart: number, windowEnd: number): void {
    if (windowEnd <= windowStart || !this.projectSnapshot) {
      return;
    }

    const audioOffset = this.engine.getCurrentTime() - playbackTime;

    while (this.eventIndex < this.events.length) {
      const event = this.events[this.eventIndex];
      if (event.startTime >= windowEnd) {
        break;
      }
      if (event.startTime >= windowStart) {
        // 트랙 볼륨/패닝으로 노드 생성/업데이트
        const trackVolume = event.track.volume ?? 1;
        const trackPan = event.track.pan ?? 0;
        this.engine.updateTrackVolume(event.track.id, trackVolume);
        this.engine.updateTrackPan(event.track.id, trackPan);
        
        this.engine.scheduleNote({
          midi: event.note.note,
          velocity: event.note.velocity ?? 100,
          startTime: event.startTime,
          duration: event.duration,
          playbackTime,
          audioOffset,
          trackId: event.track.id,
          trackVolume,
          trackPan,
          instrument: event.track.instrument,
        });
      }
      this.eventIndex += 1;
    }
  }


  /**
   * 재생 시간에 해당하는 이벤트 인덱스를 찾습니다 (이진 탐색)
   * 
   * @param events - 정렬된 이벤트 배열
   * @param playbackTime - 찾을 재생 시간 (초)
   * @returns 해당 시간 이후의 첫 번째 이벤트 인덱스
   */
  private findStartIndex(events: NoteEvent[], playbackTime: number): number {
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (events[mid].startTime < playbackTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /**
   * PlaybackController의 모든 리소스를 정리하고 해제합니다.
   * 
   * @returns Promise<void> - 비동기 리소스 해제 완료
   * 
   * @remarks
   * - 재생 중지
   * - 스케줄 타이머 정리
   * - AudioEngine dispose
   * - 페이지 전환 시 호출해야 합니다
   */
  async dispose(): Promise<void> {
    // 재생 중지
    this.isPlaying = false;
    this.startToken += 1;
    
    // 스케줄 타이머 정리
    this.clearScheduleTimer();
    
    // 모든 오디오 소스 중지
    this.engine.stopAll();
    
    // AudioEngine 리소스 해제
    await this.engine.dispose();
    
    // 상태 초기화
    this.scheduledUntil = 0;
    this.events = [];
    this.eventIndex = 0;
    this.projectSnapshot = null;
  }
}

export const playbackController = new PlaybackController();
