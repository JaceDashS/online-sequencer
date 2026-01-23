type PianoKeySample = {
  sampleUrl: string;
  root: number;
  type: 'piano';
};

type DrumSample = {
  sampleUrl: string;
  midiNote: number;
  type: 'drum';
};

type SfzRegion = {
  lokey?: number;
  hikey?: number;
  pitchKeycenter?: number;
  sample?: string;
};

type ScheduledNote = {
  midi: number;
  velocity: number;
  startTime: number;
  duration: number;
  playbackTime: number;
  audioOffset: number;
  trackId: string;
  trackVolume: number;
  trackPan: number;
  instrument: string;
};

const PIANO_SFZ_PATH = 'samples/pianos/UprightPianoKW-small-bright-SFZ+FLAC-20190703/UprightPianoKW-small-bright-20190703.sfz';
const PIANO_KEY_MIN = 21;
const PIANO_KEY_MAX = 108;

// GM 드럼 샘플 매핑 (MIDI 노트 번호 -> 파일명)
const DRUM_SAMPLE_MAP: Record<number, string> = {
  35: 'AcousticBassDrum.flac',
  36: 'AcousticBassDrum.flac', // Bass Drum 1
  38: 'AcousticSnare.flac',
  40: 'ElectricSnare.wav',
  42: 'ClosedHiHat.flac',
  44: 'PedalHiHat.wav',
  46: 'OpenHi-Hat.flac',
  47: 'LowTom.flac', // Low Mid Tom
  48: 'MidTom.flac', // Hi Mid Tom
  49: 'CrashCymbal1.flac',
  50: 'HighTom.flac',
  51: 'RideCymbal1.flac',
  52: 'ChinaCymbal.flac',
  53: 'RideBell.flac',
  55: 'SplashCymbal.flac',
  57: 'CrashCymbal2.flac',
  59: 'RideCymbal2.flac',
  60: 'HighBongo.flac',
  61: 'LowBongo.flac',
  62: 'MutedConga.flac',
  63: 'HighConga.flac',
  64: 'LowConga.flac',
  65: 'HighTom.flac', // High Timbale (대체)
  66: 'LowTom.flac', // Low Timbale (대체)
  67: 'HighAgogo.flac',
  68: 'LowAgogo.flac',
  69: 'Cabasa.flac',
  70: 'Maracas.flac',
  71: 'ShortWhistle.flac',
  72: 'LongWhistle.flac',
  73: 'ShortGuiro.wav',
  74: 'LongGuiro.wav',
  75: 'Claves.flac',
  76: 'WoodBlock.flac', // Hi Wood Block
  77: 'WoodBlock.flac', // Low Wood Block
  78: 'MutedConga.flac', // Mute Cuica (대체)
  79: 'HighConga.flac', // Open Cuica (대체)
  80: 'MutedTriangle.flac',
  81: 'OpenTriangle.flac',
};

const DRUM_SAMPLES_BASE_PATH = 'samples/drums/FreePatsGM-SFZ+FLAC-20221026/samples/Percussion/';
const DRUM_KEY_MIN = 35;
const DRUM_KEY_MAX = 81;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

import type { Effect, Project } from '../../types/project';
import { EffectChain } from '../effects/EffectChain';
import { beginAudioLoading, endAudioLoading } from '../../utils/audioLoadingStore';
import { buildPlaybackEvents, type NoteEvent } from './buildPlaybackEvents';

