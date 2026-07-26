import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './TransportControls.module.css';
import { useUIState } from '../../store/uiStore';
import { pausePlaybackClock, seekPlaybackClock, setPlaybackClockInterval, startPlaybackClock, stopPlaybackClock } from '../../utils/playbackClock';
import { AUDIO_BUFFER_CONSTANTS } from '../../constants/ui';
import { getPlaybackTime, setPlaybackRunning, subscribePlaybackTime } from '../../utils/playbackTimeStore';
import { playbackController } from '../../core/audio/PlaybackController';
import { selectProject } from '../../store/selectors';
import type { CollaborationManager } from '../../core/sync/CollaborationManager';
import type { P2PMessage, TransportMessage } from '../../core/sync/types/p2p';
import { subscribeCollaborationManager } from '../../core/sync/collaborationSession';
import { isPartyTimeEnabled, subscribePartyTime } from '../../utils/partyTime';

/**
 * TransportControls가 받는 props입니다.
 */
interface TransportControlsProps {
  /** 녹음 상태가 변경될 때 호출됩니다. */
  onRecordingChange?: (isRecording: boolean) => void;
}

/**
 * 재생, 일시정지, 정지, 녹음 버튼을 제공하는 트랜스포트 컨트롤입니다.
 * 
 * @param props - TransportControlsProps
 * @returns 트랜스포트 컨트롤 JSX 요소입니다.
 * 
 * @remarks
 * - Space 키는 재생과 일시정지를 전환합니다.
 * - R 키는 녹음을 전환합니다.
 * - 입력 필드에 포커스가 있으면 키 이벤트를 무시합니다.
 */
