import React from 'react';
import styles from './PanelToggleButtons.module.css';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { BREAKPOINTS } from '../../constants/ui';

interface PanelToggleButtonsProps {
  showTrackList: boolean;
  showInspector: boolean;
  showMixer: boolean;
  onTrackListToggle: () => void;
  onInspectorToggle: () => void;
  onMixerToggle: () => void;
}

const PanelToggleButtons: React.FC<PanelToggleButtonsProps> = ({
  showTrackList,
  showInspector,
  showMixer,
  onTrackListToggle,
  onInspectorToggle,
  onMixerToggle,
}) => {
  const windowWidth = useWindowWidth();
  const isVeryNarrowScreen = windowWidth <= BREAKPOINTS.HIDE_PANEL_TOGGLES;
  
  // 화면이 매우 좁을 때는 버튼들을 숨김
  if (isVeryNarrowScreen) {
    return null;
  }
  
  return (
    <div className={styles.panelToggleButtons}>
      <button
        className={`${styles.toggleButton} ${showTrackList ? styles.active : ''}`}
        onClick={onTrackListToggle}
        title={showTrackList ? 'Hide Track List' : 'Show Track List'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="4" width="18" height="2" rx="1" fill="currentColor"/>
          <rect x="3" y="11" width="18" height="2" rx="1" fill="currentColor"/>
          <rect x="3" y="18" width="18" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button
        className={`${styles.toggleButton} ${showInspector ? styles.active : ''}`}
        onClick={onInspectorToggle}
        title={showInspector ? 'Hide Inspector' : 'Show Inspector'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8C13.1 8 14 7.1 14 6C14 4.9 13.1 4 12 4C10.9 4 10 4.9 10 6C10 7.1 10.9 8 12 8ZM12 10C10.9 10 10 10.9 10 12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12C14 10.9 13.1 10 12 10ZM12 16C10.9 16 10 16.9 10 18C10 19.1 10.9 20 12 20C13.1 20 14 19.1 14 18C14 16.9 13.1 16 12 16Z" fill="currentColor"/>
          <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
          <rect x="2" y="10" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
          <rect x="2" y="18" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      </button>
      <button
        className={`${styles.toggleButton} ${showMixer ? styles.active : ''}`}
        onClick={onMixerToggle}
        title={showMixer ? 'Hide Mixer' : 'Show Mixer'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="6" width="4" height="12" rx="1" fill="currentColor"/>
          <rect x="8" y="10" width="4" height="8" rx="1" fill="currentColor"/>
          <rect x="14" y="4" width="4" height="14" rx="1" fill="currentColor"/>
          <rect x="20" y="8" width="4" height="10" rx="1" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
};

export default PanelToggleButtons;
