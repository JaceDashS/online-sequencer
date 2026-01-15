import type { Effect } from '../../types/project';

/**
 * Reverb 이펙터 클래스
 * 알고리즘 리버브를 Web Audio API로 구현
 * Schroeder 리버브 구조 사용: 4개의 병렬 Delay + Low-pass Filter
 */
export class ReverbEffect {
  // 기본 딜레이 타임 (roomSize 50% 기준)
  private static readonly BASE_DELAYS = [0.030, 0.037, 0.041, 0.043];
  
  private inputGain: GainNode;
  private outputGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  
  // 4개의 병렬 딜레이 라인 (리버브 타입별로 다른 딜레이 타임)
  private delay1: DelayNode;
  private delay2: DelayNode;
  private delay3: DelayNode;
  private delay4: DelayNode;
  
  // 각 딜레이 라인 뒤의 감쇠 게인 (Dampening)
  private decay1: GainNode;
  private decay2: GainNode;
  private decay3: GainNode;
  private decay4: GainNode;
  
  // 각 딜레이 라인 뒤의 Low-pass Filter (Dampening 효과)
  private filter1: BiquadFilterNode;
  private filter2: BiquadFilterNode;
  private filter3: BiquadFilterNode;
  private filter4: BiquadFilterNode;
  
  // 결합부 게인
  private combinerGain: GainNode;
  
  private enabled: boolean = true;

  constructor(context: AudioContext) {
    // Input gain
    this.inputGain = context.createGain();
    this.inputGain.gain.value = 1;

    // Dry/Wet mix gains
    this.dryGain = context.createGain();
    this.dryGain.gain.value = 1;

    this.wetGain = context.createGain();
    this.wetGain.gain.value = 0;

    // Output gain
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;

    // 4개의 딜레이 노드 생성 (리버브 타입별 딜레이 타임)
    // 서로 다른 프라임 번호를 사용하여 자연스러운 리버브 효과 생성
    // 최대 딜레이 타임을 고려하여 충분한 버퍼 설정 (3.0x 스케일 * 0.043s ≈ 0.13s, 안전을 위해 2초)
    this.delay1 = context.createDelay(2);
    this.delay1.delayTime.value = ReverbEffect.BASE_DELAYS[0]; // 30ms
    
    this.delay2 = context.createDelay(2);
    this.delay2.delayTime.value = ReverbEffect.BASE_DELAYS[1]; // 37ms
    
    this.delay3 = context.createDelay(2);
    this.delay3.delayTime.value = ReverbEffect.BASE_DELAYS[2]; // 41ms
    
    this.delay4 = context.createDelay(2);
    this.delay4.delayTime.value = ReverbEffect.BASE_DELAYS[3]; // 43ms

    // 각 딜레이 라인 뒤의 감쇠 게인
    this.decay1 = context.createGain();
    this.decay1.gain.value = 0.5;
    
    this.decay2 = context.createGain();
    this.decay2.gain.value = 0.5;
    
    this.decay3 = context.createGain();
    this.decay3.gain.value = 0.5;
    
    this.decay4 = context.createGain();
    this.decay4.gain.value = 0.5;

    // 각 딜레이 라인 뒤의 Low-pass Filter (Dampening 효과)
    this.filter1 = context.createBiquadFilter();
    this.filter1.type = 'lowpass';
    this.filter1.frequency.value = 3000;
    this.filter1.Q.value = 1;
    
    this.filter2 = context.createBiquadFilter();
    this.filter2.type = 'lowpass';
    this.filter2.frequency.value = 3000;
    this.filter2.Q.value = 1;
    
    this.filter3 = context.createBiquadFilter();
    this.filter3.type = 'lowpass';
    this.filter3.frequency.value = 3000;
    this.filter3.Q.value = 1;
    
    this.filter4 = context.createBiquadFilter();
    this.filter4.type = 'lowpass';
    this.filter4.frequency.value = 3000;
    this.filter4.Q.value = 1;

    // 결합부 게인 (4개의 딜레이 라인 결합)
    this.combinerGain = context.createGain();
    this.combinerGain.gain.value = 0.25; // 4개 라인 평균

    // 연결: input -> [dry -> output, delay chains -> combiner -> wet -> output]
    // Dry path: input -> dry -> output
    this.inputGain.connect(this.dryGain);
    this.dryGain.connect(this.outputGain);

    // Wet path: 4개의 병렬 딜레이 라인
    // input -> delay1 -> filter1 -> decay1 -> combiner -> wet -> output
    this.inputGain.connect(this.delay1);
    this.delay1.connect(this.filter1);
    this.filter1.connect(this.decay1);
    this.decay1.connect(this.combinerGain);
    
    // input -> delay2 -> filter2 -> decay2 -> combiner -> wet -> output
    this.inputGain.connect(this.delay2);
    this.delay2.connect(this.filter2);
    this.filter2.connect(this.decay2);
    this.decay2.connect(this.combinerGain);
    
    // input -> delay3 -> filter3 -> decay3 -> combiner -> wet -> output
    this.inputGain.connect(this.delay3);
    this.delay3.connect(this.filter3);
    this.filter3.connect(this.decay3);
    this.decay3.connect(this.combinerGain);
    
    // input -> delay4 -> filter4 -> decay4 -> combiner -> wet -> output
    this.inputGain.connect(this.delay4);
    this.delay4.connect(this.filter4);
    this.filter4.connect(this.decay4);
    this.decay4.connect(this.combinerGain);
    
    // combiner -> wet -> output
    this.combinerGain.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
  }

