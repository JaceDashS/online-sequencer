import React, { useState, useEffect, useRef } from 'react';
import styles from './LevelMeter.module.css';
import { audioLevelStore } from '../../utils/audioLevelStore';
import { getPartyTimeFakeLevel, subscribePartyTime, isPartyTimeEnabled } from '../../utils/partyTime';

interface LevelMeterProps {
  trackId: string;
  channel?: 'left' | 'right'; // 'left' or 'right' channel
}

const LevelMeter: React.FC<LevelMeterProps> = ({ trackId, channel = 'left' }) => {
  const [level, setLevel] = useState<number>(-Infinity);
  const smoothedLevelRef = useRef<number>(-Infinity);
  const animationFrameRef = useRef<number | null>(null);
  const targetLevelRef = useRef<number>(-Infinity);
  const [isPartyTimeMode, setIsPartyTimeMode] = useState(false);

  useEffect(() => {
    // 파티타임 모드 구독
    const unsubscribePartyTime = subscribePartyTime((isActive) => {
      setIsPartyTimeMode(isActive);
    });
    
    // 초기 상태 확인
    setIsPartyTimeMode(isPartyTimeEnabled());

    const unsubscribe = audioLevelStore.subscribe(trackId, (audioLevel) => {
      // 파티타임 모드일 때는 실제 오디오 레벨 무시
      if (isPartyTimeEnabled()) {
        const fakeLevel = getPartyTimeFakeLevel(trackId, channel);
        if (fakeLevel) {
          const db = channel === 'left' ? fakeLevel.left : fakeLevel.right;
          targetLevelRef.current = db;
        } else {
          targetLevelRef.current = -Infinity;
        }
      } else if (audioLevel) {
        const db = channel === 'left' ? audioLevel.left : audioLevel.right;
        targetLevelRef.current = db;
      } else {
        targetLevelRef.current = -Infinity;
      }
    });

    // 스무딩 애니메이션 루프
    const smoothUpdate = () => {
      // 파티타임 모드일 때는 가짜 레벨 사용
      if (isPartyTimeEnabled()) {
        const fakeLevel = getPartyTimeFakeLevel(trackId, channel);
        if (fakeLevel) {
          const db = channel === 'left' ? fakeLevel.left : fakeLevel.right;
          targetLevelRef.current = db;
        } else {
          targetLevelRef.current = -Infinity;
        }
      }
      
      const target = targetLevelRef.current;
      const current = smoothedLevelRef.current;

      if (target === -Infinity || isNaN(target)) {
        // 레벨이 없으면 천천히 감소
        if (current > -Infinity) {
          const newLevel = current - 3; // 3dB씩 빠르게 감소
          smoothedLevelRef.current = Math.max(newLevel, -Infinity);
          setLevel(smoothedLevelRef.current);
        } else {
          smoothedLevelRef.current = -Infinity;
          setLevel(-Infinity);
        }
      } else {
        // 파티타임 모드일 때는 즉시 반영 (애니메이션 없이)
        if (isPartyTimeEnabled()) {
          smoothedLevelRef.current = target;
          setLevel(target);
        } else {
          // 레벨이 올라갈 때는 빠르게, 내려갈 때는 천천히
          if (target > current) {
            // Attack: 빠르게 올라감 (즉시 반영)
            smoothedLevelRef.current = target;
            setLevel(target);
          } else {
            // Release: 천천히 내려감 (exponential decay)
            const decayRate = 0.15; // 15% 감소 per frame (약 60fps 기준)
            const newLevel = target + (current - target) * (1 - decayRate);
            smoothedLevelRef.current = newLevel;
            setLevel(newLevel);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(smoothUpdate);
    };

    animationFrameRef.current = requestAnimationFrame(smoothUpdate);

    return () => {
      unsubscribe();
      unsubscribePartyTime();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [trackId, channel, isPartyTimeMode]);

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
