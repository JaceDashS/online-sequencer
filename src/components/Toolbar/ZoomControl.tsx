import React from 'react';
import styles from './ZoomControl.module.css';

interface ZoomControlProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

const ZoomControl: React.FC<ZoomControlProps> = ({
  value,
  min = 10,
  max = 200,
  onChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    onChange(newValue);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -5 : 5;
    const newValue = Math.max(min, Math.min(max, value + delta));
    onChange(newValue);
  };

  return (
    <div className={styles.zoomControl} onWheel={handleWheel}>
      <div className={styles.sliderWrapper}>
        <input
          type="range"
          className={styles.slider}
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
        />
      </div>
    </div>
  );
};

export default ZoomControl;