  /**
   * 이펙터의 입력 노드를 반환합니다
   */
  getInput(): AudioNode {
    return this.inputGain;
  }

  /**
   * 이펙터의 출력 노드를 반환합니다
   */
  getOutput(): AudioNode {
    return this.outputGain;
  }

  /**
   * 룸 크기를 기반으로 딜레이 타임을 조정합니다
   * @param roomSize 0 ~ 100% (0 = 작은 방, 100 = 큰 홀)
   */
  private updateRoomSize(roomSize: number): void {
    // roomSize를 딜레이 타임 스케일 팩터에 매핑 (0.3x ~ 3.0x)
    const minScale = 0.3; // 작은 방
    const maxScale = 3.0; // 큰 홀
    const scale = minScale + (roomSize / 100) * (maxScale - minScale);
    
    // 각 딜레이 라인의 기본 비율 유지하면서 스케일링
    this.delay1.delayTime.value = ReverbEffect.BASE_DELAYS[0] * scale;
    this.delay2.delayTime.value = ReverbEffect.BASE_DELAYS[1] * scale;
    this.delay3.delayTime.value = ReverbEffect.BASE_DELAYS[2] * scale;
    this.delay4.delayTime.value = ReverbEffect.BASE_DELAYS[3] * scale;
  }

  /**
   * 댐핑을 기반으로 Low-pass Filter 주파수와 감쇠를 조정합니다
   * @param dampening 0 ~ 100% (0 = 덜 댐핑, 100 = 많이 댐핑)
   */
  private updateDampening(dampening: number): void {
    // dampening을 필터 주파수에 매핑 (8000Hz ~ 1000Hz)
    const maxFreq = 8000; // 덜 댐핑 = 높은 주파수 통과
    const minFreq = 1000; // 많이 댐핑 = 낮은 주파수만 통과
    const frequency = maxFreq - (dampening / 100) * (maxFreq - minFreq);
    
    // 모든 필터에 적용
    this.filter1.frequency.value = frequency;
    this.filter2.frequency.value = frequency;
    this.filter3.frequency.value = frequency;
    this.filter4.frequency.value = frequency;
    
    // 감쇠 게인도 조정 (dampening이 높을수록 감쇠 증가)
    // 0% = 0.7, 100% = 0.3
    const maxDecay = 0.7;
    const minDecay = 0.3;
    const decayGain = maxDecay - (dampening / 100) * (maxDecay - minDecay);
    
    this.decay1.gain.value = decayGain;
    this.decay2.gain.value = decayGain;
    this.decay3.gain.value = decayGain;
    this.decay4.gain.value = decayGain;
  }

  /**
   * 이펙터 파라미터를 업데이트합니다
   */
  updateParams(effect: Effect): void {
    if (effect.type !== 'reverb') {
      return;
    }

    this.enabled = effect.enabled;

    // Room Size (0 ~ 100%)
    const roomSize = effect.params.roomSize ?? 50;
    this.updateRoomSize(roomSize);

    // Dampening (0 ~ 100%)
    const dampening = effect.params.dampening ?? 30;
    this.updateDampening(dampening);

    // Wet Level (0 ~ 100% -> dry/wet 비율)
    const wetLevel = (effect.params.wetLevel ?? 30) / 100;

    // 이펙터가 활성화되어 있으면 설정된 값 사용
    if (this.enabled) {
      this.dryGain.gain.value = 1 - wetLevel;
      this.wetGain.gain.value = wetLevel;
    } else {
      // 이펙터가 비활성화되면 dry만 출력 (bypass)
      this.dryGain.gain.value = 1;
      this.wetGain.gain.value = 0;
    }
  }

  /**
   * 이펙터를 해제합니다
   */
  dispose(): void {
    try {
      this.inputGain.disconnect();
      this.dryGain.disconnect();
      this.wetGain.disconnect();
      this.delay1.disconnect();
      this.delay2.disconnect();
      this.delay3.disconnect();
      this.delay4.disconnect();
      this.decay1.disconnect();
      this.decay2.disconnect();
      this.decay3.disconnect();
      this.decay4.disconnect();
      this.filter1.disconnect();
      this.filter2.disconnect();
      this.filter3.disconnect();
      this.filter4.disconnect();
      this.combinerGain.disconnect();
      this.outputGain.disconnect();
    } catch (error) {
      // 이미 disconnect된 경우 무시
      console.warn('[ReverbEffect] Error disposing:', error);
    }
  }
}
