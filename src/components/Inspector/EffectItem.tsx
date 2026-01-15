import React, { useCallback } from 'react';
import styles from './EffectItem.module.css';
import type { Effect } from '../../types/project';

interface EffectItemProps {
  effect: Effect;
  effectIndex: number;
  trackId: string;
  onUpdate: (trackId: string, effectIndex: number, updates: Partial<Effect>) => void;
  onRemove: (trackId: string, effectIndex: number) => void;
  onReorder?: (trackId: string, fromIndex: number, toIndex: number) => void;
  isDraggable?: boolean;
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  bpm?: number;
  timeSignature?: [number, number];
}

const EffectItem: React.FC<EffectItemProps> = ({ effect, effectIndex, trackId, onUpdate, onRemove, onReorder, isDraggable = false, onDragStart, onDragEnd: onDragEndProp, isDragging: isDraggingProp, bpm: _bpm = 120, timeSignature: _timeSignature = [4, 4] }) => {
  const dragRef = React.useRef<HTMLDivElement>(null);
  const [isDraggingLocal, setIsDraggingLocal] = React.useState(false);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);
  
  // 노브 드래그 상태 관리
  const knobDragRef = React.useRef<{ paramKey: string; startValue: number; startY: number; min: number; max: number } | null>(null);
  
  const isDragging = isDraggingProp !== undefined ? isDraggingProp : isDraggingLocal;
  
  const handleToggle = useCallback(() => {
    onUpdate(trackId, effectIndex, { enabled: !effect.enabled });
  }, [trackId, effectIndex, effect.enabled, onUpdate]);

  const handleParamChange = useCallback((paramKey: string, value: number) => {
    onUpdate(trackId, effectIndex, {
      params: {
        ...effect.params,
        [paramKey]: value,
      },
    });
  }, [trackId, effectIndex, effect.params, onUpdate]);

  const handleTypeChange = useCallback((newType: 'eq' | 'delay' | 'reverb') => {
    const defaultParams: Effect['params'] = {};
    if (newType === 'eq') {
      defaultParams.lowGain = 0;
      defaultParams.midGain = 0;
      defaultParams.highGain = 0;
      defaultParams.q = 5;
    } else if (newType === 'delay') {
      defaultParams.delayDivision = 1; // 기본값: 1박자
      defaultParams.feedback = 30;
      defaultParams.mix = 30;
    } else if (newType === 'reverb') {
      defaultParams.roomSize = 50;
      defaultParams.dampening = 30;
      defaultParams.wetLevel = 30;
    }

    onUpdate(trackId, effectIndex, {
      type: newType,
      params: defaultParams,
    });
  }, [trackId, effectIndex, onUpdate]);

  const handleRemove = useCallback(() => {
    onRemove(trackId, effectIndex);
  }, [trackId, effectIndex, onRemove]);

  const renderVerticalSlider = useCallback((label: string, paramKey: string, value: number | undefined, min: number, max: number, unit: string = '') => {
    const actualValue = value ?? 0;
    return (
      <div className={styles.sliderContainer}>
        <div className={styles.sliderLabel}>{label}</div>
        <div className={styles.verticalSliderWrapper}>
          <input
            type="range"
            className={styles.verticalSlider}
            min={min}
            max={max}
            value={actualValue}
            onChange={(e) => handleParamChange(paramKey, parseFloat(e.target.value))}
            onKeyDown={(e) => {
              // 스페이스바를 누르면 기본 동작만 방지 (전역 핸들러가 capture phase에서 처리)
              if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
                e.preventDefault();
              }
            }}
          />
        </div>
        <div className={styles.sliderValue}>{Math.round(actualValue)}{unit}</div>
      </div>
    );
  }, [handleParamChange]);

  const renderHorizontalSlider = useCallback((label: string, paramKey: string, value: number | undefined, min: number, max: number, unit: string = '') => {
    const actualValue = value ?? 0;
    return (
      <div className={styles.horizontalSliderContainer}>
        <div className={styles.horizontalSliderLabel}>{label}</div>
        <div className={styles.horizontalSliderWrapper}>
          <input
            type="range"
            className={styles.horizontalSlider}
            min={min}
            max={max}
            step={0.1}
            value={actualValue}
            onChange={(e) => handleParamChange(paramKey, parseFloat(e.target.value))}
            onKeyDown={(e) => {
              // 스페이스바를 누르면 기본 동작만 방지 (전역 핸들러가 capture phase에서 처리)
              if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
                e.preventDefault();
              }
            }}
          />
        </div>
        <div className={styles.horizontalSliderValue}>{actualValue.toFixed(2)}{unit}</div>
      </div>
    );
  }, [handleParamChange]);

  const handleKnobMouseDown = useCallback((e: React.MouseEvent, paramKey: string, currentValue: number, min: number, max: number) => {
    e.preventDefault();
    e.stopPropagation();
    knobDragRef.current = {
      paramKey,
      startValue: currentValue,
      startY: e.clientY,
      min,
      max,
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!knobDragRef.current) return;
      
      const deltaY = knobDragRef.current.startY - e.clientY; // 위로 드래그하면 양수, 아래로 드래그하면 음수
      const sensitivity = 0.5; // 감도 조절
      const range = knobDragRef.current.max - knobDragRef.current.min;
      const deltaValue = (deltaY * sensitivity * range) / 200; // 200px 드래그 = 전체 범위 변화
      
      let newValue = knobDragRef.current.startValue + deltaValue;
      newValue = Math.max(knobDragRef.current.min, Math.min(knobDragRef.current.max, newValue));
      
      handleParamChange(knobDragRef.current.paramKey, newValue);
    };
    
    const handleMouseUp = () => {
      knobDragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleParamChange]);

  const renderKnob = useCallback((label: string, paramKey: string, value: number | undefined, min: number, max: number, unit: string = '') => {
    const actualValue = value ?? 0;
    const percentage = ((actualValue - min) / (max - min)) * 100;
    const rotation = (percentage / 100) * 270 - 135; // -135도에서 135도까지 회전 (270도 범위)
    
    return (
      <div className={styles.knobContainer}>
        <div className={styles.knobLabel}>{label}</div>
        <div className={styles.knobWrapper}>
          <div 
            className={styles.knobCircle}
            onMouseDown={(e) => handleKnobMouseDown(e, paramKey, actualValue, min, max)}
          >
            <div 
              className={styles.knobIndicator}
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </div>
        </div>
        <div className={styles.knobValue}>{Math.round(actualValue)}{unit}</div>
      </div>
    );
  }, [handleKnobMouseDown]);

  const renderDivisionKnob = useCallback(() => {
    // 박자 분할 옵션들 (작은 값에서 큰 값 순서 - 위로 드래그할수록 느린 박자)
    const divisionOptions = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4];
    const currentDivision = effect.params.delayDivision ?? 1;
    
    // 현재 값에 가장 가까운 인덱스 찾기
    let currentIndex = divisionOptions.indexOf(currentDivision);
    if (currentIndex < 0) {
      // 정확히 일치하지 않으면 가장 가까운 값 찾기
      let closestIndex = 0;
      let closestDiff = Math.abs(divisionOptions[0] - currentDivision);
      for (let i = 1; i < divisionOptions.length; i++) {
        const diff = Math.abs(divisionOptions[i] - currentDivision);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = i;
        }
      }
      currentIndex = closestIndex;
    }
    const normalizedIndex = currentIndex >= 0 ? currentIndex : 4; // 기본값 1박자 (인덱스 4)
    
    // 인덱스를 회전 각도로 변환 (0~6를 -135~135도로)
    const percentage = normalizedIndex / (divisionOptions.length - 1);
    const rotation = percentage * 270 - 135;
    
    const handleDivisionKnobMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const startIndex = normalizedIndex;
      const startY = e.clientY;
      let lastAppliedIndex = startIndex;
      
      const handleMouseMove = (e: MouseEvent) => {
        const deltaY = startY - e.clientY; // 위로 드래그하면 양수, 아래로 드래그하면 음수
        const sensitivity = 20; // 20px당 1단계 이동
        const steps = Math.round(deltaY / sensitivity);
        const newIndex = Math.max(0, Math.min(divisionOptions.length - 1, startIndex + steps));
        
        // 인덱스가 변경되었을 때만 업데이트
        if (newIndex !== lastAppliedIndex) {
          lastAppliedIndex = newIndex;
          handleParamChange('delayDivision', divisionOptions[newIndex]);
        }
      };
      
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };
    
    const getDivisionLabel = (division: number): string => {
      if (division === 0.0625) return '1/16';
      if (division === 0.125) return '1/8';
      if (division === 0.25) return '1/4';
      if (division === 0.5) return '1/2';
      if (division === 1) return '1';
      if (division === 2) return '2';
      if (division === 4) return '4';
      // 일반적인 경우 분수로 표시
      if (division < 1) {
        const denominator = Math.round(1 / division);
        return `1/${denominator}`;
      }
      return division.toString();
    };
    
    return (
      <div className={styles.knobContainer}>
        <div className={styles.knobLabel}>Timing</div>
        <div className={styles.knobWrapper}>
          <div 
            className={styles.knobCircle}
            onMouseDown={handleDivisionKnobMouseDown}
          >
            <div 
              className={styles.knobIndicator}
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </div>
        </div>
        <div className={styles.knobValue}>{getDivisionLabel(currentDivision)}</div>
      </div>
    );
  }, [effect.params.delayDivision, handleParamChange]);

  const renderControls = useCallback(() => {
    switch (effect.type) {
      case 'eq':
        return (
          <>
            <div className={styles.effectControls}>
              {renderKnob('Low', 'lowGain', effect.params.lowGain, -12, 12, 'dB')}
              {renderKnob('Mid', 'midGain', effect.params.midGain, -12, 12, 'dB')}
              {renderKnob('High', 'highGain', effect.params.highGain, -12, 12, 'dB')}
            </div>
            <div className={styles.effectControlsQ}>
              {renderHorizontalSlider('Q', 'q', effect.params.q, 0.1, 10, '')}
            </div>
          </>
        );
      case 'delay':
        return (
          <div className={styles.effectControls}>
            {renderDivisionKnob()}
            {renderKnob('Feedback', 'feedback', effect.params.feedback, 0, 100, '%')}
            {renderKnob('Mix', 'mix', effect.params.mix, 0, 100, '%')}
          </div>
        );
      case 'reverb':
        return (
          <div className={styles.effectControls}>
            {renderKnob('Room', 'roomSize', effect.params.roomSize, 0, 100, '%')}
            {renderKnob('Damp', 'dampening', effect.params.dampening, 0, 100, '%')}
            {renderKnob('Wet', 'wetLevel', effect.params.wetLevel, 0, 100, '%')}
          </div>
        );
      default:
        return null;
    }
  }, [effect.type, effect.params, renderVerticalSlider, renderHorizontalSlider, renderKnob, renderDivisionKnob]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!isDraggable || !onReorder) return;
    if (onDragStart) {
      onDragStart(effectIndex);
    } else {
      setIsDraggingLocal(true);
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', effectIndex.toString());
    if (dragRef.current) {
      dragRef.current.style.opacity = '0.5';
    }
  }, [isDraggable, onReorder, onDragStart, effectIndex]);

  const handleDragEnd = useCallback(() => {
    if (onDragEndProp) {
      onDragEndProp();
    } else {
      setIsDraggingLocal(false);
    }
    setDragOverIndex(null);
    if (dragRef.current) {
      dragRef.current.style.opacity = '1';
    }
  }, [onDragEndProp]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isDraggable || !onReorder) return;
    e.preventDefault();
    e.stopPropagation(); // 부모의 드래그 이벤트와 충돌 방지
    e.dataTransfer.dropEffect = 'move';
  }, [isDraggable, onReorder]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    // Inspector에서 드롭을 처리하므로 여기서는 처리하지 않음
    e.preventDefault();
    setDragOverIndex(null);
  }, []);

  const handleDragEnter = useCallback(() => {
    if (isDraggable) {
      setDragOverIndex(effectIndex);
    }
  }, [isDraggable, effectIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  return (
    <div 
      ref={dragRef}
      className={`${styles.effectItem} ${!effect.enabled ? styles.effectDisabled : ''} ${isDragging ? styles.effectDragging : ''} ${dragOverIndex === effectIndex ? styles.effectDragOver : ''}`}
    >
      {/* 드래그 핸들 바 */}
      {isDraggable && (
        <div 
          className={styles.dragHandle}
          draggable={isDraggable}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        />
      )}
        <div className={styles.effectHeader}>
          <button
            className={styles.effectToggle}
            onClick={handleToggle}
            title={effect.enabled ? 'Disable' : 'Enable'}
          >
            <svg 
              className={styles.powerIcon} 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* IEC Power Symbol: Circle */}
              <circle 
                cx="12" 
                cy="12" 
                r="9" 
                stroke="currentColor" 
                strokeWidth="2" 
                fill="none"
              />
              {/* Vertical line for ON state */}
              {effect.enabled && (
                <line 
                  x1="12" 
                  y1="6" 
                  x2="12" 
                  y2="12" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        <select
          className={styles.effectTypeSelect}
          value={effect.type}
          onChange={(e) => handleTypeChange(e.target.value as 'eq' | 'delay' | 'reverb')}
        >
          <option value="eq">EQ</option>
          <option value="delay">Delay</option>
          <option value="reverb">Reverb</option>
        </select>
        <button
          className={styles.effectRemove}
          onClick={handleRemove}
          title="Remove"
        >
          ×
        </button>
      </div>
      {effect.enabled && renderControls()}
    </div>
  );
};

// React.memo로 감싸서 props가 변경될 때만 리렌더링
export default React.memo(EffectItem, (prevProps, nextProps) => {
  // effect 객체는 깊은 비교가 필요하므로 JSON.stringify 사용
  // 성능상 중요한 경우에만 사용 (effect 객체가 크지 않을 때)
  return (
    prevProps.effectIndex === nextProps.effectIndex &&
    prevProps.trackId === nextProps.trackId &&
    prevProps.isDraggable === nextProps.isDraggable &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.effect.enabled === nextProps.effect.enabled &&
    prevProps.effect.type === nextProps.effect.type &&
    JSON.stringify(prevProps.effect.params) === JSON.stringify(nextProps.effect.params) &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.onRemove === nextProps.onRemove &&
    prevProps.onReorder === nextProps.onReorder &&
    prevProps.onDragStart === nextProps.onDragStart &&
    prevProps.onDragEnd === nextProps.onDragEnd
  );
});
