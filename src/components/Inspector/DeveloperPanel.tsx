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
  const [driftInput, setDriftInput] = useState(String(ui.playbackDriftMs));
  const [pitchOffsetInput, setPitchOffsetInput] = useState(String(ui.pitchOffsetMaxMs));
  const [lookaheadInput, setLookaheadInput] = useState(String(ui.scheduleLookaheadSeconds));
  const [isDriftLogEnabled, setIsDriftLogEnabled] = useState(ui.playbackDriftLoggingEnabled);
  const [isScheduleLogEnabled, setIsScheduleLogEnabled] = useState(ui.scheduleLogEnabled);
  const [isLongTaskLogEnabled, setIsLongTaskLogEnabled] = useState(ui.longTaskLogEnabled);

  useEffect(() => {
    setIsDriftLogEnabled(ui.playbackDriftLoggingEnabled);
  }, [ui.playbackDriftLoggingEnabled]);
  useEffect(() => {
    setIsScheduleLogEnabled(ui.scheduleLogEnabled);
  }, [ui.scheduleLogEnabled]);
  useEffect(() => {
    setIsLongTaskLogEnabled(ui.longTaskLogEnabled);
  }, [ui.longTaskLogEnabled]);
  const [overscanInput, setOverscanInput] = useState(String(ui.timelineOverscanMultiplier));
  const isEditingDriftRef = useRef(false);
  const isEditingPitchOffsetRef = useRef(false);
  const isEditingLookaheadRef = useRef(false);
  const isEditingOverscanRef = useRef(false);
  const devClickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);
  
  // 초기값 설정 및 값 변경 시 AudioEngine에 반영
  useEffect(() => {
    if (!ui.devModeEnabled) return;
    playbackController.getEngine().setPitchOffsetMaxMs(ui.pitchOffsetMaxMs);
  }, [ui.devModeEnabled, ui.pitchOffsetMaxMs]);
  
  useEffect(() => {
    if (!ui.devModeEnabled) return;
    playbackController.setScheduleLookaheadSeconds(ui.scheduleLookaheadSeconds);
  }, [ui.devModeEnabled, ui.scheduleLookaheadSeconds]);

  // 파티타임 상태 구독
  useEffect(() => {
    const unsubscribe = subscribePartyTime((isActive) => {
      setIsPartyTimeActive(isActive);
    });
    return unsubscribe;
  }, []);

  if (!ui.devModeEnabled) return null;

  const commitNumberInput = (
    rawValue: string,
    fallbackValue: number,
    onCommit: (value: number) => void,
    clamp?: (value: number) => number
  ) => {
    if (rawValue.trim() === '') {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      onCommit(fallbackValue);
      return;
    }
    const nextValue = clamp ? clamp(parsed) : parsed;
    onCommit(nextValue);
  };

  const handleDriftCommit = () => {
    commitNumberInput(
      driftInput,
      ui.playbackDriftMs,
      (value) => ui.setPlaybackDriftMs(Math.round(value)),
      (value) => Math.max(0, Math.min(500, value))
    );
  };

  const handlePitchOffsetCommit = () => {
    commitNumberInput(
      pitchOffsetInput,
      ui.pitchOffsetMaxMs,
      (value) => {
        const nextValue = Math.round(value);
        ui.setPitchOffsetMaxMs(nextValue);
        playbackController.getEngine().setPitchOffsetMaxMs(nextValue);
      },
      (value) => Math.max(0, Math.min(20, value))
    );
  };

  const handleLookaheadCommit = () => {
    commitNumberInput(
      lookaheadInput,
      ui.scheduleLookaheadSeconds,
      (value) => {
        const nextValue = Math.round(value * 100) / 100;
        ui.setScheduleLookaheadSeconds(nextValue);
        playbackController.setScheduleLookaheadSeconds(nextValue);
      },
      (value) => Math.max(0, Math.min(5, value))
    );
  };

  const handleDriftLogToggle = () => {
    const nextValue = !isDriftLogEnabled;
    setIsDriftLogEnabled(nextValue);
    ui.setPlaybackDriftLoggingEnabled(nextValue);
  };

  const handleScheduleLogToggle = () => {
    const nextValue = !isScheduleLogEnabled;
    setIsScheduleLogEnabled(nextValue);
    ui.setScheduleLogEnabled(nextValue);
  };

  const handleLongTaskLogToggle = () => {
    const nextValue = !isLongTaskLogEnabled;
    setIsLongTaskLogEnabled(nextValue);
    ui.setLongTaskLogEnabled(nextValue);
  };

  const handleOverscanCommit = () => {
    commitNumberInput(
      overscanInput,
      ui.timelineOverscanMultiplier,
      (value) => {
        const nextValue = Math.round(value * 100) / 100;
        ui.setTimelineOverscanMultiplier(nextValue);
      },
      (value) => Math.max(0, Math.min(2, value))
    );
  };

  const handleLevelMeterToggle = () => {
    ui.setLevelMeterEnabled(!ui.levelMeterEnabled);
  };

  const handleProjectSubscriptionToggle = () => {
    ui.setTimelineProjectSubscriptionEnabled(!ui.timelineProjectSubscriptionEnabled);
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
              value={driftInput}
              onChange={(event) => setDriftInput(event.target.value)}
              onFocus={() => { isEditingDriftRef.current = true; }}
              onBlur={() => { isEditingDriftRef.current = false; handleDriftCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>DRIFT LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isDriftLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleDriftLogToggle}
            >
              [{isDriftLogEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>SCHEDULE LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isScheduleLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleScheduleLogToggle}
            >
              [{isScheduleLogEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LONGTASK LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isLongTaskLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleLongTaskLogToggle}
            >
              [{isLongTaskLogEnabled ? 'ON' : 'OFF'}]
            </button>
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
              value={pitchOffsetInput}
              onChange={(event) => setPitchOffsetInput(event.target.value)}
              onFocus={() => { isEditingPitchOffsetRef.current = true; }}
              onBlur={() => { isEditingPitchOffsetRef.current = false; handlePitchOffsetCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LOOKAHEAD</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={lookaheadInput}
              onChange={(event) => setLookaheadInput(event.target.value)}
              onFocus={() => { isEditingLookaheadRef.current = true; }}
              onBlur={() => { isEditingLookaheadRef.current = false; handleLookaheadCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>s</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>METER</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${ui.levelMeterEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleLevelMeterToggle}
            >
              [{ui.levelMeterEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>SUB PROJ</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${ui.timelineProjectSubscriptionEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleProjectSubscriptionToggle}
            >
              [{ui.timelineProjectSubscriptionEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>OVERSCAN</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={overscanInput}
              onChange={(event) => setOverscanInput(event.target.value)}
              onFocus={() => { isEditingOverscanRef.current = true; }}
              onBlur={() => { isEditingOverscanRef.current = false; handleOverscanCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>x</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperPanel;




















