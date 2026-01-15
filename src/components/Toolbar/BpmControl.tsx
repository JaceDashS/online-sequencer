import React, { useState, useRef, useEffect } from 'react';
import styles from './BpmControl.module.css';

interface BpmControlProps {
  initialBpm?: number;
  onBpmChange?: (bpm: number) => void;
}

const BpmControl: React.FC<BpmControlProps> = ({ initialBpm = 120, onBpmChange }) => {
  const [bpm, setBpm] = useState(initialBpm);
  const [inputValue, setInputValue] = useState<string>(initialBpm.toString());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartBpm, setDragStartBpm] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // initialBpm이 변경되면 내부 상태 업데이트 (입력 필드가 포커스되어 있지 않을 때만)
  useEffect(() => {
    if (!isInputFocused && initialBpm !== bpm) {
      setBpm(initialBpm);
      setInputValue(initialBpm.toString());
    }
  }, [initialBpm, isInputFocused, bpm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // 빈 문자열이면 그대로 허용 (입력 중일 수 있음)
    if (value === '') {
      setInputValue('');
      return;
    }
    
    // 숫자가 아닌 문자 제거
    value = value.replace(/[^0-9]/g, '');
    
    // 앞의 0 제거 (예: "0120" -> "120")
    value = value.replace(/^0+/, '') || '';
    
    // 빈 문자열이면 '0'으로 설정하지 않고 그대로 둠
    setInputValue(value);
  };

  const handleInputBlur = () => {
    let numValue: number;
    
    if (inputValue === '' || inputValue === '0') {
      numValue = 120; // 기본값
    } else {
      numValue = parseInt(inputValue, 10);
      if (isNaN(numValue)) {
        numValue = 120;
      } else {
        // 범위 제한
        numValue = Math.max(30, Math.min(400, numValue));
      }
    }
    
    setBpm(numValue);
    setInputValue(numValue.toString());
    onBpmChange?.(numValue);
    setIsInputFocused(false);
  };

  const handleInputFocus = () => {
    setIsInputFocused(true);
    setInputValue(bpm.toString());
  };

  const handleWheel = (e: React.WheelEvent) => {
    // 입력 필드가 포커스되어 있으면 휠 스크롤 비활성화
    if (isInputFocused) {
      return;
    }
    
    e.preventDefault();
    
    // deltaY가 양수면 아래로 스크롤 (감소), 음수면 위로 스크롤 (증가)
    const delta = e.deltaY > 0 ? -1 : 1;
    const newBpm = Math.max(30, Math.min(400, bpm + delta));
    
    if (newBpm !== bpm) {
      setBpm(newBpm);
      setInputValue(newBpm.toString());
      onBpmChange?.(newBpm);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // 입력 필드가 포커스되어 있으면 드래그 비활성화
    if (isInputFocused) {
      return;
    }
    
    // 입력 필드를 직접 클릭한 경우도 드래그 시작 가능 (마우스 이동 시에만 드래그)
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartBpm(bpm);
    
    // 입력 필드를 클릭한 경우가 아니면 기본 동작 방지
    if (!(e.target instanceof HTMLElement) || e.target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    let hasMoved = false;
    const moveThreshold = 3; // 3픽셀 이상 움직여야 드래그로 인식

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = Math.abs(dragStartY - e.clientY);
      
      // 일정 거리 이상 움직였을 때만 드래그로 인식
      if (deltaY > moveThreshold) {
        hasMoved = true;
        const deltaY = dragStartY - e.clientY; // 위로 드래그하면 증가
        const sensitivity = 0.5; // 드래그 감도
        const newBpm = Math.round(dragStartBpm + deltaY * sensitivity);
        const clampedBpm = Math.max(30, Math.min(400, newBpm));
        
        if (clampedBpm !== bpm) {
          setBpm(clampedBpm);
          setInputValue(clampedBpm.toString());
          onBpmChange?.(clampedBpm);
        }
      }
    };

    const handleMouseUp = () => {
      // 클릭만 했고 드래그하지 않았으면 입력 필드 포커스
      if (!hasMoved && inputRef.current && !isInputFocused) {
        // 약간의 지연을 두어 클릭 이벤트가 먼저 처리되도록 함
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 0);
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartY, dragStartBpm, bpm, onBpmChange, isInputFocused]);

  return (
    <div className={styles.bpmControl} ref={containerRef}>
      <div className={styles.bpmDisplay}>
        <span className={styles.label}>BPM</span>
        <span className={styles.separator}>|</span>
        <div 
          className={`${styles.inputWrapper} ${isDragging ? styles.dragging : ''}`}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className={styles.input}
            value={isInputFocused ? inputValue : bpm.toString()}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
        </div>
      </div>
    </div>
  );
};

export default BpmControl;
