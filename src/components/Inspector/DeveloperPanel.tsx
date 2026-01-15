import React, { useEffect } from 'react';
import styles from './DeveloperPanel.module.css';
import { useUIState } from '../../store/uiStore';
import { playbackController } from '../../core/audio/PlaybackController';
import { AUDIO_BUFFER_CONSTANTS } from '../../constants/ui';

const DeveloperPanel: React.FC = () => {
  const ui = useUIState();

  if (!ui.devModeEnabled) return null;
  
  // 초기값 설정 및 값 변경 시 AudioEngine에 반영
  useEffect(() => {
    playbackController.getEngine().setPitchOffsetMaxMs(ui.pitchOffsetMaxMs);
  }, [ui.pitchOffsetMaxMs]);

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

  return (
    <div className={styles.devPanel}>
      <div className={styles.header}>DEV</div>
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
