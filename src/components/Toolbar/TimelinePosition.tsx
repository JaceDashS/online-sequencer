import React, { useEffect, useRef } from 'react';
import styles from './TimelinePosition.module.css';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';

interface TimelinePositionProps {
  bpm: number;
  timeSignature: [number, number];
  onTimeSignatureChange: (timeSignature: [number, number]) => void;
}

const TimelinePosition: React.FC<TimelinePositionProps> = ({ 
  bpm, 
  timeSignature,
  onTimeSignatureChange,
}) => {
  const timeSignatureRef = useRef(timeSignature);
  
  // Keep ref in sync with prop
  useEffect(() => {



    timeSignatureRef.current = timeSignature;
  }, [timeSignature]);

  // 플레이 헤드 위치를 기반으로 시간과 마디 계산
  const currentTime = usePlaybackTime();
  
  // 마디 계산 (타임 시그니처 사용)
  const beatsPerMeasure = timeSignature[0];
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit; // 4/4면 1, 6/8이면 0.5
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
  const currentMeasure = Math.floor(currentTime / secondsPerMeasure) + 1;

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 100);
    return `${minutes}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const handleBeatsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const numValue = parseInt(e.target.value, 10);
    onTimeSignatureChange([numValue, timeSignature[1]]);
  };

  const handleBeatUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const numValue = parseInt(e.target.value, 10);
    onTimeSignatureChange([timeSignature[0], numValue]);
  };

  const handleBeatsWheel = (e: React.WheelEvent<HTMLSelectElement>) => {



    e.preventDefault();
    const currentTS = timeSignatureRef.current;
    const currentIndex = currentTS[0] - 2;
    const options = Array.from({ length: 15 }, (_, i) => i + 2);
    const delta = e.deltaY > 0 ? 1 : -1;
    const newIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
    const newValue = options[newIndex];



    onTimeSignatureChange([newValue, currentTS[1]]);



  };

  const handleBeatUnitWheel = (e: React.WheelEvent<HTMLSelectElement>) => {



    e.preventDefault();
    const currentTS = timeSignatureRef.current;
    const options = [4, 8, 16];
    const currentIndex = options.indexOf(currentTS[1]);
    const delta = e.deltaY > 0 ? 1 : -1;
    const newIndex = Math.max(0, Math.min(options.length - 1, currentIndex + delta));
    const newValue = options[newIndex];



    onTimeSignatureChange([currentTS[0], newValue]);



  };

  return (
    <div className={styles.timelinePosition}>
      <div className={styles.timeDisplay}>
        <svg className={styles.icon} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
          <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span className={styles.timeValue}>{formatTime(currentTime)}</span>
      </div>
      <div className={styles.measureDisplay}>
        <svg className={styles.icon} width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
          <path d="M9 3V21M15 3V21" stroke="currentColor" strokeWidth="2"/>
        </svg>
        <span className={styles.measureValue}>{currentMeasure}</span>
      </div>
      <div className={styles.timeSignatureDisplay}>
        <select
          className={styles.timeSignatureSelect}
          value={timeSignature[0]}
          onChange={handleBeatsChange}
          onWheel={handleBeatsWheel}
        >
          {Array.from({ length: 15 }, (_, i) => i + 2).map((num) => (
            <option key={num} value={num}>
              {num}
            </option>
          ))}
        </select>
        <span className={styles.timeSignatureSeparator}>/</span>
        <select
          className={styles.timeSignatureSelect}
          value={timeSignature[1]}
          onChange={handleBeatUnitChange}
          onWheel={handleBeatUnitWheel}
        >
          <option value={4}>4</option>
          <option value={8}>8</option>
          <option value={16}>16</option>
        </select>
      </div>
    </div>
  );
};

export default TimelinePosition;
