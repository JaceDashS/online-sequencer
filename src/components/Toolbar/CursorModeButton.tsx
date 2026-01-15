import React from 'react';
import styles from './CursorModeButton.module.css';

import { isSplitMode } from '../../store/uiStore';

interface CursorModeButtonProps {
  cursorMode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null;
  mergeFlashActive?: boolean;
  duplicateModeActive?: boolean;
  duplicateFlashActive?: boolean;
  hasSelectedParts?: boolean;
  isHoveringPart?: boolean;
  isDraggingPart?: boolean;
  onSplitToggle: () => void;
  onMergeToggle: () => void;
  onDuplicate?: () => void;
}

const CursorModeButton: React.FC<CursorModeButtonProps> = ({ 
  cursorMode,
  mergeFlashActive,
  duplicateModeActive = false,
  duplicateFlashActive = false,
  hasSelectedParts = false,
  isHoveringPart = false,
  isDraggingPart = false,
  onSplitToggle,
  onMergeToggle,
  onDuplicate
}) => {
  const isSplitActive = isSplitMode(cursorMode);
  const isMergeActive = cursorMode === 'mergeByKey4' || mergeFlashActive;
  const isDuplicateActive = duplicateModeActive || duplicateFlashActive;
  
  return (
    <div className={styles.splitMergeButton}>
      <div 
        className={styles.buttonWrapper}
        onClick={onSplitToggle}
      >
        <span className={`${styles.buttonText} ${isSplitActive ? `${styles.active} ${styles.splitActive}` : ''}`}>Split</span>
      </div>
      <div className={styles.separator}>|</div>
      <div 
        className={styles.buttonWrapper}
        onClick={onMergeToggle}
      >
        <span className={`${styles.buttonText} ${isMergeActive ? `${styles.active} ${styles.mergeActive}` : ''}`}>Merge</span>
      </div>
      <div className={styles.separator}>|</div>
      {onDuplicate && (
        <div 
          className={`${styles.buttonWrapper} ${!hasSelectedParts ? styles.disabled : ''} ${(isHoveringPart || isDraggingPart) ? styles.hoveringPart : ''}`}
          onClick={hasSelectedParts ? onDuplicate : undefined}
        >
          <span className={`${styles.buttonText} ${isDuplicateActive ? `${styles.active} ${styles.duplicateActive}` : ''}`}>Duplicate</span>
        </div>
      )}
    </div>
  );
};

export default CursorModeButton;

