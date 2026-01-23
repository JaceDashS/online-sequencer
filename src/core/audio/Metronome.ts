/**
 * 메트로놈 오디오 엔진
 * BPM에 맞춰 틱 소리를 재생합니다.
 * 마디 시작 시 더 뚜렷한 소리를 재생합니다.
 */

export class Metronome {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tickBuffer: AudioBuffer | null = null;
  private accentBuffer: AudioBuffer | null = null;
  private volume: number = 0.3; // 기본 볼륨 (0-1)
  private bpm: number = 120;
  private timeSignature: [number, number] = [4, 4];
  private scheduledTicks = new Set<number>(); // 이미 스케줄된 틱 시간 추적
  private activeSources = new Set<AudioBufferSourceNode>(); // 재생 중인 소스 추적

  /**
   * AudioContext를 설정합니다
   */
  setContext(context: AudioContext, masterGain: GainNode): void {
    this.context = context;
    this.masterGain = masterGain;
    this.generateTickSounds();
  }

  /**
   * BPM과 타임 시그니처를 설정합니다
   */
  setTiming(bpm: number, timeSignature: [number, number]): void {
    this.bpm = bpm;
    this.timeSignature = timeSignature;
  }

  /**
   * 볼륨을 설정합니다 (0-1)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 틱 소리를 생성합니다 (Web Audio API)
   */
  private generateTickSounds(): void {
    if (!this.context) {
      return;
    }

    const sampleRate = this.context.sampleRate;
    const tickDuration = 0.05; // 50ms
    const tickSamples = Math.floor(sampleRate * tickDuration);

    // 일반 틱 소리 (높은 주파수, 짧은 소리)
    this.tickBuffer = this.context.createBuffer(1, tickSamples, sampleRate);
    const tickData = this.tickBuffer.getChannelData(0);
    const tickFreq = 800; // 800Hz
    for (let i = 0; i < tickSamples; i++) {
      const t = i / sampleRate;
      // 사인파 + 감쇠
      const envelope = Math.exp(-t * 30); // 빠른 감쇠
      tickData[i] = Math.sin(2 * Math.PI * tickFreq * t) * envelope * 0.5;
    }

    // 악센트 틱 소리 (더 낮은 주파수, 더 큰 볼륨)
    this.accentBuffer = this.context.createBuffer(1, tickSamples, sampleRate);
    const accentData = this.accentBuffer.getChannelData(0);
    const accentFreq = 600; // 600Hz
    for (let i = 0; i < tickSamples; i++) {
      const t = i / sampleRate;
      // 사인파 + 더 느린 감쇠
      const envelope = Math.exp(-t * 20); // 더 느린 감쇠
      accentData[i] = Math.sin(2 * Math.PI * accentFreq * t) * envelope * 0.7;
    }
  }

  /**
   * 특정 시간에 틱 소리를 재생합니다
   * 
   * @param playbackTime - 재생 시간 (초, 프로젝트 시간)
   * @param audioOffset - 오디오 시간 오프셋 (audioContext.currentTime - playbackTime)
   * @param isAccent - 마디 시작 여부 (true면 악센트 소리)
   */
  playTick(playbackTime: number, audioOffset: number, isAccent: boolean = false): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const buffer = isAccent ? this.accentBuffer : this.tickBuffer;
    if (!buffer) {
      return;
    }

    // 이미 스케줄된 틱인지 확인 (중복 방지)
    const timeKey = Math.round(playbackTime * 1000); // 밀리초 단위로 반올림
    if (this.scheduledTicks.has(timeKey)) {
      return;
    }
    this.scheduledTicks.add(timeKey);

    // 오래된 틱 제거 (메모리 관리)
    if (this.scheduledTicks.size > 1000) {
      const currentTimeKey = Math.round(this.context.currentTime * 1000);
      for (const key of this.scheduledTicks) {
        if (key < currentTimeKey - 5000) {
          this.scheduledTicks.delete(key);
        }
      }
    }

    const source = this.context.createBufferSource();
    const gainNode = this.context.createGain();
    
    source.buffer = buffer;
    gainNode.gain.value = this.volume;
    
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    
    // 활성 소스 목록에 추가
    this.activeSources.add(source);
    
    // 소스가 종료되면 목록에서 제거
    source.addEventListener('ended', () => {
      this.activeSources.delete(source);
    });
    
    // AudioContext의 currentTime을 기준으로 스케줄링
    const audioTime = playbackTime + audioOffset;
    if (audioTime >= this.context.currentTime) {
      source.start(audioTime);
    }
  }

  /**
   * 스케줄된 틱을 모두 제거하고 재생 중인 소리를 즉시 중지합니다
   */
  clearScheduledTicks(): void {
    this.scheduledTicks.clear();
    this.stopAll();
  }

  /**
   * 재생 중인 모든 메트로놈 소리를 즉시 중지합니다
   */
  stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // 이미 종료된 소스는 무시
      }
    }
    this.activeSources.clear();
  }

  /**
   * 재생 시간에서 박자 번호를 계산합니다
   * 
   * @param playbackTime - 재생 시간 (초)
   * @returns 박자 번호 (0부터 시작, 마디 시작 = 0)
   */
  getBeatNumber(playbackTime: number): number {
    const beatsPerMinute = this.bpm;
    const beatsPerSecond = beatsPerMinute / 60;
    const beatNumber = Math.floor(playbackTime * beatsPerSecond);
    return beatNumber % this.timeSignature[0];
  }

  /**
   * 재생 시간에서 마디 번호를 계산합니다
   * 
   * @param playbackTime - 재생 시간 (초)
   * @returns 마디 번호 (0부터 시작)
   */
  getMeasureNumber(playbackTime: number): number {
    const beatsPerMinute = this.bpm;
    const beatsPerSecond = beatsPerMinute / 60;
    const totalBeats = Math.floor(playbackTime * beatsPerSecond);
    return Math.floor(totalBeats / this.timeSignature[0]);
  }

  /**
   * 특정 시간 윈도우 내의 틱을 스케줄링합니다
   * 
   * @param windowStart - 윈도우 시작 시간 (초, 프로젝트 시간)
   * @param windowEnd - 윈도우 종료 시간 (초, 프로젝트 시간)
   * @param audioOffset - 오디오 시간 오프셋 (audioContext.currentTime - playbackTime)
   */
  scheduleTicks(windowStart: number, windowEnd: number, audioOffset: number): void {
    if (!this.context || windowEnd <= windowStart) {
      return;
    }

    const beatsPerMinute = this.bpm;
    const beatsPerSecond = beatsPerMinute / 60;
    const beatsPerMeasure = this.timeSignature[0];

    // 윈도우 내의 첫 번째 박자와 마지막 박자 계산
    const startBeat = Math.floor(windowStart * beatsPerSecond);
    const endBeat = Math.ceil(windowEnd * beatsPerSecond);

    for (let beat = startBeat; beat <= endBeat; beat++) {
      const beatTime = beat / beatsPerSecond;
      
      // 윈도우 내에 있는지 확인
      if (beatTime < windowStart || beatTime >= windowEnd) {
        continue;
      }

      const beatInMeasure = beat % beatsPerMeasure;
      const isAccent = beatInMeasure === 0; // 마디 시작 = 악센트

      this.playTick(beatTime, audioOffset, isAccent);
    }
  }
}