type TrackAudioNodes = {
  gain: GainNode;
  panner: StereoPannerNode;
  leftAnalyser: AnalyserNode;
  rightAnalyser: AnalyserNode;
  splitter: ChannelSplitterNode;
  effectChain: EffectChain | null;
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterEffectChain: EffectChain | null = null;
  private masterLeftAnalyser: AnalyserNode | null = null;
  private masterRightAnalyser: AnalyserNode | null = null;
  private masterSplitter: ChannelSplitterNode | null = null;
  private trackNodes = new Map<string, TrackAudioNodes>();
  private sampleBuffers = new Map<string, AudioBuffer>();
  private pendingSampleBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private pianoKeyMap: Map<number, PianoKeySample> | null = null;
  private drumSampleMap: Map<number, DrumSample> | null = null;
  private readyPromise: Promise<void> | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private previewSources = new Map<number, AudioBufferSourceNode>(); // MIDI note -> source for preview
  private previewGainNodes = new Map<number, GainNode>(); // MIDI note -> gainNode for preview (페이드아웃용)
  private bpm: number = 120;
  private timeSignature: [number, number] = [4, 4];
  private masterVolume: number = 1;
  // 마스터 패닝은 현재 마스터 레벨에서 적용되지 않지만, 나중을 위해 저장
  // private masterPan: number = 0;
  private pitchOffsetMaxMs: number = 3; // 같은 음계 간섭 방지를 위한 최대 시간 오프셋 (밀리초)
  private desiredLatencyHintSeconds: number | null = null;
  private appliedLatencyHintSeconds: number | null = null;
  
  // 같은 음계 감지를 위한 활성 노트 추적 (pitch class -> 활성 노트 정보 배열)
  // pitch class: MIDI note % 12 (0-11, C=0, C#=1, ..., B=11)
  private activeNotesByPitchClass = new Map<number, Array<{
    startTime: number;
    endTime: number;
    source: AudioBufferSourceNode;
  }>>();

  getCurrentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * Output latency hint (seconds) for AudioContext creation.
   * Returns true if a context recreation is needed to apply the change.
   */
  setOutputLatencyHintSeconds(seconds: number): boolean {
    if (!Number.isFinite(seconds)) return false;
    const next = Math.max(0.001, seconds);
    this.desiredLatencyHintSeconds = next;
    if (!this.context) {
      return false;
    }
    if (this.appliedLatencyHintSeconds === null) {
      return true;
    }
    return Math.abs(this.appliedLatencyHintSeconds - next) > 0.0001;
  }

  async recreateContextForLatencyHint(): Promise<void> {
    if (!this.context && !this.readyPromise) {
      return;
    }
    await this.dispose();
    await this.ensureReady();
  }

  isReady(): boolean {
    return Boolean(this.context && this.masterGain && this.pianoKeyMap && this.drumSampleMap);
  }

  stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Ignore stop errors for nodes that already ended.
      }
    }
    this.activeSources.clear();
    
    // Also stop all preview sources
    for (const source of this.previewSources.values()) {
      try {
        source.stop();
      } catch {
        // Ignore stop errors for nodes that already ended.
      }
    }
    this.previewSources.clear();
    this.previewGainNodes.clear();
    
    // Clear active notes tracking
    this.activeNotesByPitchClass.clear();
  }
  
  /**
   * 같은 음계 간섭 방지를 위한 최대 시간 오프셋 설정
   * @param maxMs - 최대 시간 오프셋 (밀리초, 0-20 범위)
   */
  setPitchOffsetMaxMs(maxMs: number): void {
    this.pitchOffsetMaxMs = Math.max(0, Math.min(20, Math.floor(maxMs)));
  }

  /**
   * Get audio level for a track (returns left and right channel levels in dB)
   */
  getTrackLevel(trackId: string): { left: number; right: number } | null {
    const trackNodes = this.trackNodes.get(trackId);
    if (!trackNodes || !this.context) {
      return null;
    }

    // Get left channel level (using time domain data for accurate level metering)
    const leftDataArray = new Float32Array(trackNodes.leftAnalyser.fftSize);
    trackNodes.leftAnalyser.getFloatTimeDomainData(leftDataArray);
    let leftMax = 0;
    for (let i = 0; i < leftDataArray.length; i++) {
      const abs = Math.abs(leftDataArray[i]);
      leftMax = Math.max(leftMax, abs);
    }
    // Use peak for more responsive metering, but clamp to avoid clipping
    const leftPeak = Math.min(leftMax, 1.0);
    const leftDb = leftPeak > 0.0001 ? 20 * Math.log10(leftPeak) : -Infinity;

    // Get right channel level
    const rightDataArray = new Float32Array(trackNodes.rightAnalyser.fftSize);
    trackNodes.rightAnalyser.getFloatTimeDomainData(rightDataArray);
    let rightMax = 0;
    for (let i = 0; i < rightDataArray.length; i++) {
      const abs = Math.abs(rightDataArray[i]);
      rightMax = Math.max(rightMax, abs);
    }
    const rightPeak = Math.min(rightMax, 1.0);
    const rightDb = rightPeak > 0.0001 ? 20 * Math.log10(rightPeak) : -Infinity;
    
    return { left: leftDb, right: rightDb };
  }

  /**
   * Get master audio level (returns left and right channel levels in dB)
   */
  getMasterLevel(): { left: number; right: number } | null {
    if (!this.masterLeftAnalyser || !this.masterRightAnalyser || !this.context) {
      return null;
    }

    // Get left channel level (using time domain data for accurate level metering)
    const leftDataArray = new Float32Array(this.masterLeftAnalyser.fftSize);
    this.masterLeftAnalyser.getFloatTimeDomainData(leftDataArray);
    let leftMax = 0;
    for (let i = 0; i < leftDataArray.length; i++) {
      const abs = Math.abs(leftDataArray[i]);
      leftMax = Math.max(leftMax, abs);
    }
    const leftPeak = Math.min(leftMax, 1.0);
    const leftDb = leftPeak > 0.0001 ? 20 * Math.log10(leftPeak) : -Infinity;

    // Get right channel level
    const rightDataArray = new Float32Array(this.masterRightAnalyser.fftSize);
    this.masterRightAnalyser.getFloatTimeDomainData(rightDataArray);
    let rightMax = 0;
    for (let i = 0; i < rightDataArray.length; i++) {
      const abs = Math.abs(rightDataArray[i]);
      rightMax = Math.max(rightMax, abs);
    }
    const rightPeak = Math.min(rightMax, 1.0);
    const rightDb = rightPeak > 0.0001 ? 20 * Math.log10(rightPeak) : -Infinity;
    
    return { left: leftDb, right: rightDb };
  }

  async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      beginAudioLoading();
      if (typeof window === 'undefined') {
        endAudioLoading();
        return;
      }

      try {
        if (!this.context) {
          const AudioContextClass =
            window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextClass) {
            console.error('[AudioEngine] AudioContext not available');
            return;
          }
          const latencyHint = this.desiredLatencyHintSeconds ?? undefined;
          this.context = new AudioContextClass(
            latencyHint ? { latencyHint } : undefined
          );
          this.appliedLatencyHintSeconds = latencyHint ?? null;
          this.masterGain = this.context.createGain();
          this.masterGain.gain.value = this.masterVolume;
          
          // Create master effect chain (마스터 이펙트 체인)
          this.masterEffectChain = new EffectChain(this.context);
          this.masterEffectChain.setTiming(this.bpm, this.timeSignature);
          this.masterEffectChain.updateEffects([]); // 초기에는 빈 배열
          
          // Create master analysers for left and right channels
          this.masterLeftAnalyser = this.context.createAnalyser();
          this.masterLeftAnalyser.fftSize = 2048;
          this.masterLeftAnalyser.smoothingTimeConstant = 0.8;
          
          this.masterRightAnalyser = this.context.createAnalyser();
          this.masterRightAnalyser.fftSize = 2048;
          this.masterRightAnalyser.smoothingTimeConstant = 0.8;
          
          // Create splitter to separate left/right channels for metering
          // masterGain은 여러 트랙의 effectChain 출력을 합산하므로 스테레오 출력입니다
          this.masterSplitter = this.context.createChannelSplitter(2);
          
          // Connect: masterEffectChain -> masterGain -> splitter -> analysers (for metering)
          this.masterEffectChain.getOutput().connect(this.masterGain);
          this.masterGain.connect(this.masterSplitter);
          // Left channel (splitter output 0) -> left analyser (input 0)
          this.masterSplitter.connect(this.masterLeftAnalyser, 0, 0);
          // Right channel (splitter output 1) -> right analyser (input 0)
          this.masterSplitter.connect(this.masterRightAnalyser, 1, 0);
          
          // Connect master gain to destination for audio output (오디오 출력 연결)
          // GainNode는 여러 곳에 연결할 수 있으므로 splitter와 destination 모두에 연결 가능
          this.masterGain.connect(this.context.destination);
        }

        if (this.context.state === 'suspended') {
          // Resume can be blocked until a user gesture; don't block loading on it.
          void this.context.resume().catch(() => {
            // Ignore resume failures; playback will retry on demand.
          });
        }

        if (!this.pianoKeyMap) {
          this.pianoKeyMap = await this.loadPianoKeyMap();
        }

        if (!this.drumSampleMap) {
          this.drumSampleMap = await this.loadDrumSampleMap();
        }

        // Samples are loaded lazily per pitch.
      } finally {
        endAudioLoading();
      }
    })();

    return this.readyPromise;
  }

  private getOrCreateTrackNodes(trackId: string, trackVolume: number = 1, trackPan: number = 0): TrackAudioNodes | null {
    if (!this.context || !this.masterGain || !this.masterEffectChain) {
      return null;
    }

    if (this.trackNodes.has(trackId)) {
      return this.trackNodes.get(trackId)!;
    }

    // Create track-level gain node
    const trackGain = this.context.createGain();
    trackGain.gain.value = trackVolume;

    // Create track-level panner
    const trackPanner = this.context.createStereoPanner();
    trackPanner.pan.value = trackPan;

    // Create effect chain
    const effectChain = new EffectChain(this.context);
    
    // 초기 이펙터 설정 (트랙 노드 생성 시점에는 빈 배열로 시작)
    // 실제 이펙터는 updateTrackEffects에서 설정됨
    effectChain.updateEffects([]);

    // Create analysers for left and right channels
    const leftAnalyser = this.context.createAnalyser();
    leftAnalyser.fftSize = 2048;
    leftAnalyser.smoothingTimeConstant = 0.8;

    const rightAnalyser = this.context.createAnalyser();
    rightAnalyser.fftSize = 2048;
    rightAnalyser.smoothingTimeConstant = 0.8;

    // Create splitter to separate left/right channels for metering
    const splitter = this.context.createChannelSplitter(2);

    // Connect: trackGain -> trackPanner -> effectChain -> splitter -> analysers (for metering)
    trackGain.connect(trackPanner);
    trackPanner.connect(effectChain.getInput());
    const effectChainOutput = effectChain.getOutput();
    
    // Connect effect chain output to splitter for metering (트랙 레벨 미터링)
    effectChainOutput.connect(splitter);
    splitter.connect(leftAnalyser, 0, 0); // Left channel to left analyser
    splitter.connect(rightAnalyser, 1, 0); // Right channel to right analyser
    
    // Connect effect chain output to master effect chain input (마스터 이펙트 적용 후 master gain으로)
    // 트랙 -> masterEffectChain -> masterGain -> destination
    // masterEffectChain은 getOrCreateTrackNodes 시작 부분에서 null 체크를 했으므로 여기서는 항상 존재함
    effectChainOutput.connect(this.masterEffectChain!.getInput());

    const nodes: TrackAudioNodes = { 
      gain: trackGain,
      panner: trackPanner,
      leftAnalyser, 
      rightAnalyser, 
      splitter,
      effectChain 
    };
    this.trackNodes.set(trackId, nodes);
    return nodes;
  }

  /**
   * BPM과 Time Signature를 설정합니다 (박자 기반 딜레이용)
   */
  setTiming(bpm: number, timeSignature: [number, number]): void {
    this.bpm = bpm;
    this.timeSignature = timeSignature;
    
    // 모든 트랙의 EffectChain에 타이밍 정보 업데이트
    for (const trackNodes of this.trackNodes.values()) {
      if (trackNodes.effectChain) {
        trackNodes.effectChain.setTiming(bpm, timeSignature);
      }
    }
    
    // 마스터 EffectChain에도 타이밍 정보 업데이트
    if (this.masterEffectChain) {
      this.masterEffectChain.setTiming(bpm, timeSignature);
    }
  }

  /**
   * 트랙의 이펙터를 업데이트합니다
   * @param trackId - 트랙 ID
   * @param effects - 이펙터 배열
   */
  updateTrackEffects(trackId: string, effects: Effect[]): void {
    const trackNodes = this.trackNodes.get(trackId);
    if (!trackNodes || !trackNodes.effectChain) {
      // 트랙 노드가 없으면 생성 (기본 볼륨/패닝으로)
      this.getOrCreateTrackNodes(trackId, 1, 0);
      const updatedNodes = this.trackNodes.get(trackId);
      if (updatedNodes && updatedNodes.effectChain) {
        updatedNodes.effectChain.setTiming(this.bpm, this.timeSignature);
        updatedNodes.effectChain.updateEffects(effects);
      }
      return;
    }

    trackNodes.effectChain.setTiming(this.bpm, this.timeSignature);
    trackNodes.effectChain.updateEffects(effects);
  }

  /**
   * 트랙 볼륨을 즉시 업데이트합니다
   * @param trackId - 트랙 ID
   * @param volume - 볼륨 값 (0-1 정규화)
   */
  updateTrackVolume(trackId: string, volume: number): void {
    // context, masterGain, masterEffectChain이 준비되지 않았으면 무시
    // (getOrCreateTrackNodes에서도 확인하지만, 여기서도 확인하여 불필요한 호출 방지)
    if (!this.context || !this.masterGain || !this.masterEffectChain) {
      return;
    }
    
    let trackNodes = this.trackNodes.get(trackId) ?? null;
    if (!trackNodes) {
      // 트랙 노드가 없으면 생성 (기본 패닝으로)
      trackNodes = this.getOrCreateTrackNodes(trackId, volume, 0);
    }
    if (trackNodes) {
      trackNodes.gain.gain.value = clamp(volume, 0, 1);
    }
  }

  /**
   * 트랙 패닝을 즉시 업데이트합니다
   * @param trackId - 트랙 ID
   * @param pan - 패닝 값 (-1 ~ 1, -1 = 왼쪽, 0 = 중앙, 1 = 오른쪽)
   */
  updateTrackPan(trackId: string, pan: number): void {
    // context, masterGain, masterEffectChain이 준비되지 않았으면 무시
    // (getOrCreateTrackNodes에서도 확인하지만, 여기서도 확인하여 불필요한 호출 방지)
    if (!this.context || !this.masterGain || !this.masterEffectChain) {
      return;
    }
    
    let trackNodes = this.trackNodes.get(trackId) ?? null;
    if (!trackNodes) {
      // 트랙 노드가 없으면 생성 (기본 볼륨으로)
      trackNodes = this.getOrCreateTrackNodes(trackId, 1, pan);
    }
    if (trackNodes) {
      trackNodes.panner.pan.value = clamp(pan, -1, 1);
    }
  }

  /**
   * 마스터 볼륨을 즉시 업데이트합니다
   * @param volume - 볼륨 값 (0-1 정규화)
   */
  updateMasterVolume(volume: number): void {
    this.masterVolume = clamp(volume, 0, 1);
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  /**
   * 마스터 패닝을 즉시 업데이트합니다
   * @param pan - 패닝 값 (-1 ~ 1, -1 = 왼쪽, 0 = 중앙, 1 = 오른쪽)
   */
  updateMasterPan(_pan: number): void {
    // 마스터 패닝은 현재 마스터 레벨에서 적용되지 않음 (트랙 레벨 패닝만 사용)
    // 필요시 마스터 패너 노드를 추가하고 여기서 업데이트할 수 있음
    // const clampedPan = clamp(pan, -1, 1);
  }

  /**
   * 마스터 이펙터를 업데이트합니다
   * @param effects - 마스터 이펙터 배열
   */
  updateMasterEffects(effects: Effect[]): void {
    if (!this.masterEffectChain) {
      // masterEffectChain이 아직 생성되지 않았으면 ensureReady가 필요함
      // 하지만 updateMasterEffects는 보통 ensureReady 이후에 호출되므로 경고만 출력
      console.warn('[AudioEngine] Master effect chain not initialized. Call ensureReady() first.');
      return;
    }

    this.masterEffectChain.setTiming(this.bpm, this.timeSignature);
    this.masterEffectChain.updateEffects(effects);
  }

  scheduleNote(note: ScheduledNote): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    const keySample = this.getSampleForNote(note.midi, note.instrument);
    if (!keySample) {
      return;
    }

    const buffer = this.sampleBuffers.get(keySample.sampleUrl);
    if (!buffer) {
      void this.ensureSampleLoaded(keySample.sampleUrl);
      return;
    }

    // 드럼은 피치 변경 없이 재생, 피아노는 피치 변경
    const playbackRate = keySample.type === 'piano'
      ? Math.pow(2, (note.midi - keySample.root) / 12)
      : 1.0;
    const noteEndTime = note.startTime + note.duration;
    if (noteEndTime <= note.playbackTime) {
      return;
    }

    const scheduledStartTime = Math.max(note.startTime, note.playbackTime);
    const outputDuration = noteEndTime - scheduledStartTime;
    if (outputDuration <= 0) {
      return;
    }

    const skipTime = Math.max(0, scheduledStartTime - note.startTime);
    const bufferOffset = skipTime * playbackRate;
    if (bufferOffset >= buffer.duration) {
      return;
    }

    const baseAudioStartTime = note.audioOffset + scheduledStartTime;
    const velocityGain = clamp(note.velocity / 127, 0, 1);

    // Get or create track nodes (트랙 볼륨/패닝으로 초기화)
    const trackNodes = this.getOrCreateTrackNodes(note.trackId, note.trackVolume, note.trackPan);
    if (!trackNodes) {
      return;
    }

    // 트랙 볼륨/패닝이 변경된 경우 즉시 업데이트
    trackNodes.gain.gain.value = clamp(note.trackVolume, 0, 1);
    trackNodes.panner.pan.value = clamp(note.trackPan, -1, 1);

    // 같은 음계 감지 및 시간 오프셋 적용 (피아노만)
    let audioStartTime = baseAudioStartTime;
    if (keySample.type === 'piano' && this.pitchOffsetMaxMs > 0) {
      const pitchClass = note.midi % 12; // 0-11 (C=0, C#=1, ..., B=11)
      const activeNotes = this.activeNotesByPitchClass.get(pitchClass) || [];
      
      // 현재 시간 범위에 겹치는 노트 확인
      const overlappingNotes = activeNotes.filter(active => 
        baseAudioStartTime < active.endTime && 
        baseAudioStartTime + outputDuration > active.startTime
      );
      
      // 겹치는 노트가 있으면 오프셋 적용
      if (overlappingNotes.length > 0) {
        const offsetSeconds = (overlappingNotes.length * this.pitchOffsetMaxMs) / 1000;
        audioStartTime = baseAudioStartTime + offsetSeconds;
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = this.context.createGain();

    source.connect(gainNode);
    // Connect to track gain (트랙 레벨에서 패닝과 볼륨이 적용됨)
    gainNode.connect(trackNodes.gain);

    const attack = Math.min(0.005, outputDuration);
    const release = Math.min(0.02, Math.max(0, outputDuration - attack));
    gainNode.gain.setValueAtTime(0, audioStartTime);
    gainNode.gain.linearRampToValueAtTime(velocityGain, audioStartTime + attack);
    gainNode.gain.setValueAtTime(velocityGain, audioStartTime + Math.max(attack, outputDuration - release));
    gainNode.gain.linearRampToValueAtTime(0, audioStartTime + outputDuration);

    try {
      source.start(audioStartTime, bufferOffset);
      source.stop(audioStartTime + outputDuration);
      this.activeSources.add(source);
      
      // 활성 노트 추적 (피아노만, 같은 음계 감지용)
      if (keySample.type === 'piano' && this.pitchOffsetMaxMs > 0) {
        const pitchClass = note.midi % 12;
        if (!this.activeNotesByPitchClass.has(pitchClass)) {
          this.activeNotesByPitchClass.set(pitchClass, []);
        }
        const activeNotes = this.activeNotesByPitchClass.get(pitchClass)!;
        activeNotes.push({
          startTime: audioStartTime,
          endTime: audioStartTime + outputDuration,
          source: source,
        });
        
        // 노트 종료 시 추적 목록에서 제거
        source.onended = () => {
          this.activeSources.delete(source);
          const notes = this.activeNotesByPitchClass.get(pitchClass);
          if (notes) {
            const index = notes.findIndex(n => n.source === source);
            if (index !== -1) {
              notes.splice(index, 1);
            }
            if (notes.length === 0) {
              this.activeNotesByPitchClass.delete(pitchClass);
            }
          }
        };
      } else {
        source.onended = () => {
          this.activeSources.delete(source);
        };
      }
    } catch (error) {
      console.error('[AudioEngine] Error starting audio source', error);
    }
  }

  /**
   * Preview a note immediately (for piano key clicks)
   * @param midi - MIDI note number (0-127)
   * @param velocity - Velocity (0-127, default 100)
   */
  async previewNote(midi: number, velocity: number = 100, instrument: string = 'piano'): Promise<void> {
    await this.ensureReady();
    
    if (!this.context || !this.masterGain) {
      return;
    }

    // Stop any existing preview for this note
    this.stopPreview(midi);

    const keySample = this.getSampleForNote(midi, instrument);
    if (!keySample) {
      return;
    }

    const buffer = await this.ensureSampleLoaded(keySample.sampleUrl);
    if (!buffer) {
      return;
    }

    // 드럼은 피치 변경 없이 재생, 피아노는 피치 변경
    const playbackRate = keySample.type === 'piano'
      ? Math.pow(2, (midi - keySample.root) / 12)
      : 1.0;
    const velocityGain = clamp(velocity / 127, 0, 1);
    const gainValue = velocityGain * 0.7; // Preview volume slightly lower

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = this.context.createGain();
    const panner = this.context.createStereoPanner();
    panner.pan.value = 0; // Center pan for preview

    source.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    const attack = 0.005;
    const release = 0.1;
    const duration = Math.min(buffer.duration / playbackRate, 2.0); // Max 2 seconds for preview
    
    const now = this.context.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gainValue, now + attack);
    gainNode.gain.setValueAtTime(gainValue, now + Math.max(attack, duration - release));
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    try {
      source.start(now);
      source.stop(now + duration);
      this.previewSources.set(midi, source);
      this.previewGainNodes.set(midi, gainNode);
      source.onended = () => {
        this.previewSources.delete(midi);
        this.previewGainNodes.delete(midi);
      };
    } catch (error) {
      console.error('[AudioEngine] Error starting preview', error);
    }
  }

  /**
   * Stop preview for a specific note with fadeout
   * @param midi - MIDI note number
   * @param fadeOutMs - Fadeout duration in milliseconds (default: 10ms)
   */
  stopPreview(midi: number, fadeOutMs: number = 10): void {
    const source = this.previewSources.get(midi);
    const gainNode = this.previewGainNodes.get(midi);
    
    if (source && gainNode && this.context) {
      try {
        const now = this.context.currentTime;
        const fadeOutSeconds = fadeOutMs / 1000;
        
        // 현재 gain 값을 가져와서 페이드아웃
        const currentGain = gainNode.gain.value;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentGain, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fadeOutSeconds);
        
        // 페이드아웃 완료 후 소스 중지
        setTimeout(() => {
          try {
            source.stop();
          } catch {
            // Ignore stop errors for nodes that already ended.
          }
          this.previewSources.delete(midi);
          this.previewGainNodes.delete(midi);
        }, fadeOutMs);
      } catch {
        // 에러 발생 시 즉시 중지
        try {
          source.stop();
        } catch {
          // Ignore stop errors for nodes that already ended.
        }
        this.previewSources.delete(midi);
        this.previewGainNodes.delete(midi);
      }
    }
  }

  private getSampleForNote(midi: number, instrument: string): PianoKeySample | DrumSample | null {
    if (instrument === 'drum') {
      if (!this.drumSampleMap) {
        return null;
      }
      // 드럼은 GM 표준 범위 (35-81)만 재생
      if (midi < DRUM_KEY_MIN || midi > DRUM_KEY_MAX) {
        return null;
      }
      return this.drumSampleMap.get(midi) || null;
    } else {
      // 기본적으로 피아노
    if (!this.pianoKeyMap) {
      return null;
    }
    // Only the real piano range is playable. We still render 0-127 in UI,
    // but notes outside 21-108 should not produce sound.
    if (midi < PIANO_KEY_MIN || midi > PIANO_KEY_MAX) {
      return null;
    }
    return this.pianoKeyMap.get(midi) || null;
    }
  }

  private async ensureSampleLoaded(sampleUrl: string): Promise<AudioBuffer | null> {
    if (this.sampleBuffers.has(sampleUrl)) {
      return this.sampleBuffers.get(sampleUrl) ?? null;
    }
    const existing = this.pendingSampleBuffers.get(sampleUrl);
    if (existing) {
      return existing;
    }
    if (!this.context) {
      return null;
    }

    const loadPromise = (async () => {
      beginAudioLoading();
      try {
        const response = await fetch(sampleUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch sample: ${response.status} ${response.statusText}`);
        }
        const data = await response.arrayBuffer();
        const buffer = await this.context?.decodeAudioData(data);
        if (!buffer) {
          throw new Error('Failed to decode audio data');
        }
        this.sampleBuffers.set(sampleUrl, buffer);
        return buffer;
      } catch (error) {
        console.error('[AudioEngine] Failed to load sample', sampleUrl, error);
        return null;
      } finally {
        endAudioLoading();
        this.pendingSampleBuffers.delete(sampleUrl);
      }
    })();

    this.pendingSampleBuffers.set(sampleUrl, loadPromise);
    return loadPromise;
  }

  private async prefetchSampleUrls(sampleUrls: string[], batchSize: number = 6): Promise<void> {
    if (!this.context) {
      return;
    }
    for (let i = 0; i < sampleUrls.length; i += batchSize) {
      const batch = sampleUrls.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((url) => this.ensureSampleLoaded(url)));
      if (i + batchSize < sampleUrls.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  async prefetchSamplesForEvents(events: NoteEvent[]): Promise<void> {
    await this.ensureReady();
    if (!this.context) {
      return;
    }
    const uniqueSamples = new Set<string>();
    for (const event of events) {
      const keySample = this.getSampleForNote(event.note.note, event.track.instrument);
      if (keySample) {
        uniqueSamples.add(keySample.sampleUrl);
      }
    }
    await this.prefetchSampleUrls(Array.from(uniqueSamples));
  }

  async prefetchSamplesForProject(project: Project): Promise<void> {
    const events = buildPlaybackEvents(project);
    await this.prefetchSamplesForEvents(events);
  }

  private async loadDrumSampleMap(): Promise<Map<number, DrumSample>> {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : '';
    const drumMap = new Map<number, DrumSample>();

    for (const [midiNote, filename] of Object.entries(DRUM_SAMPLE_MAP)) {
      const noteNum = Number(midiNote);
      const encodedFilename = encodeURIComponent(filename);
      const sampleUrl = new URL(
        `${import.meta.env.BASE_URL ?? '/'}${DRUM_SAMPLES_BASE_PATH}${encodedFilename}`,
        baseUrl
      ).toString();
      
      drumMap.set(noteNum, {
        sampleUrl,
        midiNote: noteNum,
        type: 'drum' as const,
      });
    }

    return drumMap;
  }

  private async loadPianoKeyMap(): Promise<Map<number, PianoKeySample>> {
    const baseUrl = typeof window !== 'undefined' ? window.location.href : '';
    const sfzUrl = new URL(`${import.meta.env.BASE_URL ?? '/'}${PIANO_SFZ_PATH}`, baseUrl).toString();
    
    try {
      const response = await fetch(sfzUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch SFZ file: ${response.status} ${response.statusText}`);
      }
      const sfzText = await response.text();
      
      const regions = this.parseSfzRegions(sfzText);
      
      const sfzBase = new URL(sfzUrl, baseUrl);
      const keyMap = new Map<number, PianoKeySample>();

      for (const region of regions) {
        if (
          region.lokey === undefined ||
          region.hikey === undefined ||
          region.pitchKeycenter === undefined ||
          !region.sample
        ) {
          continue;
        }

        // IMPORTANT: SFZ sample filenames may contain '#' (e.g. F#1vH.flac, D#4vH.flac).
        // In URLs, '#' starts a fragment and is NOT sent to the server, causing 404s.
        // Encode each path segment so '#' becomes '%23' while preserving '/' separators.
        const encodedSamplePath = region.sample
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const sampleUrl = new URL(encodedSamplePath, sfzBase).toString();
        for (let key = region.lokey; key <= region.hikey; key += 1) {
          keyMap.set(key, {
            sampleUrl,
            root: region.pitchKeycenter,
            type: 'piano' as const,
          });
        }
      }

      for (let key = PIANO_KEY_MIN; key <= PIANO_KEY_MAX; key += 1) {
        if (!keyMap.has(key)) {
          const nearest = this.findNearestKeySample(keyMap, key);
          if (nearest) {
            keyMap.set(key, nearest);
          }
        }
      }

      return keyMap;
    } catch (error) {
      console.error('[AudioEngine] Failed to load piano key map', error);
      throw error;
    }
  }

  private findNearestKeySample(map: Map<number, PianoKeySample>, key: number): PianoKeySample | null {
    let closest: PianoKeySample | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const [existingKey, sample] of map.entries()) {
      const distance = Math.abs(existingKey - key);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = sample;
      }
    }

    return closest;
  }

  private parseSfzRegions(sfzText: string): SfzRegion[] {
    const regions: SfzRegion[] = [];
    let current: SfzRegion | null = null;

    const lines = sfzText.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) {
        continue;
      }

      if (line.startsWith('<') && line.endsWith('>')) {
        if (line === '<region>') {
          if (current) {
            regions.push(current);
          }
          current = {};
        }
        continue;
      }

      if (!current) {
        continue;
      }

      const [key, value] = line.split('=');
      if (!key || value === undefined) {
        continue;
      }

      const trimmedValue = value.trim();
      switch (key.trim()) {
        case 'lokey':
          current.lokey = Number(trimmedValue);
          break;
        case 'hikey':
          current.hikey = Number(trimmedValue);
          break;
        case 'pitch_keycenter':
          current.pitchKeycenter = Number(trimmedValue);
          break;
        case 'sample':
          current.sample = trimmedValue;
          break;
        default:
          break;
      }
    }

    if (current) {
      regions.push(current);
    }

    return regions;
  }

  /**
   * AudioEngine의 모든 리소스를 정리하고 해제합니다.
   * 
   * @returns Promise<void> - 비동기 리소스 해제 완료
   * 
   * @remarks
   * - 모든 활성 오디오 소스 중지
   * - 모든 오디오 노드 disconnect
   * - AudioContext 종료
   * - 상태 초기화
   * - 컴포넌트 언마운트 또는 페이지 전환 시 호출해야 합니다
   */
  async dispose(): Promise<void> {
    // 1. 모든 활성 오디오 소스 중지
    this.stopAll();

    // 2. 모든 트랙 노드 disconnect
    for (const trackNodes of this.trackNodes.values()) {
      try {
        trackNodes.gain.disconnect();
        trackNodes.panner.disconnect();
        trackNodes.leftAnalyser.disconnect();
        trackNodes.rightAnalyser.disconnect();
        trackNodes.splitter.disconnect();
        if (trackNodes.effectChain) {
          trackNodes.effectChain.dispose();
        }
      } catch (error) {
        // 이미 disconnect된 노드는 무시
        console.warn('[AudioEngine] Error disconnecting track nodes:', error);
      }
    }
    this.trackNodes.clear();

    // 3. 마스터 노드 disconnect
    if (this.masterEffectChain) {
      try {
        this.masterEffectChain.dispose();
      } catch (error) {
        console.warn('[AudioEngine] Error disposing master effect chain:', error);
      }
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch (error) {
        console.warn('[AudioEngine] Error disconnecting master gain:', error);
      }
    }
    if (this.masterSplitter) {
      try {
        this.masterSplitter.disconnect();
      } catch (error) {
        console.warn('[AudioEngine] Error disconnecting master splitter:', error);
      }
    }
    if (this.masterLeftAnalyser) {
      try {
        this.masterLeftAnalyser.disconnect();
      } catch (error) {
        console.warn('[AudioEngine] Error disconnecting master left analyser:', error);
      }
    }
    if (this.masterRightAnalyser) {
      try {
        this.masterRightAnalyser.disconnect();
      } catch (error) {
        console.warn('[AudioEngine] Error disconnecting master right analyser:', error);
      }
    }

    // 4. AudioContext 종료
    if (this.context) {
      try {
        // AudioContext 상태 확인 후 종료
        if (this.context.state !== 'closed') {
          await this.context.close();
        }
      } catch (error) {
        console.warn('[AudioEngine] Error closing AudioContext:', error);
      }
    }

    // 5. 상태 초기화
    this.context = null;
    this.masterGain = null;
    this.masterEffectChain = null;
    this.masterLeftAnalyser = null;
    this.masterRightAnalyser = null;
    this.masterSplitter = null;
    this.pianoKeyMap = null;
    this.drumSampleMap = null;
    this.sampleBuffers.clear();
    this.activeSources.clear();
    this.previewSources.clear();
    this.previewGainNodes.clear();
    this.readyPromise = null;
    this.appliedLatencyHintSeconds = null;
  }
}
