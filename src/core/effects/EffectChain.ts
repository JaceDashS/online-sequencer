import type { Effect } from '../../types/project';
import { EQEffect } from './EQ';
import { DelayEffect } from './Delay';
import { ReverbEffect } from './Reverb';

/**
 * 이펙터 체인 클래스
 * 여러 이펙터를 순차적으로 연결하여 처리합니다
 */
export class EffectChain {
  private context: AudioContext;
  private effects: Map<string, EQEffect | DelayEffect | ReverbEffect> = new Map();
  private inputGain: GainNode;
  private outputGain: GainNode;
  private effectNodes: Array<{ effect: EQEffect | DelayEffect | ReverbEffect; id: string }> = [];
  private bpm: number = 120;
  private timeSignature: [number, number] = [4, 4];

  constructor(context: AudioContext) {
    this.context = context;
    this.inputGain = context.createGain();
    this.inputGain.gain.value = 1;
    this.outputGain = context.createGain();
    this.outputGain.gain.value = 1;

    // 초기 연결: input -> output (이펙터가 없을 때)
    this.inputGain.connect(this.outputGain);
  }

  /**
   * 이펙터 체인의 입력 노드를 반환합니다
   */
  getInput(): AudioNode {
    return this.inputGain;
  }

  /**
   * 이펙터 체인의 출력 노드를 반환합니다
   */
  getOutput(): AudioNode {
    return this.outputGain;
  }

  /**
   * BPM과 Time Signature를 설정합니다 (박자 기반 딜레이용)
   */
  setTiming(bpm: number, timeSignature: [number, number]): void {
    this.bpm = bpm;
    this.timeSignature = timeSignature;
    
    // 모든 Delay 이펙터에 타이밍 정보 업데이트
    this.effectNodes.forEach(({ effect }) => {
      if (effect instanceof DelayEffect) {
        effect.setTiming(bpm, timeSignature);
      }
    });
  }

  /**
   * 이펙터 체인을 업데이트합니다
   * @param effects - 적용할 이펙터 배열
   */
  updateEffects(effects: Effect[]): void {
    // 활성화된 이펙터만 필터링
    const activeEffects = effects.filter(e => e.enabled);

    // 기존 이펙터와 새 이펙터 비교하여 재사용 가능한지 확인
    const needsRebuild = 
      this.effectNodes.length !== activeEffects.length ||
      this.effectNodes.some((node, i) => {
        if (i >= activeEffects.length) return true;
        const effectConfig = activeEffects[i];
        const expectedId = `${effectConfig.type}-${i}`;
        return node.id !== expectedId || 
               (effectConfig.type === 'eq' && !(node.effect instanceof EQEffect)) ||
               (effectConfig.type === 'delay' && !(node.effect instanceof DelayEffect)) ||
               (effectConfig.type === 'reverb' && !(node.effect instanceof ReverbEffect));
      });

    // 이펙터 체인 재구성이 필요한 경우
    if (needsRebuild) {
      // 기존 연결 해제
      try {
        this.inputGain.disconnect();
      } catch (error) {
        // 이미 disconnect된 경우 무시
      }
      
      // 기존 이펙터 해제
      this.effectNodes.forEach(({ effect }) => {
        effect.dispose();
      });
      this.effectNodes = [];
      this.effects.clear();

      if (activeEffects.length === 0) {
        // 이펙터가 없으면 input -> output 직접 연결
        this.inputGain.connect(this.outputGain);
        return;
      }

      // 이펙터 체인 구성
      let currentNode: AudioNode = this.inputGain;

      for (let i = 0; i < activeEffects.length; i++) {
        const effectConfig = activeEffects[i];
        const effectId = `${effectConfig.type}-${i}`;

        if (effectConfig.type === 'eq') {
          // 새 EQ 이펙터 생성
          const eqEffect = new EQEffect(this.context);
          
          // 파라미터 업데이트
          eqEffect.updateParams(effectConfig);

          // 체인에 연결
          currentNode.connect(eqEffect.getInput());
          currentNode = eqEffect.getOutput();

          this.effectNodes.push({ effect: eqEffect, id: effectId });
          this.effects.set(effectId, eqEffect);
        } else if (effectConfig.type === 'delay') {
          // 새 Delay 이펙터 생성
          const delayEffect = new DelayEffect(this.context);
          
          // 타이밍 정보 설정 (박자 기반 딜레이용)
          delayEffect.setTiming(this.bpm, this.timeSignature);
          
          // 파라미터 업데이트
          delayEffect.updateParams(effectConfig);

          // 체인에 연결
          currentNode.connect(delayEffect.getInput());
          currentNode = delayEffect.getOutput();

          this.effectNodes.push({ effect: delayEffect, id: effectId });
          this.effects.set(effectId, delayEffect);
        } else if (effectConfig.type === 'reverb') {
          // 새 Reverb 이펙터 생성
          const reverbEffect = new ReverbEffect(this.context);
          
          // 파라미터 업데이트
          reverbEffect.updateParams(effectConfig);

          // 체인에 연결
          currentNode.connect(reverbEffect.getInput());
          currentNode = reverbEffect.getOutput();

          this.effectNodes.push({ effect: reverbEffect, id: effectId });
          this.effects.set(effectId, reverbEffect);
        }
      }

      // 마지막 노드를 output에 연결
      currentNode.connect(this.outputGain);
    } else {
      // 이펙터 체인 구조는 동일하므로 파라미터만 업데이트
      for (let i = 0; i < activeEffects.length; i++) {
        const effectConfig = activeEffects[i];
        const node = this.effectNodes[i];
        
        if (node && node.effect) {
          if (effectConfig.type === 'eq' && node.effect instanceof EQEffect) {
            // 기존 EQ 이펙터의 파라미터만 업데이트
            node.effect.updateParams(effectConfig);
          } else if (effectConfig.type === 'delay' && node.effect instanceof DelayEffect) {
            // 기존 Delay 이펙터의 파라미터만 업데이트
            // 타이밍 정보도 업데이트 (BPM이나 time signature가 변경되었을 수 있음)
            node.effect.setTiming(this.bpm, this.timeSignature);
            node.effect.updateParams(effectConfig);
          } else if (effectConfig.type === 'reverb' && node.effect instanceof ReverbEffect) {
            // 기존 Reverb 이펙터의 파라미터만 업데이트
            node.effect.updateParams(effectConfig);
          }
        }
      }
    }
  }

  /**
   * 이펙터 체인을 해제합니다
   */
  dispose(): void {
    try {
      this.inputGain.disconnect();
      this.outputGain.disconnect();
      this.effectNodes.forEach(({ effect }) => {
        effect.dispose();
      });
      this.effects.clear();
      this.effectNodes = [];
    } catch (error) {
      console.warn('[EffectChain] Error disposing:', error);
    }
  }
}
