import React from 'react';
import styles from './AudioBufferControl.module.css';
import { AUDIO_BUFFER_CONSTANTS } from '../../constants/ui';

interface AudioBufferControlProps {
  value: number;
  onChange: (value: number) => void;
}

const bufferOptions = AUDIO_BUFFER_CONSTANTS.BUFFER_SIZES.map((size) => ({
  label: String(size),
  value: size,
}));

const AudioBufferControl: React.FC<AudioBufferControlProps> = ({ value, onChange }) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <div className={styles.bufferControl} title="Audio buffer size (frames)">
      <div className={styles.bufferDisplay}>
        <span className={styles.label}>BUF</span>
        <span className={styles.separator}>|</span>
        <select className={styles.select} value={value} onChange={handleChange}>
          {bufferOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default AudioBufferControl;