const TransportControls: React.FC<TransportControlsProps> = ({ onRecordingChange }) => {
  const ui = useUIState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const currentTimeRef = useRef<number>(ui.currentPlaybackTime);
  const lastWorkerTimeRef = useRef<number>(ui.currentPlaybackTime);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const suppressTransportRef = useRef<boolean>(false);
  const lastSeekSyncRef = useRef<number | null>(null);
  const lastRemoteSeekRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ action: TransportMessage['data']['action']; time: number; at: number } | null>(null);
  const lastLocalActionRef = useRef<{ action: TransportMessage['data']['action']; at: number } | null>(null);
  const skipLocalPauseRef = useRef<boolean>(false);
  const scheduledPauseTimeRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collaborationManagerRef = useRef<CollaborationManager | null>(null);
  const pendingLatencyHintRef = useRef<number | null>(null);
  
  // 실제 시간을 기준으로 재생 드리프트를 확인하기 위한 디버그 타이머입니다.
  const realTimeStartRef = useRef<number | null>(null);
  const playbackTimeStartRef = useRef<number | null>(null);
  const debugTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 현재 재생 시간을 ref에 보관해 불필요한 effect 재실행을 피합니다.
  useEffect(() => {
    currentTimeRef.current = getPlaybackTime();
    lastWorkerTimeRef.current = currentTimeRef.current;
    return subscribePlaybackTime((time) => {
      currentTimeRef.current = time;
      lastWorkerTimeRef.current = time;
    });
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // 파티타임 모드 구독
  useEffect(() => {
    const unsubscribe = subscribePartyTime((isActive) => {
      // 파티타임 모드가 활성화되면 재생 중지
      if (isActive && isPlaying) {
        setIsPlaying(false);
        setPlaybackRunning(false);
        stopPlaybackClock(0);
        playbackController.stop();
        ui.setCurrentPlaybackTime(0);
        currentTimeRef.current = 0;
        lastWorkerTimeRef.current = 0;
      }
    });
    
    return unsubscribe;
  }, [isPlaying, ui]);

  useEffect(() => {
    const bufferSize = Number.isFinite(ui.audioBufferSize)
      ? ui.audioBufferSize
      : AUDIO_BUFFER_CONSTANTS.DEFAULT_BUFFER_SIZE;
    const intervalMs = Math.max(
      1,
      Math.round((bufferSize / AUDIO_BUFFER_CONSTANTS.SAMPLE_RATE) * AUDIO_BUFFER_CONSTANTS.PERIODS * 1000)
    );
    setPlaybackClockInterval(intervalMs);
    const latencySeconds = Math.max(
      0.001,
      (bufferSize / AUDIO_BUFFER_CONSTANTS.SAMPLE_RATE) * AUDIO_BUFFER_CONSTANTS.PERIODS
    );
    const needsRecreate = playbackController.getEngine().setOutputLatencyHintSeconds(latencySeconds);
    if (isPlayingRef.current) {
      pendingLatencyHintRef.current = latencySeconds;
      return;
    }
    if (needsRecreate) {
      void playbackController.getEngine().recreateContextForLatencyHint();
    }
  }, [ui.audioBufferSize]);

  useEffect(() => {
    if (isPlaying) {
      return;
    }
    if (pendingLatencyHintRef.current === null) {
      return;
    }
    const latencySeconds = pendingLatencyHintRef.current;
    pendingLatencyHintRef.current = null;
    const needsRecreate = playbackController.getEngine().setOutputLatencyHintSeconds(latencySeconds);
    if (needsRecreate) {
      void playbackController.getEngine().recreateContextForLatencyHint();
    }
  }, [isPlaying]);

  // 메트로놈 상태 변경 시 PlaybackController에 전달
  useEffect(() => {
    playbackController.setMetronomeEnabled(ui.isMetronomeOn);
  }, [ui.isMetronomeOn]);

  const clearScheduledPause = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    scheduledPauseTimeRef.current = null;
  }, []);

  const schedulePauseAt = useCallback((targetTime: number) => {
    scheduledPauseTimeRef.current = targetTime;
    if (pauseTimerRef.current !== null) {
      clearTimeout(pauseTimerRef.current);
    }
    const tick = () => {
      if (!isPlayingRef.current) {
        pauseTimerRef.current = null;
        return;
      }
      const currentTime = getPlaybackTime();
      if (currentTime + 0.002 >= targetTime) {
        skipLocalPauseRef.current = true;
        setIsPlaying(false);
        pauseTimerRef.current = null;
        return;
      }
      pauseTimerRef.current = setTimeout(tick, 30);
    };
    tick();
  }, []);

  const sendTransport = useCallback((action: TransportMessage['data']['action'], time: number) => {
    if (suppressTransportRef.current) {
      return;
    }
    const manager = collaborationManagerRef.current;
    if (!manager || !manager.connected) {
      return;
    }
    const now = Date.now();
    const lastSent = lastSentRef.current;
    if (lastSent && lastSent.action === action && Math.abs(lastSent.time - time) < 0.001 && now - lastSent.at < 150) {
      return;
    }
    lastSentRef.current = { action, time, at: now };
    const message: TransportMessage = {
      type: 'transport',
      from: manager.getClientId(),
      timestamp: Date.now(),
      data: {
        action,
        time
      }
    };
    if (manager.getIsHost()) {
      manager.broadcastToAll(message);
    } else {
      manager.sendToHost(message);
    }
  }, []);

  const applyTransport = useCallback((message: TransportMessage) => {
    const manager = collaborationManagerRef.current;
    const { action, time } = message.data;
    const normalizedTime = Number.isFinite(time) ? time : 0;
    const latencySec = Math.max(0, (Date.now() - message.timestamp) / 1000);
    const applyLatency = action === 'seek' && isPlayingRef.current;
    const effectiveTime = applyLatency ? normalizedTime + latencySec : normalizedTime;
    suppressTransportRef.current = true;

    switch (action) {
      case 'play':
        clearScheduledPause();
        if (!isPlayingRef.current) {
          ui.setCurrentPlaybackTime(effectiveTime);
          currentTimeRef.current = effectiveTime;
          lastWorkerTimeRef.current = effectiveTime;
          setIsPlaying(true);
        }
        break;
      case 'pause': {
        lastRemoteSeekRef.current = effectiveTime;
        if (!isPlayingRef.current) {
          ui.setCurrentPlaybackTime(effectiveTime);
          currentTimeRef.current = effectiveTime;
          lastWorkerTimeRef.current = effectiveTime;
          skipLocalPauseRef.current = true;
          setIsPlaying(false);
          break;
        }
        const currentPlaybackTime = getPlaybackTime();
        if (currentPlaybackTime >= effectiveTime) {
          skipLocalPauseRef.current = true;
          ui.setCurrentPlaybackTime(currentPlaybackTime);
          currentTimeRef.current = currentPlaybackTime;
          lastWorkerTimeRef.current = currentPlaybackTime;
          setIsPlaying(false);
          break;
        }
        schedulePauseAt(effectiveTime);
        break;
      }
      case 'stop':
        setIsPlaying(false);
        setPlaybackRunning(false);
        stopPlaybackClock(0);
        playbackController.stop();
        ui.setCurrentPlaybackTime(0);
        currentTimeRef.current = 0;
        lastWorkerTimeRef.current = 0;
        skipLocalPauseRef.current = true;
        break;
      case 'seek':
        ui.setCurrentPlaybackTime(effectiveTime);
        currentTimeRef.current = effectiveTime;
        lastWorkerTimeRef.current = effectiveTime;
        lastRemoteSeekRef.current = effectiveTime;
        if (isPlayingRef.current) {
          seekPlaybackClock(effectiveTime);
          const project = selectProject();
          void playbackController.seek(effectiveTime, project);
        }
        break;
    }

    if (manager && manager.getIsHost() && message.from !== manager.getClientId()) {
      manager.broadcastToOthers(message.from, message);
    }

    setTimeout(() => {
      suppressTransportRef.current = false;
    }, 0);
  }, [clearScheduledPause, schedulePauseAt, ui]);

  const handleTransportMessage = useCallback((message: P2PMessage) => {
    if (message.type !== 'transport') {
      return;
    }
    applyTransport(message as TransportMessage);
  }, [applyTransport]);

  useEffect(() => {
    const unsubscribe = subscribeCollaborationManager((manager) => {
      if (collaborationManagerRef.current) {
        collaborationManagerRef.current.offP2PMessage(handleTransportMessage);
      }
      collaborationManagerRef.current = manager;
      if (manager) {
        manager.onP2PMessage(handleTransportMessage);
      }
    });

    return () => {
      unsubscribe();
      if (collaborationManagerRef.current) {
        collaborationManagerRef.current.offP2PMessage(handleTransportMessage);
      }
    };
  }, [handleTransportMessage]);

  useEffect(() => {
    if (isPlaying) {
      clearScheduledPause();
      setPlaybackRunning(true);
      // 재생 시작 시점의 실제 시간과 재생 시간을 함께 기록합니다.
      const playbackStartTime = currentTimeRef.current;
      const realStartTime = performance.now();
      realTimeStartRef.current = realStartTime;
      playbackTimeStartRef.current = playbackStartTime;
      
      // 1초마다 드리프트 확인용 타이머를 실행합니다.
      debugTimerRef.current = setInterval(() => {
        if (realTimeStartRef.current === null || playbackTimeStartRef.current === null) return;
        
        // 현재는 드리프트 값을 계산하지 않습니다.
      }, 1000); // 1초마다 확인합니다.
      
      startPlaybackClock(playbackStartTime);
      const project = selectProject();
      void playbackController.start(playbackStartTime, project);
    } else {
      clearScheduledPause();
      // 일시정지 직전에 최신 재생 시간을 가져옵니다.
      const useRemoteTime = skipLocalPauseRef.current;
      const currentPlaybackTime = useRemoteTime ? currentTimeRef.current : getPlaybackTime();
      setPlaybackRunning(false);
      // 재생이 멈추면 디버그 타이머를 정리합니다.
      if (debugTimerRef.current !== null) {
        clearInterval(debugTimerRef.current);
        debugTimerRef.current = null;
      }
      realTimeStartRef.current = null;
      playbackTimeStartRef.current = null;
      
      pausePlaybackClock();
      playbackController.pause();
      // 최신 재생 시간을 UI 상태에 반영합니다.
      ui.setCurrentPlaybackTime(currentPlaybackTime);
      currentTimeRef.current = currentPlaybackTime;
      lastWorkerTimeRef.current = currentPlaybackTime;
      if (useRemoteTime) {
        skipLocalPauseRef.current = false;
      }
    }
    
    return () => {
      // 컴포넌트가 언마운트되면 타이머를 정리합니다.
      if (debugTimerRef.current !== null) {
        clearInterval(debugTimerRef.current);
        debugTimerRef.current = null;
      }
    };
  }, [isPlaying, ui.setCurrentPlaybackTime]);

  const togglePlayPause = useCallback(() => {
    // 파티타임 모드일 때는 재생 불가
    if (isPartyTimeEnabled()) {
      return;
    }
    
    setIsPlaying((prev) => {
      const next = !prev;
      lastLocalActionRef.current = { action: next ? 'play' : 'pause', at: Date.now() };
      sendTransport(next ? 'play' : 'pause', currentTimeRef.current);
      return next;
    });
  }, [sendTransport]);

  const handleStop = () => {
    lastLocalActionRef.current = { action: 'stop', at: Date.now() };
    sendTransport('stop', 0);
    setIsPlaying(false);
    setPlaybackRunning(false);
    currentTimeRef.current = 0;
    lastWorkerTimeRef.current = 0;
    
    // 정지 시 디버그 타이머를 정리합니다.
    if (debugTimerRef.current !== null) {
      clearInterval(debugTimerRef.current);
      debugTimerRef.current = null;
    }
    realTimeStartRef.current = null;
    playbackTimeStartRef.current = null;
    
    stopPlaybackClock(0);
    playbackController.stop();
    ui.setCurrentPlaybackTime(0);
  };

  useEffect(() => {
    if (!isPlaying) {
      currentTimeRef.current = ui.currentPlaybackTime;
      lastWorkerTimeRef.current = ui.currentPlaybackTime;
      return;
    }

    const diff = Math.abs(ui.currentPlaybackTime - lastWorkerTimeRef.current);
    if (diff > 0.02) {
      seekPlaybackClock(ui.currentPlaybackTime);
      const project = selectProject();
      void playbackController.seek(ui.currentPlaybackTime, project);
      lastWorkerTimeRef.current = ui.currentPlaybackTime;
      sendTransport('seek', ui.currentPlaybackTime);
    }
  }, [ui.currentPlaybackTime, isPlaying, sendTransport]);

  useEffect(() => {
    if (isPlaying) {
      return;
    }
    if (suppressTransportRef.current) {
      return;
    }
    const time = ui.currentPlaybackTime;
    const lastLocal = lastLocalActionRef.current;
    if (lastLocal && (lastLocal.action === 'pause' || lastLocal.action === 'stop') && Date.now() - lastLocal.at < 250) {
      return;
    }
    if (lastRemoteSeekRef.current !== null && Math.abs(time - lastRemoteSeekRef.current) < 0.02) {
      lastRemoteSeekRef.current = null;
      return;
    }
    if (lastSeekSyncRef.current !== null && Math.abs(time - lastSeekSyncRef.current) < 0.02) {
      return;
    }
    lastSeekSyncRef.current = time;
    sendTransport('seek', time);
  }, [ui.currentPlaybackTime, isPlaying, sendTransport]);

  const toggleRecording = React.useCallback(() => {
    const newRecordingState = !isRecording;
    setIsRecording(newRecordingState);
    if (onRecordingChange) {
      onRecordingChange(newRecordingState);
    }
    // TODO: 실제 녹음 로직을 연결해야 합니다.
  }, [isRecording, onRecordingChange]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Space 키는 슬라이더에 포커스가 있어도 재생 토글로 처리합니다.
      if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
        // range 입력은 Space 키를 재생 토글로 사용합니다.
        if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          togglePlayPause();
          return;
        }
        // text input이나 textarea 같은 실제 입력 필드는 Space 키를 무시합니다.
        // button과 select는 기본 동작만 막고 재생 토글은 수행합니다.
        if (!(event.target instanceof HTMLElement)) return;
        const target = event.target;
        
        // button이나 select에 포커스가 있으면 기본 동작만 막고 재생 토글을 수행합니다.
        if (target.tagName === 'BUTTON' || target.tagName === 'SELECT') {
          event.preventDefault();
          event.stopPropagation(); // useKeyboardShortcuts로 이벤트가 전파되지 않게 합니다.
          togglePlayPause();
          return;
        }
        
        // 실제 입력 요소에서는 전역 Space 단축키를 실행하지 않습니다.
        if (
          (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        
        event.preventDefault();
        togglePlayPause();
        return;
      }

      // R 키는 녹음 토글로 처리합니다.
      if (event.key === 'r' || event.key === 'R') {
        // 입력 필드, 버튼, select에 포커스가 있으면 R 키를 무시합니다.
        if (!(event.target instanceof HTMLElement)) return;
        const target = event.target;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        toggleRecording();
      }
    };

    // 슬라이더 핸들러보다 먼저 실행되도록 capture phase에 등록합니다.
    window.addEventListener('keydown', handleKeyPress, true);
    return () => {
      window.removeEventListener('keydown', handleKeyPress, true);
    };
  }, [togglePlayPause, toggleRecording]);

  return (
    <div className={styles.transportControls}>
      <div className={styles.transportDisplay}>
        <div className={styles.controlsWrapper}>
          {isPlaying ? (
            <button className={styles.pauseButton} onClick={togglePlayPause}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
              </svg>
            </button>
          ) : (
            <button className={styles.playButton} onClick={togglePlayPause}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5V19L19 12L8 5Z" fill="currentColor"/>
              </svg>
            </button>
          )}
          <button className={styles.stopButton} onClick={handleStop}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
            </svg>
          </button>
          <button 
            className={`${styles.recordButton} ${isRecording ? styles.recordActive : ''}`} 
            onClick={toggleRecording}
            title="Record"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="6" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransportControls;
