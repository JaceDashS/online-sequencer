import React, { useState, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { getProject, updateTrack, addTrack, removeTrack, subscribeToProjectChanges, subscribeToTrackChanges } from '../../store/projectStore';
import type { Track } from '../../types/project';
import styles from './TrackList.module.css';
import { UI_CONSTANTS, AUDIO_CONSTANTS } from '../../constants/ui';

interface TrackListProps {
  onTrackHeightsChange?: (heights: Map<string, number>) => void;
  scrollTop?: number;
  selectedTrackId?: string | null;
  onTrackSelect?: (trackId: string | null) => void;
  defaultTrackHeight?: number;
}

export interface TrackListRef {
  setAllTrackHeights: (newHeight: number) => void;
}

const TrackList = forwardRef<TrackListRef, TrackListProps>(({ onTrackHeightsChange, scrollTop = 0, selectedTrackId, onTrackSelect, defaultTrackHeight = UI_CONSTANTS.TRACK_DEFAULT_HEIGHT }, ref) => {
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const trackRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const trackListRef = React.useRef<HTMLDivElement>(null);
  const [, setTrackHeights] = React.useState<Map<string, number>>(new Map());
  
  // 최신 트랙 데이터 가져오기 (state로 관리하여 리렌더링 트리거)
  const [tracks, setTracks] = useState(() => getProject().tracks);
  
  // 프로젝트 변경 구독 (트랙 추가/삭제 감지)
  useEffect(() => {
    const unsubscribeProject = subscribeToProjectChanges((event) => {
      if (event.type === 'track') {
        // 트랙 추가/삭제 시 최신 트랙 목록으로 업데이트
        setTracks([...getProject().tracks]);
      }
    });
    
    return unsubscribeProject;
  }, []);
  
  // 트랙 변경 구독 (볼륨/팬 등 트랙 속성 변경 감지)
  useEffect(() => {
    const unsubscribeTrack = subscribeToTrackChanges(() => {
      // 트랙 속성 변경 시 최신 트랙 목록으로 업데이트
      setTracks([...getProject().tracks]);
    });
    
    return unsubscribeTrack;
  }, []);

  const handleDoubleClick = (track: Track) => {
    // 더블클릭 시 타이머 취소
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setEditingTrackId(track.id);
    setEditValue(track.name);
  };

  const clickTimeoutRef = React.useRef<number | null>(null);

  const handleTrackClick = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // 더블클릭을 위한 타이머 처리
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return; // 더블클릭으로 처리
    }
    
    clickTimeoutRef.current = window.setTimeout(() => {
      // 단일 클릭으로 처리
      // 같은 트랙을 다시 클릭해도 포커스 유지 (null로 설정하지 않음)
      if (onTrackSelect) {
        if (selectedTrackId !== trackId) {
          onTrackSelect(trackId);
        }
        // selectedTrackId === trackId인 경우는 아무것도 하지 않음 (포커스 유지)
      }
      clickTimeoutRef.current = null;
    }, UI_CONSTANTS.DOUBLE_CLICK_TIMEOUT);
  };

  const handleSave = (trackId: string) => {
    if (editValue.trim()) {
      updateTrack(trackId, { name: editValue.trim() });
    }
    setEditingTrackId(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingTrackId(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, trackId: string) => {
    if (e.key === 'Enter') {
      handleSave(trackId);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleSoloClick = (trackId: string) => {
    const currentTracks = getProject().tracks;
    const track = currentTracks.find(t => t.id === trackId);
    if (!track) return;

    const newSoloState = !track.solo;
    
    if (newSoloState) {
      // 솔로를 활성화할 때: 현재 뮤트 상태를 저장하고 뮤트를 해제
      updateTrack(trackId, { 
        solo: true, 
        mutedBySolo: false, 
        mute: false,
        previousMute: track.mute // 이전 뮤트 상태 저장
      });
    } else {
      // 솔로를 비활성화할 때: 이전 뮤트 상태를 복원
      const muteToRestore = track.previousMute !== undefined ? track.previousMute : track.mute;
      updateTrack(trackId, { 
        solo: false, 
        mutedBySolo: false, 
        mute: muteToRestore,
        previousMute: undefined // 복원 후 초기화
      });
    }

    if (newSoloState) {
      // 솔로가 활성화되면, 다른 트랙들 중 명시적 뮤트가 아닌 트랙들은 자동 뮤트
      currentTracks.forEach(t => {
        if (t.id !== trackId && !t.solo && !t.mute) {
          updateTrack(t.id, { mutedBySolo: true });
        }
      });
    } else {
      // 솔로가 비활성화되면, 활성 솔로가 있는지 확인
      const tracksAfterUpdate = getProject().tracks;
      const hasAnySolo = tracksAfterUpdate.some(t => t.id !== trackId && t.solo);
      
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
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handleMuteClick = (trackId: string) => {
    const currentTracks = getProject().tracks;
    const track = currentTracks.find(t => t.id === trackId);
    if (!track) return;

    // 다른 트랙 중 솔로가 활성화된 것이 있는지 확인
    const hasAnySolo = currentTracks.some(t => t.id !== trackId && t.solo);
    
    // 다른 트랙이 솔로 상태이면 뮤트 버튼이 작동하지 않음
    if (hasAnySolo) {
      return;
    }

    const newMuteState = !track.mute;
    const wasSolo = track.solo;
    
    // 명시적 뮤트 상태 변경 시 자동 뮤트 해제 및 솔로 해제
    updateTrack(trackId, { 
      mute: newMuteState, 
      mutedBySolo: false,
      solo: false 
    });

    // 솔로 상태였던 트랙을 뮤트하면, 사실상 솔로가 해제된 것이므로
    // 다른 트랙들의 자동 뮤트를 해제해야 함
    if (wasSolo && newMuteState) {
      const tracksAfterUpdate = getProject().tracks;
      const hasAnyOtherSolo = tracksAfterUpdate.some(t => t.id !== trackId && t.solo);
      
      // 다른 활성 솔로가 없으면 모든 자동 뮤트 해제
      if (!hasAnyOtherSolo) {
        tracksAfterUpdate.forEach(t => {
          if (t.mutedBySolo) {
            updateTrack(t.id, { mutedBySolo: false });
          }
        });
      }
    }
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handleDeleteTrack = (trackId: string, trackName: string) => {
    if (window.confirm(`"${trackName}" 트랙을 삭제하시겠습니까?`)) {
      removeTrack(trackId);
      // 선택된 트랙이 삭제되면 선택 해제
      if (onTrackSelect && selectedTrackId === trackId) {
        onTrackSelect(null);
      }
    }
  };

  const handleVolumeChange = (trackId: string, value: number) => {
    // 슬라이더 0 = -무한대 (0), 슬라이더 100 = 0dB (100/120), 슬라이더 120 = +12dB (400/120)
    let volumeNormalized: number;
    if (value === 0) {
      volumeNormalized = 0;
    } else if (value <= 100) {
      // 0-100: 선형 매핑 0 -> 100/120
      volumeNormalized = (value / 100) * (100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY);
    } else {
      // 100-120: 선형 매핑 100/120 -> 400/120 (+12dB)
      const ratio = (value - 100) / 20; // 0-1
      const minVolume = 100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
      const maxVolume = 400 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY; // +12dB = 10^(12/20) ≈ 3.981
      volumeNormalized = minVolume + ratio * (maxVolume - minVolume);
    }
    updateTrack(trackId, { volume: volumeNormalized });
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handlePanChange = (trackId: string, value: number) => {
    const panNormalized = value / AUDIO_CONSTANTS.PAN_MAX_DISPLAY;
    updateTrack(trackId, { pan: panNormalized });
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handleVolumeReset = (trackId: string, e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    // 기본값은 0dB (100/120)
    updateTrack(trackId, { volume: 100 / AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY });
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handlePanReset = (trackId: string, e: React.MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    updateTrack(trackId, { pan: AUDIO_CONSTANTS.PAN_DEFAULT / AUDIO_CONSTANTS.PAN_MAX_DISPLAY });
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

  const handleVolumeWheel = (trackId: string, e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    // 현재 슬라이더 값 계산 (volume -> slider)
    const volumeValue = track.volume * AUDIO_CONSTANTS.VOLUME_MAX_DISPLAY;
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
    const delta = e.deltaY > 0 ? -AUDIO_CONSTANTS.WHEEL_DELTA : AUDIO_CONSTANTS.WHEEL_DELTA;
    const newValue = Math.max(AUDIO_CONSTANTS.VOLUME_MIN, Math.min(AUDIO_CONSTANTS.VOLUME_MAX, currentSliderValue + delta));
    handleVolumeChange(trackId, newValue);
  };

  const handlePanWheel = (trackId: string, e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const currentValue = Math.round(track.pan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY);
    const delta = e.deltaY > 0 ? -AUDIO_CONSTANTS.WHEEL_DELTA : AUDIO_CONSTANTS.WHEEL_DELTA;
    const newValue = Math.max(AUDIO_CONSTANTS.PAN_MIN, Math.min(AUDIO_CONSTANTS.PAN_MAX, currentValue + delta));
    handlePanChange(trackId, newValue);
  };

  const handleInstrumentChange = (trackId: string, instrument: string) => {
    updateTrack(trackId, { instrument });
    // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
  };

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

  const formatPan = (pan: number): string => {
    const panValue = Math.round(Math.abs(pan) * 100);
    if (panValue === 0) return 'C';
    if (pan > 0) return `R${panValue}`;
    return `L${panValue}`;
  };

  // 모든 트랙 높이를 측정하고 상태를 업데이트하는 공통 함수
  const measureAndUpdateTrackHeights = useCallback(() => {
    const heights = new Map<string, number>();
    trackRefs.current.forEach((element, trackId) => {
      if (element) {
        heights.set(trackId, element.offsetHeight);
      }
    });
    setTrackHeights(heights);
    if (onTrackHeightsChange && heights.size > 0) {
      onTrackHeightsChange(heights);
    }
    return heights;
  }, [onTrackHeightsChange]);

  const handleAddTrack = () => {
    const currentTracks = getProject().tracks;
    if (currentTracks.length >= 10) {
      alert('최대 10개의 트랙만 추가할 수 있습니다.');
      return;
    }
    const trackNumber = currentTracks.length + 1;
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `Track Control ${trackNumber}`,
      instrument: 'piano',
      volume: 100 / 120,
      pan: 0.0,
      effects: [],
      solo: false,
      mute: false,
      mutedBySolo: false,
    };
    try {
      addTrack(newTrack);
      // pub-sub이 자동으로 업데이트하므로 forceUpdate 불필요
      
      // 새 트랙의 높이를 슬라이더 값에 맞춰 즉시 동기화
      // ResizeObserver가 자동으로 감지하지만, 새 트랙의 초기 높이를 명시적으로 설정
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newTrackElement = trackRefs.current.get(newTrack.id);
          if (newTrackElement) {
            newTrackElement.style.height = `${defaultTrackHeight}px`;
            newTrackElement.style.minHeight = `${defaultTrackHeight}px`;
          }
          // ResizeObserver가 자동으로 높이를 측정하고 업데이트함
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  };

  // 개별 트랙 높이 변경 핸들러 (실시간 업데이트용)
  const handleTrackResize = useCallback((trackId: string, newHeight: number) => {
    // 실시간으로 높이 동기화 (드래그 중 빠른 반응을 위해)
    setTrackHeights(prev => {
      const newHeights = new Map(prev);
      newHeights.set(trackId, newHeight);
      return newHeights;
    });
    // 부모 컴포넌트에도 즉시 알림 (실시간 업데이트)
    if (onTrackHeightsChange) {
      const heights = new Map<string, number>();
      trackRefs.current.forEach((el, id) => {
        if (el) {
          heights.set(id, id === trackId ? newHeight : el.offsetHeight);
        }
      });
      onTrackHeightsChange(heights);
    }
  }, [onTrackHeightsChange]);

  const handleTrackResizeEnd = useCallback(() => {
    // 리사이즈 종료 시 모든 트랙의 현재 높이를 정확히 측정하여 업데이트
    measureAndUpdateTrackHeights();
  }, [measureAndUpdateTrackHeights]);

  // 개별 트랙 리사이즈 핸들러 생성 함수
  const createTrackResizeHandler = useCallback((trackId: string) => {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const trackElement = trackRefs.current.get(trackId);
      if (!trackElement) return;

      const startY = e.clientY;
      const startHeight = trackElement.offsetHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.max(UI_CONSTANTS.TRACK_MIN_HEIGHT, startHeight + deltaY);

        // 즉시 DOM에 높이 적용
        trackElement.style.height = `${newHeight}px`;
        trackElement.style.minHeight = `${newHeight}px`;

        // 콜백 호출
        handleTrackResize(trackId, newHeight);
      };

      const handleMouseUp = () => {
        handleTrackResizeEnd();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };
  }, [handleTrackResize, handleTrackResizeEnd]);

  // 모든 트랙 높이 일괄 변경 함수
  const setAllTrackHeights = React.useCallback((newHeight: number) => {
    // 모든 트랙의 높이를 새로운 높이로 설정
    trackRefs.current.forEach((element) => {
      if (element) {
        element.style.height = `${newHeight}px`;
        element.style.minHeight = `${newHeight}px`;
      }
    });
    // ResizeObserver가 자동으로 감지하지만, 즉시 업데이트를 위해 공통 함수 호출
    requestAnimationFrame(() => {
      measureAndUpdateTrackHeights();
    });
  }, [measureAndUpdateTrackHeights]);

  // ref를 통해 외부에서 함수 호출 가능하도록 노출
  useImperativeHandle(ref, () => ({
    setAllTrackHeights,
  }), [setAllTrackHeights]);

  // tracks나 editingTrackId 변경 시 높이 측정 (ResizeObserver가 자동으로 처리하지만 초기화 보장)
  React.useEffect(() => {
    // ResizeObserver가 자동으로 처리하므로 여기서는 초기화만 보장
    // 실제 측정은 ResizeObserver의 updateAllHeights에서 처리됨
  }, [tracks, editingTrackId]);

  // ResizeObserver로 각 트랙 높이 변화 감지 (메인 높이 측정 로직)
  React.useEffect(() => {
    const observers: ResizeObserver[] = [];
    let updateTimeout: number | null = null;

    const updateAllHeights = () => {
      if (updateTimeout !== null) {
        cancelAnimationFrame(updateTimeout);
      }
      
      updateTimeout = requestAnimationFrame(() => {
        measureAndUpdateTrackHeights();
      });
    };

    trackRefs.current.forEach((element) => {
      if (element) {
        const observer = new ResizeObserver(() => {
          // 모든 트랙의 높이를 다시 측정하여 동기화
          updateAllHeights();
        });
        observer.observe(element);
        observers.push(observer);
      }
    });

    // 초기 높이 설정
    updateAllHeights();

    return () => {
      observers.forEach(observer => observer.disconnect());
      if (updateTimeout !== null) {
        cancelAnimationFrame(updateTimeout);
      }
    };
  }, [tracks, onTrackHeightsChange]);

  // 창 크기 변경 감지 및 트랙 높이 동기화
  // ResizeObserver가 자동으로 처리하지만, 창 크기 변경 시에도 확실히 업데이트
  React.useEffect(() => {
    let timeoutId: number | null = null;
    
    const handleWindowResize = () => {
      // 디바운싱을 위해 기존 타이머 취소
      if (timeoutId !== null) {
        cancelAnimationFrame(timeoutId);
      }
      
      // DOM 업데이트가 완료된 후 높이 측정
      timeoutId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measureAndUpdateTrackHeights();
        });
      });
    };

    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (timeoutId !== null) {
        cancelAnimationFrame(timeoutId);
      }
    };
  }, [measureAndUpdateTrackHeights]);

  return (
    <div className={styles.trackList} ref={trackListRef} style={{ transform: `translateY(-${scrollTop}px)` }}>
      {tracks.map((track: Track) => (
        <div 
          key={track.id} 
          ref={(el) => {
            if (el) {
              trackRefs.current.set(track.id, el);
            } else {
              trackRefs.current.delete(track.id);
            }
          }}
          className={`${styles.trackItem} ${selectedTrackId === track.id ? styles.trackFocused : ''}`}
          onClick={(e) => handleTrackClick(track.id, e)}
        >
          <div className={styles.trackHeader}>
            {editingTrackId === track.id ? (
              <input
                type="text"
                className={styles.trackNameInput}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleSave(track.id)}
                onKeyDown={(e) => handleKeyDown(e, track.id)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <div 
                className={styles.trackName}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleDoubleClick(track);
                }}
              >
                {track.name}
              </div>
            )}
            <div className={styles.trackButtons}>
              <button
                className={`${styles.trackButton} ${styles.solo} ${track.solo ? styles.active : ''}`}
                title="Solo"
                onClick={() => handleSoloClick(track.id)}
              >
                S
              </button>
              <button
                className={`${styles.trackButton} ${styles.mute} ${(track.mute || track.mutedBySolo) ? styles.active : ''}`}
                title={track.mute ? "Mute (Manual)" : track.mutedBySolo ? "Mute (Auto)" : "Mute"}
                onClick={() => handleMuteClick(track.id)}
              >
                M
              </button>
              <button
                className={styles.trackDelete}
                title="Delete Track"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTrack(track.id, track.name);
                }}
              >
                ×
              </button>
            </div>
          </div>
          <div className={styles.trackControls}>
            <div className={styles.controlRow}>
              <span className={styles.trackControlLabel}>Vol</span>
              <div className={styles.sliderWrapper}>
                <input
                  type="range"
                  className={styles.trackSlider}
                  min="0"
                  max="120"
                  value={(() => {
                    const volumeValue = track.volume * 120;
                    if (volumeValue === 0) return 0;
                    if (volumeValue <= 100) {
                      return Math.round((volumeValue / 100) * 100);
                    }
                    const minVolume = 100;
                    const maxVolume = 400;
                    const ratio = (volumeValue - minVolume) / (maxVolume - minVolume);
                    return Math.round(100 + ratio * 20);
                  })()}
                  onChange={(e) => handleVolumeChange(track.id, parseInt(e.target.value))}
                  onDoubleClick={(e) => handleVolumeReset(track.id, e)}
                  onWheel={(e) => handleVolumeWheel(track.id, e)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={styles.sliderValue}>{formatVolumeDb(track.volume)}</span>
              </div>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.trackControlLabel}>Pan</span>
              <div className={styles.sliderWrapper}>
                <input
                  type="range"
                  className={styles.trackSlider}
                  min={AUDIO_CONSTANTS.PAN_MIN}
                  max={AUDIO_CONSTANTS.PAN_MAX}
                  value={Math.round(track.pan * AUDIO_CONSTANTS.PAN_MAX_DISPLAY)}
                  onChange={(e) => handlePanChange(track.id, parseInt(e.target.value))}
                  onDoubleClick={(e) => handlePanReset(track.id, e)}
                  onWheel={(e) => handlePanWheel(track.id, e)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className={styles.sliderValue}>{formatPan(track.pan)}</span>
              </div>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.trackControlLabel}>Inst</span>
              <select
                className={styles.instrumentSelect}
                value={track.instrument}
                onChange={(e) => handleInstrumentChange(track.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="piano">Piano</option>
                <option value="drum">Drum</option>
              </select>
            </div>
          </div>
          <div 
            className={styles.resizeHandle}
            onMouseDown={createTrackResizeHandler(track.id)}
          />
        </div>
      ))}
      {tracks.length < 10 && (
        <div className={styles.addTrackButtonContainer}>
          <button 
            className={styles.addTrackButton}
            onClick={handleAddTrack}
            title="Add Track"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
});

TrackList.displayName = 'TrackList';

export default TrackList;
