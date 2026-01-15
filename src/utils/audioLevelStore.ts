import { playbackController } from '../core/audio/PlaybackController';

/**
 * 오디오 레벨 (dB 단위)
 */
type AudioLevel = {
  /** 왼쪽 채널 레벨 (dB) */
  left: number;
  /** 오른쪽 채널 레벨 (dB) */
  right: number;
};

/**
 * 오디오 레벨 변경 콜백 함수
 */
type AudioLevelCallback = (level: AudioLevel | null) => void;

/**
 * 오디오 레벨 스토어
 * 트랙별 또는 마스터 오디오 레벨을 구독하고 업데이트합니다
 */
class AudioLevelStore {
  private subscribers = new Map<string, Set<AudioLevelCallback>>();
  private animationFrameId: number | null = null;
  private levels = new Map<string, AudioLevel | null>();

  /**
   * 트랙 또는 마스터 채널의 오디오 레벨 업데이트를 구독합니다
   * 
   * @param trackId - 트랙 ID 또는 'master' (마스터 채널)
   * @param callback - 레벨을 받는 콜백 함수
   * @returns 구독 해제 함수
   */
  subscribe(trackId: string, callback: AudioLevelCallback): () => void {
    if (!this.subscribers.has(trackId)) {
      this.subscribers.set(trackId, new Set());
    }
    this.subscribers.get(trackId)!.add(callback);

    // Start animation loop if not already running
    if (this.animationFrameId === null) {
      this.startAnimationLoop();
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(trackId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(trackId);
        }
      }

      // Stop animation loop if no subscribers
      if (this.subscribers.size === 0 && this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    };
  }

  /**
   * 애니메이션 루프를 시작합니다
   * requestAnimationFrame을 사용하여 주기적으로 오디오 레벨을 업데이트합니다
   */
  private startAnimationLoop(): void {
    const update = () => {
      // 구독 중인 모든 트랙의 레벨 업데이트
      for (const trackId of this.subscribers.keys()) {
        let level: AudioLevel | null = null;
        
        if (trackId === 'master') {
          level = playbackController.getMasterLevel();
        } else {
          level = playbackController.getTrackLevel(trackId);
        }

        this.levels.set(trackId, level);

        // Notify subscribers
        const callbacks = this.subscribers.get(trackId);
        if (callbacks) {
          callbacks.forEach(callback => callback(level));
        }
      }

      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  /**
   * 트랙 또는 마스터의 현재 레벨을 가져옵니다 (동기식, 오래된 값일 수 있음)
   * 
   * @param trackId - 트랙 ID 또는 'master'
   * @returns 현재 오디오 레벨 또는 null
   */
  getLevel(trackId: string): AudioLevel | null {
    return this.levels.get(trackId) ?? null;
  }
}

export const audioLevelStore = new AudioLevelStore();

