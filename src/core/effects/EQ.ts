import type { Effect } from '../../types/project';

/**
 * EQ 이펙터 클래스
 * 3밴드 EQ (Low, Mid, High)를 Web Audio API로 구현
 */
export class EQEffect {
  private lowFilter: BiquadFilterNode;
  private midFilter: BiquadFilterNode;
  private highFilter: BiquadFilterNode;
  private inputGain: GainNode;
  private outputGain: GainNode;
  private enabled: boolean = true;

  constructor(context: AudioContext) {

    // Input gain
    this.inputGain = context.createGain();
    this.inputGain.gain.value = 1;

    // Low shelf filter (200Hz 이하, 더 명확한 효과를 위해 주파수 상향)
    this.lowFilter = context.createBiquadFilter();
    this.lowFilter.type = 'lowshelf';
    this.lowFilter.frequency.value = 200;
    this.lowFilter.gain.value = 0;
    this.lowFilter.Q.value = 5; // 기본값: 범위 중간값 (0.1~10)

    // Peaking filter for mid (1kHz 근처)
    this.midFilter = context.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.gain.value = 0;
    this.midFilter.Q.value = 5; // 기본값: 범위 중간값 (0.1~10)

    // High shelf filter (8kHz 이상)
    this.highFilter = context.createBiquadFilter();
    this.highFilter.type = 'highshelf';
    this.highFilter.frequency.value = 8000;
    this.highFilter.gain.value = 0;
    this.highFilter.Q.value = 5; // 기본값: 범위 중간값 (0.1~10)

    // Output gain
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;

    // Connect: input -> low -> mid -> high -> output
    this.inputGain.connect(this.lowFilter);
    this.lowFilter.connect(this.midFilter);
    this.midFilter.connect(this.highFilter);
    this.highFilter.connect(this.outputGain);
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
   * 이펙터 파라미터를 업데이트합니다
   */
  updateParams(effect: Effect): void {
    if (effect.type !== 'eq') {
      return;
    }

    this.enabled = effect.enabled;

    // BiquadFilterNode의 gain은 dB 단위입니다
    // lowshelf, highshelf, peaking 타입의 경우 gain은 dB로 직접 사용 가능
    const lowGain = effect.params.lowGain ?? 0;
    const midGain = effect.params.midGain ?? 0;
    const highGain = effect.params.highGain ?? 0;

    // 통합 Q 값 추출 (기본값: 5, 범위 중간값)
    const q = effect.params.q ?? 5;

    // 이펙터가 활성화되어 있으면 설정된 gain 값과 Q 값 사용
    // BiquadFilterNode의 gain은 dB 단위입니다 (lowshelf, highshelf, peaking 타입)
    if (this.enabled) {
      this.lowFilter.gain.value = lowGain;
      this.midFilter.gain.value = midGain;
      this.highFilter.gain.value = highGain;
      
      // 통합 Q 값을 모든 필터에 적용
      this.lowFilter.Q.value = q;
      this.midFilter.Q.value = q;
      this.highFilter.Q.value = q;
    } else {
      // 이펙터가 비활성화되면 모든 gain을 0으로 설정 (bypass)
      this.lowFilter.gain.value = 0;
      this.midFilter.gain.value = 0;
      this.highFilter.gain.value = 0;
      // Q 값은 유지 (비활성화 시에도 Q 값은 변경하지 않음)
    }
  }

  /**
   * 이펙터를 해제합니다
   */
  dispose(): void {
    try {
      this.inputGain.disconnect();
      this.lowFilter.disconnect();
      this.midFilter.disconnect();
      this.highFilter.disconnect();
      this.outputGain.disconnect();
    } catch (error) {
      // 이미 disconnect된 경우 무시
      console.warn('[EQEffect] Error disposing:', error);
    }
  }
}
