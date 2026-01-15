import React, { useState } from 'react';
import styles from './TrackHeightSlider.module.css';
import type { TrackListRef } from './TrackList';

interface TrackHeightSliderProps {
  trackListRef?: React.RefObject<TrackListRef | null>;
  onSliderValueChange?: (value: number) => void;
  sliderValue?: number;
}

const TrackHeightSlider: React.FC<TrackHeightSliderProps> = ({ trackListRef, onSliderValueChange, sliderValue: externalSliderValue }) => {
  const [internalSliderValue, setInternalSliderValue] = useState(70); // 기본 높이 70px
  const sliderValue = externalSliderValue !== undefined ? externalSliderValue : internalSliderValue;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (externalSliderValue === undefined) {
      setInternalSliderValue(value);
    }
    if (onSliderValueChange) {
      onSliderValueChange(value);
    }
    
    // 모든 트랙 높이 일괄 변경
    if (trackListRef?.current) {
      trackListRef.current.setAllTrackHeights(value);
    }
  };

  return (
    <div className={styles.sliderContainer}>
      <input 
        type="range" 
        className={styles.slider}
        min="35"
        max="200"
        value={sliderValue}
        onChange={handleSliderChange}
      />
    </div>
  );
};

export default TrackHeightSlider;
