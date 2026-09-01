import React, { useState, useEffect, useRef } from 'react';
import styles from './LevelMeter.module.css';
import { audioLevelStore } from '../../utils/audioLevelStore';
import { getPartyTimeFakeLevel, subscribePartyTime, isPartyTimeEnabled } from '../../utils/partyTime';
import { useUIStateOnly } from '../../store/uiStore';

interface LevelMeterProps {
  trackId: string;
  channel?: 'left' | 'right'; // 'left' or 'right' channel
}

const LevelMeter: React.FC<LevelMeterProps> = ({ trackId, channel = 'left' }) => {
  const ui = useUIStateOnly();
  const [level, setLevel] = useState<number>(-Infinity);
  const smoothedLevelRef = useRef<number>(-Infinity);
  const lastLevelUpdateRef = useRef<number>(0);
  const [isPartyTimeMode, setIsPartyTimeMode] = useState(() => isPartyTimeEnabled());

  useEffect(() => {
    if (!ui.levelMeterEnabled) {
      return;
    }

    const unsubscribePartyTime = subscribePartyTime((isActive) => {
      setIsPartyTimeMode(isActive);
    });

    const updateSmoothedLevel = (target: number) => {
      const now = performance.now();
      const elapsedMs = lastLevelUpdateRef.current > 0
        ? now - lastLevelUpdateRef.current
        : 1000 / 30;
      lastLevelUpdateRef.current = now;
      const current = smoothedLevelRef.current;
      let nextLevel = target;

      if (!Number.isFinite(target)) {
        nextLevel = Number.isFinite(current)
          ? current - Math.max(3, elapsedMs * 0.09)
          : -Infinity;
        if (nextLevel <= -60) {
          nextLevel = -Infinity;
        }
      } else if (Number.isFinite(current) && target < current) {
        const frameCount = Math.max(1, elapsedMs / (1000 / 60));
        const decay = Math.pow(0.85, frameCount);
        nextLevel = target + (current - target) * decay;
      }

      smoothedLevelRef.current = nextLevel;
      setLevel(nextLevel);
    };

    const unsubscribe = audioLevelStore.subscribe(trackId, (audioLevel) => {
      if (isPartyTimeEnabled()) {
        const fakeLevel = getPartyTimeFakeLevel(trackId, channel);
        updateSmoothedLevel(
          fakeLevel ? (channel === 'left' ? fakeLevel.left : fakeLevel.right) : -Infinity
        );
      } else if (audioLevel) {
        updateSmoothedLevel(channel === 'left' ? audioLevel.left : audioLevel.right);
      } else {
        updateSmoothedLevel(-Infinity);
      }
    });

    return () => {
      unsubscribe();
      unsubscribePartyTime();
      lastLevelUpdateRef.current = 0;
    };
  }, [trackId, channel, isPartyTimeMode, ui.levelMeterEnabled]);

  if (!ui.levelMeterEnabled) {
    return null;
  }

  // 각 바의 dB 임계값을 정의 (아래에서 위로, 지수적 분할)
  // 데시벨 로직에 맞게 지수적으로 표시 (각 바는 특정 dB 레벨을 나타냄)
  // dB = 20 * log10(amplitude) 이므로, amplitude는 지수적으로 증가
  // 따라서 각 바는 지수적으로 분할된 dB 임계값을 가짐
  const getBarDbThreshold = (barIndex: number, totalBars: number): number => {
    const minDb = -60;
    const maxDb = 0;
    
    // barIndex는 0 (아래) ~ totalBars-1 (위)
    // 지수적 매핑: dB 범위를 로그 스케일로 분할
    // normalizedIndex는 0 (아래, -60dB) ~ 1 (위, 0dB)
    const normalizedIndex = barIndex / (totalBars - 1);
    
    // 지수적 분할: amplitude 비율을 사용하여 dB를 계산
    // amplitude = 10^(dB/20) 이므로, dB 범위를 amplitude 비율로 변환
    const minAmplitude = Math.pow(10, minDb / 20); // -60dB의 amplitude 비율
    const maxAmplitude = Math.pow(10, maxDb / 20); // 0dB의 amplitude 비율 (1.0)
    
    // 선형 보간을 amplitude 비율 공간에서 수행
    const amplitudeRatio = minAmplitude + normalizedIndex * (maxAmplitude - minAmplitude);
    
    // amplitude 비율을 다시 dB로 변환
    const thresholdDb = 20 * Math.log10(Math.max(amplitudeRatio, 0.000001)); // 0으로 나누기 방지
    return thresholdDb;
  };

  // 각 바가 활성화되어야 하는지 확인 (현재 레벨이 해당 바의 임계값 이상인지)
  const isBarActive = (barIndex: number, totalBars: number, currentDb: number): boolean => {
    if (currentDb === -Infinity || isNaN(currentDb)) {
      return false;
    }
    const thresholdDb = getBarDbThreshold(barIndex, totalBars);
    return currentDb >= thresholdDb;
  };

  // 각 바의 색상을 결정 (dB 임계값 기반)
  const getBarColor = (barIndex: number, totalBars: number): string => {
    const thresholdDb = getBarDbThreshold(barIndex, totalBars);
    
    // 클리핑 수준(-1dB ~ 0dB)에서만 빨간색
    if (thresholdDb >= -1) return '#ff4444'; // 빨강 (클리핑 직전)
    // 경고 구간
    if (thresholdDb >= -3) return '#ff8844'; // 주황-빨강
    if (thresholdDb >= -6) return '#ffaa44'; // 주황 (경고)
    if (thresholdDb >= -12) return '#ffff44'; // 노랑 (주의)
    // 안전 구간
    return '#44ff44'; // 초록 (안전)
  };

  const totalBars = 20;

  return (
    <div className={styles.levelMeter}>
      <div className={styles.meterBars}>
        {Array.from({ length: totalBars }, (_, i) => {
          const barIndex = totalBars - 1 - i; // 아래에서 위로 (0 = 맨 아래, 19 = 맨 위)
          const isActive = isBarActive(barIndex, totalBars, level);
          const barColor = isActive ? getBarColor(barIndex, totalBars) : '#333333';
          
          return (
            <div
              key={i}
              className={`${styles.meterBar} ${isActive ? styles.meterBarActive : ''}`}
              style={{
                height: `${100 / totalBars}%`,
                backgroundColor: barColor,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default LevelMeter;
