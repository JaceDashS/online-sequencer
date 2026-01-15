import type { Effect } from '../../types/project';

/**
 * Delay 이펙터 클래스
 * 박자 기반 딜레이를 Web Audio API로 구현
 */
export class DelayEffect {
  private delayNode: DelayNode;
  private feedbackGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private inputGain: GainNode;
  private outputGain: GainNode;
  private enabled: boolean = true;
  private bpm: number = 120;
  private timeSignature: [number, number] = [4, 4];

  constructor(context: AudioContext) {
    // Input gain
    this.inputGain = context.createGain();
    this.inputGain.gain.value = 1;

    // Delay node (최대 1초 딜레이 지원)
    this.delayNode = context.createDelay(1);
    this.delayNode.delayTime.value = 0;

    // Feedback gain
    this.feedbackGain = context.createGain();
    this.feedbackGain.gain.value = 0;

    // Dry/Wet mix gains
    this.dryGain = context.createGain();
    this.dryGain.gain.value = 1;

    this.wetGain = context.createGain();
    this.wetGain.gain.value = 0;

    // Output gain
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;

    // Connect: input -> [dry -> output, delay -> feedback -> delay -> wet -> output]
    // Dry path: input -> dry -> output
    this.inputGain.connect(this.dryGain);
    this.dryGain.connect(this.outputGain);

    // Wet path: input -> delay -> wet -> output
    // Feedback: delay -> feedback -> delay (feedback loop)
    this.inputGain.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode); // Feedback loop
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.outputGain);
  }

  /**
   * BPM과 Time Signature를 설정합니다 (박자 기반 딜레이 계산용)
   */
  setTiming(bpm: number, timeSignature: [number, number]): void {
    this.bpm = bpm;
    this.timeSignature = timeSignature;
    // 현재 딜레이가 박자 기반이면 다시 계산
    this.updateDelayTime();
  }

  /**
   * 박자 분할을 기반으로 딜레이 타임을 초 단위로 계산합니다
   */
  private calculateDelayTimeFromDivision(division: number): number {
    const beatUnit = this.timeSignature[1];
    
    // beatUnit에 따라 실제 음표 길이 계산 (4=4분음표, 8=8분음표 기준)
    const noteValueRatio = 4 / beatUnit; // 4/4면 1, 6/8이면 0.5
    const secondsPerBeat = (60 / this.bpm) * noteValueRatio;
    
    // division 박자만큼의 딜레이 타임 계산
    const delayTimeInSeconds = division * secondsPerBeat;
    
    // DelayNode의 최대 딜레이 시간(1초)을 초과하면 1초로 제한
    // 더 긴 딜레이가 필요한 경우 여러 DelayNode를 연결하거나 다른 방법 사용 필요
    return Math.min(delayTimeInSeconds, 1.0);
  }

  /**
   * 딜레이 타임을 업데이트합니다 (박자 기반 또는 ms 기반)
   */
  private updateDelayTime(): void {
    // 박자 기반 딜레이가 우선
    const division = this.currentDivision;
    if (division !== null) {
      const delayTimeSeconds = this.calculateDelayTimeFromDivision(division);
      this.delayNode.delayTime.value = delayTimeSeconds;
    } else {
      // 레거시 ms 기반 딜레이 (1000ms = 1초)
      const delayTimeMs = this.currentDelayTimeMs ?? 250;
      this.delayNode.delayTime.value = Math.min(delayTimeMs / 1000, 1.0);
    }
  }

  private currentDivision: number | null = null;
  private currentDelayTimeMs: number | null = null;
  private currentFeedback: number = 0;

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
    if (effect.type !== 'delay') {
      return;
    }

    this.enabled = effect.enabled;

    // 박자 기반 딜레이 (우선)
    const division = effect.params.delayDivision;
    if (division !== undefined && division !== null) {
      this.currentDivision = division;
      this.currentDelayTimeMs = null;
    } else {
      // 레거시 ms 기반 딜레이
      this.currentDivision = null;
      this.currentDelayTimeMs = effect.params.delayTime ?? 250;
    }

    // Feedback (0 ~ 100% -> 0.0 ~ 1.0)
    this.currentFeedback = (effect.params.feedback ?? 30) / 100;
    
    // Mix (0 ~ 100% -> dry/wet 비율)
    const mix = (effect.params.mix ?? 30) / 100;

    // 딜레이 타임 업데이트
    this.updateDelayTime();

    // 이펙터가 활성화되어 있으면 설정된 값 사용
    if (this.enabled) {
      this.feedbackGain.gain.value = this.currentFeedback;
      this.dryGain.gain.value = 1 - mix;
      this.wetGain.gain.value = mix;
    } else {
      // 이펙터가 비활성화되면 dry만 출력 (bypass)
      this.feedbackGain.gain.value = 0;
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
      this.delayNode.disconnect();
      this.feedbackGain.disconnect();
      this.dryGain.disconnect();
      this.wetGain.disconnect();
      this.outputGain.disconnect();
    } catch (error) {
      // 이미 disconnect된 경우 무시
      console.warn('[DelayEffect] Error disposing:', error);
    }
  }
}
