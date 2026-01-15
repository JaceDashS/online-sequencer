import React from 'react';
import styles from './DebugBufferControl.module.css';

interface DebugBufferControlProps {
  value: number;
  onChange: (value: number) => void;
}

const bufferOptions = [
  { label: 'OFF', value: 0 },
  { label: '60', value: 60 },
  { label: '120', value: 120 },
  { label: '300', value: 300 },
  { label: '600', value: 600 },
];

const DebugBufferControl: React.FC<DebugBufferControlProps> = ({ value, onChange }) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      onChange(nextValue);
    }
  };

  return (
    <div className={styles.bufferControl} title="Debug log buffer size (entries)">
      <div className={styles.bufferDisplay}>
        <span className={styles.label}>LOG</span>
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

export default DebugBufferControl;
