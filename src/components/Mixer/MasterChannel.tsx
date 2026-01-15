import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import styles from './MasterChannel.module.css';
import LevelMeter from './LevelMeter';
import { getProject, subscribeToProjectChanges, updateMasterVolume, updateMasterPan } from '../../store/projectStore';
import { AUDIO_CONSTANTS } from '../../constants/ui';

interface MasterChannelProps {
  isSelected?: boolean;
  onClick?: () => void;
}

const MasterChannel: React.FC<MasterChannelProps> = ({ isSelected, onClick }) => {
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const [sliderWidth, setSliderWidth] = useState(200);
  const [updateCounter, setUpdateCounter] = useState(0);

  // 마스터 채널을 위한 가상 트랙 ID
  const masterTrackId = 'master';
  
  // 프로젝트 변경 감지 (pub-sub 패턴)
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      if (event.type === 'master') {
        setUpdateCounter(prev => prev + 1);
      }
    });
    return unsubscribe;
  }, []);

  // 최신 프로젝트 데이터 가져오기 (메모이제이션)
  const project = useMemo(() => getProject(), [updateCounter]);
  
  // 마스터 볼륨/패닝 기본값
  const masterVolume = project.masterVolume ?? AUDIO_CONSTANTS.VOLUME_DEFAULT / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
  const masterPan = project.masterPan ?? AUDIO_CONSTANTS.PAN_DEFAULT / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;

  // 컨테이너 높이에 맞춰 슬라이더 너비 조정
  useEffect(() => {
    const updateSliderWidth = () => {
      if (sliderContainerRef.current) {
        const height = sliderContainerRef.current.clientHeight;
        setSliderWidth(Math.max(0, height - 20));
      }
    };

    updateSliderWidth();
    const resizeObserver = new ResizeObserver(updateSliderWidth);
    if (sliderContainerRef.current) {
      resizeObserver.observe(sliderContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = parseInt(e.target.value);
    // 슬라이더 0 = -무한대 (0), 슬라이더 100 = 0dB (100/120), 슬라이더 120 = +12dB (400/120)
    let volumeNormalized: number;
    if (sliderValue === 0) {
      volumeNormalized = 0;
    } else if (sliderValue <= 100) {
      // 0-100: 선형 매핑 0 -> 100/120
      volumeNormalized = (sliderValue / 100) * (100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY);
    } else {
      // 100-120: 선형 매핑 100/120 -> 400/120 (+12dB)
      const ratio = (sliderValue - 100) / 20; // 0-1
      const minVolume = 100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
      const maxVolume = 400 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY; // +12dB = 10^(12/20) ≈ 3.981
      volumeNormalized = minVolume + ratio * (maxVolume - minVolume);
    }
    updateMasterVolume(volumeNormalized);
  }, []);

  const handlePanChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const panNormalized = value / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;
    updateMasterPan(panNormalized);
  }, []);

  const handleVolumeWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1; // 아래로 스크롤: 감소, 위로 스크롤: 증가
    // 현재 슬라이더 값 계산 (volume -> slider)
    const volumeValue = masterVolume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
    let currentSliderValue: number;
    if (volumeValue === 0) {
      currentSliderValue = 0;
    } else if (volumeValue <= 100) {
      // 0-100 범위: 선형 매핑
      currentSliderValue = Math.round((volumeValue / 100) * 100);
    } else {
      // 100-400 범위: 선형 매핑
      const minVolume = 100;
      const maxVolume = 400;
      const ratio = (volumeValue - minVolume) / (maxVolume - minVolume);
      currentSliderValue = Math.round(100 + ratio * 20);
    }
    const newSliderValue = Math.max(0, Math.min(120, currentSliderValue + delta));
    // 슬라이더 -> volume 변환
    let volumeNormalized: number;
    if (newSliderValue === 0) {
      volumeNormalized = 0;
    } else if (newSliderValue <= 100) {
      volumeNormalized = (newSliderValue / 100) * (100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY);
    } else {
      const ratio = (newSliderValue - 100) / 20;
      const minVolume = 100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
      const maxVolume = 400 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
      volumeNormalized = minVolume + ratio * (maxVolume - minVolume);
    }
    updateMasterVolume(volumeNormalized);
  }, [masterVolume]);

  const handlePanWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1; // 아래로 스크롤: 왼쪽, 위로 스크롤: 오른쪽
    const currentValue = Math.round(masterPan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    const newValue = Math.max(AUDIO_CONSTANTS.PAN_MIN, Math.min(AUDIO_CONSTANTS.PAN_MAX, currentValue + delta));
    const panNormalized = newValue / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;
    updateMasterPan(panNormalized);
  }, [masterPan]);

  const handleVolumeReset = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    // 기본값은 0dB (100/120)
    updateMasterVolume(100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY);
  }, []);

  const handlePanReset = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // thumb 영역인지 확인
    const slider = e.currentTarget;
    const rect = slider.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const sliderWidth = rect.width;
    
    // 현재 thumb 위치 계산
    const min = AUDIO_CONSTANTS.PAN_MIN;
    const max = AUDIO_CONSTANTS.PAN_MAX;
    const value = Math.round(masterPan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    const percentage = (value - min) / (max - min);
    const thumbPosition = percentage * sliderWidth;
    
    // thumb 크기 (약 16px, 브라우저 기본값)
    const thumbSize = 16;
    const thumbLeft = thumbPosition - thumbSize / 2;
    const thumbRight = thumbPosition + thumbSize / 2;
    
    // 클릭한 위치가 thumb 영역인지 확인
    if (clickX >= thumbLeft && clickX <= thumbRight) {
      updateMasterPan(AUDIO_CONSTANTS.PAN_DEFAULT / AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    }
  }, [masterPan]);

  const formatPan = useCallback((pan: number): string => {
    const panValue = Math.round(Math.abs(pan) * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    if (panValue === 0) return 'C';
    if (pan > 0) return `R${panValue}`;
    return `L${panValue}`;
  }, []);

  // 볼륨을 데시벨로 변환
  const formatVolumeDb = useCallback((volume: number): string => {
    if (volume === 0) return '-∞ dB';
    
    const volumeValue = volume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
    const ratio = volumeValue / 100; // 100을 기준으로 한 비율
    const db = 20 * Math.log10(ratio);
    
    // 소수점 첫째 자리까지 표시
    if (Math.abs(db) < 0.05) {
      return '0.0 dB';
    }
    if (db > 0) {
      return `+${db.toFixed(1)} dB`;
    }
    return `${db.toFixed(1)} dB`;
  }, []);

  // 계산된 값들을 메모이제이션
  // volume -> slider 변환
  const volumeDisplay = useMemo(() => {
    const volumeValue = masterVolume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
    if (volumeValue === 0) {
      return 0;
    } else if (volumeValue <= 100) {
      // 0-100 범위: 선형 매핑
      return Math.round((volumeValue / 100) * 100);
    } else {
      // 100-400 범위: 선형 매핑
      const minVolume = 100;
      const maxVolume = 400;
      const ratio = (volumeValue - minVolume) / (maxVolume - minVolume);
      return Math.round(100 + ratio * 20);
    }
  }, [masterVolume]);
  
  const panDisplay = useMemo(() => Math.round(masterPan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY), [masterPan]);
  const panFormatted = useMemo(() => formatPan(masterPan), [masterPan, formatPan]);
  const volumeFormatted = useMemo(() => formatVolumeDb(masterVolume), [masterVolume, formatVolumeDb]);

  return (
    <div 
      className={`${styles.masterChannel} ${isSelected ? styles.channelSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.masterHeader}>
        <div className={styles.masterLabel}>MASTER</div>
      </div>
      
      <div className={styles.masterControls}>
        <div className={styles.metersAndVolumeRow}>
          <div className={styles.metersContainer}>
            <div className={styles.meterWrapper}>
              <div className={styles.meterLabel}>L</div>
              <LevelMeter trackId={masterTrackId} channel="left" />
            </div>
            <div className={styles.meterWrapper}>
              <div className={styles.meterLabel}>R</div>
              <LevelMeter trackId={masterTrackId} channel="right" />
            </div>
          </div>
          
          <div className={styles.volumeControl} onWheel={handleVolumeWheel}>
            <div className={styles.controlLabel}>Vol</div>
            <div 
              ref={sliderContainerRef}
              className={styles.verticalSliderContainer}
            >
              <input
                type="range"
                className={styles.verticalSlider}
                style={{
                  width: `${sliderWidth}px`,
                  marginLeft: `${-sliderWidth / 2}px`,
                }}
                min="0"
                max="120"
                value={volumeDisplay}
                onChange={handleVolumeChange}
                onDoubleClick={handleVolumeReset}
                onWheel={handleVolumeWheel}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className={styles.controlValue}>{volumeFormatted}</div>
          </div>
        </div>
        
        <div className={styles.panControl} onWheel={handlePanWheel}>
          <div className={styles.controlLabel}>Pan</div>
          <div className={styles.sliderContainer}>
            <input
              type="range"
              className={styles.slider}
              min={AUDIO_CONSTANTS.PAN_MIN.toString()}
              max={AUDIO_CONSTANTS.PAN_MAX.toString()}
              value={panDisplay}
              onChange={handlePanChange}
              onDoubleClick={handlePanReset}
              onWheel={handlePanWheel}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className={styles.controlValue}>{panFormatted}</div>
        </div>
      </div>
    </div>
  );
};

export default MasterChannel;
