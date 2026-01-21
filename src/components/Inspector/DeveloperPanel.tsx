import React, { useEffect, useState, useRef } from 'react';
import styles from './DeveloperPanel.module.css';
import { useUIState } from '../../store/uiStore';
import { playbackController } from '../../core/audio/PlaybackController';
import { AUDIO_BUFFER_CONSTANTS } from '../../constants/ui';
import { isPartyTimeEnabled, subscribePartyTime } from '../../utils/partyTime';
import PasswordModal from './PasswordModal';
import RoomsListModal from './RoomsListModal';

const DeveloperPanel: React.FC = () => {
  const ui = useUIState();
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRoomsModal, setShowRoomsModal] = useState(false);
  const [isPartyTimeActive, setIsPartyTimeActive] = useState(() => isPartyTimeEnabled());
  const devClickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  
  // 초기값 설정 및 값 변경 시 AudioEngine에 반영
  useEffect(() => {
    if (!ui.devModeEnabled) return;
    playbackController.getEngine().setPitchOffsetMaxMs(ui.pitchOffsetMaxMs);
  }, [ui.devModeEnabled, ui.pitchOffsetMaxMs]);

  // 파티타임 상태 구독
  useEffect(() => {
    const unsubscribe = subscribePartyTime((isActive) => {
      setIsPartyTimeActive(isActive);
    });
    return unsubscribe;
  }, []);

  if (!ui.devModeEnabled) return null;

  const handleDriftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      ui.setPlaybackDriftMs(nextValue);
    }
  };

  const handlePitchOffsetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      ui.setPitchOffsetMaxMs(nextValue);
      // AudioEngine에 즉시 반영
      playbackController.getEngine().setPitchOffsetMaxMs(nextValue);
    }
  };

  const handleBufferChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      ui.setAudioBufferSize(nextValue);
    }
  };

  const handleLogChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      ui.setDebugLogBufferSize(nextValue);
    }
  };

  const bufferOptions = AUDIO_BUFFER_CONSTANTS.BUFFER_SIZES.map((size) => ({
    label: String(size),
    value: size,
  }));

  const logOptions = [
    { label: 'OFF', value: 0 },
    { label: '60', value: 60 },
    { label: '120', value: 120 },
    { label: '300', value: 300 },
    { label: '600', value: 600 },
  ];

  const handleHeaderClick = () => {
    // 파티타임이 활성화된 상태에서만 작동
    if (!isPartyTimeActive) {
      return;
    }

    const now = Date.now();
    // 5초 내에 연속 클릭이 아니면 카운터 리셋
    if (now - lastClickTimeRef.current > 5000) {
      devClickCountRef.current = 0;
    }

    devClickCountRef.current += 1;
    lastClickTimeRef.current = now;

    if (devClickCountRef.current >= 10) {
      setShowPasswordModal(true);
      devClickCountRef.current = 0;
    }
  };

  const handlePasswordSuccess = () => {
    setIsAdminMode(true);
  };

  const handleShowRooms = () => {
    setShowRoomsModal(true);
  };

  return (
    <div className={styles.devPanel}>
      <div className={styles.headerContainer}>
        <div
          className={`${styles.header} ${isPartyTimeActive ? styles.clickable : ''}`}
          onClick={handleHeaderClick}
          style={{ cursor: isPartyTimeActive ? 'pointer' : 'default' }}
        >
          {isAdminMode ? 'admin' : 'DEV'}
        </div>
        {isAdminMode && (
          <button
            className={styles.roomsButton}
            onClick={handleShowRooms}
            title="방 목록 보기"
          >
            방 목록
          </button>
        )}
      </div>
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={handlePasswordSuccess}
      />
      <RoomsListModal
        isOpen={showRoomsModal}
        onClose={() => setShowRoomsModal(false)}
      />
      <div className={styles.controls}>
        <div className={styles.row}>
          <span className={styles.label}>DRIFT</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={500}
              step={1}
              value={ui.playbackDriftMs}
              onChange={handleDriftChange}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>BUF</span>
          <div className={styles.field}>
            <select
              className={styles.select}
              value={ui.audioBufferSize}
              onChange={handleBufferChange}
            >
              {bufferOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LOG</span>
          <div className={styles.field}>
            <select
              className={styles.select}
              value={ui.debugLogBufferSize}
              onChange={handleLogChange}
            >
              {logOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>PITCH OFFSET</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={20}
              step={1}
              value={ui.pitchOffsetMaxMs}
              onChange={handlePitchOffsetChange}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperPanel;
