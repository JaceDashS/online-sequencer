import React from 'react';
import styles from './QuantizeButton.module.css';

interface QuantizeButtonProps {
  isActive: boolean;
  onToggle: () => void;
  isMetronomeOn?: boolean;
  onMetronomeToggle?: () => void;
  isAutoScrollEnabled?: boolean;
  onAutoScrollToggle?: () => void;
}

const QuantizeButton: React.FC<QuantizeButtonProps> = ({ 
  isActive, 
  onToggle,
  isMetronomeOn = false,
  onMetronomeToggle,
  isAutoScrollEnabled = false,
  onAutoScrollToggle
}) => {
  return (
    <div className={styles.quantizeButton}>
      {onMetronomeToggle && (
        <button 
          className={`${styles.metronomeButton} ${isMetronomeOn ? styles.metronomeActive : ''}`} 
          onClick={(e) => {
            e.stopPropagation();
            onMetronomeToggle();
          }}
          title="Metronome"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* 메트로놈 본체 (삼각형) */}
            <path d="M12 4L18 18H6L12 4Z" fill="currentColor"/>
            {/* 진자 줄 */}
            <line x1="12" y1="12" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            {/* 진자 추 */}
            <circle cx="12" cy="18" r="2" fill="currentColor"/>
          </svg>
        </button>
      )}
      <div 
        className={styles.buttonWrapper}
        onClick={onToggle}
      >
        <span className={`${styles.buttonText} ${isActive ? styles.active : ''}`}>Q</span>
      </div>
      {onAutoScrollToggle && (
        <button
          className={`${styles.autoScrollButton} ${isAutoScrollEnabled ? styles.autoScrollActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onAutoScrollToggle();
          }}
          title="Auto Scroll (F)"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* 위로 향한 삼각형 (높이 = 밑면의 반 = 12, 위쪽에 위치) */}
            <path d="M0 0L12 12L24 0Z" fill="currentColor"/>
            {/* 아래 선 (높이 = 밑면의 반 = 12, 아래쪽에 위치) */}
            <line x1="12" y1="12" x2="12" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
};

export default QuantizeButton;
