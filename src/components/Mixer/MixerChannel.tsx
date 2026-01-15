import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import styles from './MixerChannel.module.css';
import LevelMeter from './LevelMeter';
import { updateTrack, getProject, subscribeToTrackChanges } from '../../store/projectStore';
import type { Track } from '../../types/project';
import { AUDIO_CONSTANTS } from '../../constants/ui';

interface MixerChannelProps {
  track: Track;
  isSelected: boolean;
  onClick: () => void;
}

const MixerChannel: React.FC<MixerChannelProps> = ({ track, isSelected, onClick }) => {
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const [sliderWidth, setSliderWidth] = useState(200);
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // 최신 트랙 데이터 가져오기 (메모이제이션)
  const currentTrack = useMemo(() => {
    return getProject().tracks.find(t => t.id === track.id) || track;
  }, [track, updateCounter]);
  
  // 트랙 변경 감지 (pub-sub 패턴)
  useEffect(() => {
    const unsubscribe = subscribeToTrackChanges((event) => {
      if (event.trackId === track.id) {
        setUpdateCounter(prev => prev + 1);
      }
    });
    return unsubscribe;
  }, [track.id]);
  
  // 컨테이너 높이에 맞춰 슬라이더 너비 조정 (thumb 공간 고려)
  useEffect(() => {
    const updateSliderWidth = () => {
      if (sliderContainerRef.current) {
        const height = sliderContainerRef.current.clientHeight;
        // thumb이 컨테이너 밖으로 나가지 않도록 패딩을 고려한 너비 설정
        // thumb 크기(16px)의 절반씩 양쪽에 공간 확보 (총 20px 여유)
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
    updateTrack(track.id, { volume: volumeNormalized });
  }, [track.id]);

  const handlePanChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    const panNormalized = value / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;
    updateTrack(track.id, { pan: panNormalized });
  }, [track.id]);

  const handleVolumeWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1; // 아래로 스크롤: 감소, 위로 스크롤: 증가
    // 현재 슬라이더 값 계산 (volume -> slider)
    const volumeValue = currentTrack.volume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
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
    updateTrack(track.id, { volume: volumeNormalized });
  }, [track.id, currentTrack.volume]);

  const handlePanWheel = useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1; // 아래로 스크롤: 왼쪽, 위로 스크롤: 오른쪽
    const currentValue = Math.round(currentTrack.pan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    const newValue = Math.max(AUDIO_CONSTANTS.PAN_MIN, Math.min(AUDIO_CONSTANTS.PAN_MAX, currentValue + delta));
    const panNormalized = newValue / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;
    updateTrack(track.id, { pan: panNormalized });
  }, [track.id, currentTrack.pan]);

  const handleVolumeReset = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    // 기본값은 0dB (100/120)
    updateTrack(track.id, { volume: 100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY });
  }, [track.id]);

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
    const value = Math.round(currentTrack.pan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    const percentage = (value - min) / (max - min);
    const thumbPosition = percentage * sliderWidth;
    
    // thumb 크기 (약 16px, 브라우저 기본값)
    const thumbSize = 16;
    const thumbLeft = thumbPosition - thumbSize / 2;
    const thumbRight = thumbPosition + thumbSize / 2;
    
    // 클릭한 위치가 thumb 영역인지 확인
    if (clickX >= thumbLeft && clickX <= thumbRight) {
      updateTrack(track.id, { pan: AUDIO_CONSTANTS.PAN_DEFAULT / AUDIO_CONSTANTS.PAN_MAX_DISPLAY });
    }
  }, [track.id, currentTrack.pan]);

  const handleSoloClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const currentTracks = getProject().tracks;
    const trackData = currentTracks.find(t => t.id === track.id);
    if (!trackData) return;

    const newSoloState = !currentTrack.solo;
    
    if (newSoloState) {
      // 솔로를 활성화할 때: 현재 뮤트 상태를 저장하고 뮤트를 해제
      updateTrack(track.id, { 
        solo: true, 
        mutedBySolo: false, 
        mute: false,
        previousMute: currentTrack.mute // 이전 뮤트 상태 저장
      });
      
      // 솔로가 활성화되면, 다른 트랙들 중 명시적 뮤트가 아닌 트랙들은 자동 뮤트
      currentTracks.forEach(t => {
        if (t.id !== track.id && !t.solo && !t.mute) {
          updateTrack(t.id, { mutedBySolo: true });
        }
      });
    } else {
      // 솔로를 비활성화할 때: 이전 뮤트 상태를 복원
      const muteToRestore = currentTrack.previousMute !== undefined ? currentTrack.previousMute : currentTrack.mute;
      updateTrack(track.id, { 
        solo: false, 
        mutedBySolo: false, 
        mute: muteToRestore,
        previousMute: undefined // 복원 후 초기화
      });
      
      // 솔로가 비활성화되면, 활성 솔로가 있는지 확인
      const tracksAfterUpdate = getProject().tracks;
      const hasAnySolo = tracksAfterUpdate.some(t => t.id !== track.id && t.solo);
      
      if (hasAnySolo) {
        // 다른 솔로가 있으면, 현재 트랙을 포함하여 솔로가 아니고 명시적 뮤트가 아닌 모든 트랙을 자동 뮤트로 설정
        tracksAfterUpdate.forEach(t => {
          if (!t.solo && !t.mute) {
            if (!t.mutedBySolo) {
              updateTrack(t.id, { mutedBySolo: true });
            }
          }
        });
      } else {
        // 활성 솔로가 없으면 모든 자동 뮤트 해제
        tracksAfterUpdate.forEach(t => {
          if (t.mutedBySolo) {
            updateTrack(t.id, { mutedBySolo: false });
          }
        });
      }
    }
  }, [track.id, currentTrack]);

  const handleMuteClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const currentTracks = getProject().tracks;
    const trackData = currentTracks.find(t => t.id === track.id);
    if (!trackData) return;

    // 다른 트랙 중 솔로가 활성화된 것이 있는지 확인
    const hasAnySolo = currentTracks.some(t => t.id !== track.id && t.solo);
    
    // 다른 트랙이 솔로 상태이면 뮤트 버튼이 작동하지 않음
    if (hasAnySolo) {
      return;
    }

    const newMuteState = !currentTrack.mute;
    const wasSolo = currentTrack.solo;
    
    // 명시적 뮤트 상태 변경 시 자동 뮤트 해제 및 솔로 해제
    updateTrack(track.id, { 
      mute: newMuteState, 
      mutedBySolo: false,
      solo: false 
    });

    // 솔로 상태였던 트랙을 뮤트하면, 사실상 솔로가 해제된 것이므로
    // 다른 트랙들의 자동 뮤트를 해제해야 함
    if (wasSolo && newMuteState) {
      const tracksAfterUpdate = getProject().tracks;
      const hasAnyOtherSolo = tracksAfterUpdate.some(t => t.id !== track.id && t.solo);
      
      // 다른 활성 솔로가 없으면 모든 자동 뮤트 해제
      if (!hasAnyOtherSolo) {
        tracksAfterUpdate.forEach(t => {
          if (t.mutedBySolo) {
            updateTrack(t.id, { mutedBySolo: false });
          }
        });
      }
    }
  }, [track.id, currentTrack]);

  const formatPan = useCallback((pan: number): string => {
    // pan은 -1.0 ~ 1.0 범위
    const panValue = Math.round(Math.abs(pan) * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    if (panValue === 0) return 'C';
    if (pan > 0) return `R${panValue}`;
    return `L${panValue}`;
  }, []);

  // 볼륨을 데시벨로 변환 (100 = 0dB)
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
    const volumeValue = currentTrack.volume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
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
  }, [currentTrack.volume]);
  const panDisplay = useMemo(() => Math.round(currentTrack.pan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY), [currentTrack.pan]);
  const panFormatted = useMemo(() => formatPan(currentTrack.pan), [currentTrack.pan, formatPan]);

  return (
    <div 
      className={`${styles.mixerChannel} ${isSelected ? styles.channelSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.channelHeader}>
        <div className={styles.channelName}>{currentTrack.name}</div>
        <div className={styles.channelButtons}>
          <button
            className={`${styles.channelButton} ${styles.solo} ${currentTrack.solo ? styles.active : ''}`}
            title="Solo"
            onClick={handleSoloClick}
          >
            S
          </button>
          <button
            className={`${styles.channelButton} ${styles.mute} ${(currentTrack.mute || currentTrack.mutedBySolo) ? styles.active : ''}`}
            title={currentTrack.mute ? "Mute (Manual)" : currentTrack.mutedBySolo ? "Mute (Auto)" : "Mute"}
            onClick={handleMuteClick}
          >
            M
          </button>
        </div>
      </div>
      
      <div className={styles.channelControls}>
        <div className={styles.metersAndVolumeRow}>
          <div className={styles.metersContainer}>
            <div className={styles.meterWrapper}>
              <div className={styles.meterLabel}>L</div>
              <LevelMeter trackId={track.id} channel="left" />
            </div>
            <div className={styles.meterWrapper}>
              <div className={styles.meterLabel}>R</div>
              <LevelMeter trackId={track.id} channel="right" />
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
            <div className={styles.controlValue}>{formatVolumeDb(currentTrack.volume)}</div>
          </div>
        </div>
        
        <div className={styles.panControl} onWheel={handlePanWheel}>
          <div className={styles.controlLabel}>Pan</div>
          <div className={styles.sliderContainer}>
            <input
              type="range"
              className={styles.slider}
              min={AUDIO_CONSTANTS.PAN_MIN}
              max={AUDIO_CONSTANTS.PAN_MAX}
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

// React.memo로 감싸서 props가 변경될 때만 리렌더링
export default React.memo(MixerChannel, (prevProps, nextProps) => {
  return (
    prevProps.track.id === nextProps.track.id &&
    prevProps.track.name === nextProps.track.name &&
    prevProps.track.volume === nextProps.track.volume &&
    prevProps.track.pan === nextProps.track.pan &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onClick === nextProps.onClick
  );
});
