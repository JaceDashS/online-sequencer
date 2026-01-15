import { useEffect } from 'react';

/**
 * useMidiEditorScrollSync 훅 Props
 * Phase 7.9.6: 스크롤 동기화 로직을 훅으로 추출
 */
export interface UseMidiEditorScrollSyncProps {
  // Refs
  pianoRollContainerRef: React.RefObject<HTMLDivElement | null>;
  measureRulerRef: React.RefObject<HTMLDivElement | null>;
  pianoKeysRef: React.RefObject<HTMLDivElement | null>;
  velocityGraphAreaRef: React.RefObject<HTMLDivElement | null>;
  lastProgrammaticScrollLeftRef: React.MutableRefObject<number | null>;
  
  // Functions
  scheduleVisibleRangeUpdate: () => void;
}

/**
 * useMidiEditorScrollSync 훅 반환 타입
 */
export interface UseMidiEditorScrollSyncReturn {
  // 현재는 반환값 없음 (내부에서 직접 상태 업데이트)
}

/**
 * 스크롤 동기화 로직을 관리하는 훅
 * Phase 7.9.6: 스크롤 동기화 로직을 훅으로 추출
 */
export const useMidiEditorScrollSync = ({
  pianoRollContainerRef,
  measureRulerRef,
  pianoKeysRef,
  velocityGraphAreaRef,
  lastProgrammaticScrollLeftRef,
  scheduleVisibleRangeUpdate,
}: UseMidiEditorScrollSyncProps): UseMidiEditorScrollSyncReturn => {
  
  useEffect(() => {
    const pianoRollContainer = pianoRollContainerRef.current;
    const rulerContainer = measureRulerRef.current;
    const pianoKeysScroll = pianoKeysRef.current;
    if (!pianoRollContainer) return;

    let isSyncing = false; // 무한 루프 방지

    const handleScroll = () => {
      // momentum scrolling 차단: 우리가 설정한 값과 다른 경우 (momentum scrolling으로 인한 변경), 다시 설정
      const lastProgrammatic = lastProgrammaticScrollLeftRef.current;
      if (lastProgrammatic !== null) {
        const diff = Math.abs(pianoRollContainer.scrollLeft - lastProgrammatic);
        // 값이 다르면 (momentum scrolling 또는 다른 변경), 다시 설정
        if (diff > 0.5) {
          if (isSyncing) return; // 무한 루프 방지
          isSyncing = true;
          pianoRollContainer.scrollLeft = lastProgrammatic;
          isSyncing = false;
          return; // momentum scrolling으로 인한 변경이므로 동기화하지 않음
        }
        // 값이 같으면 (정확히 우리가 설정한 값), 추적 유지하되 동기화 진행
        // lastProgrammaticScrollLeftRef는 유지 (requestAnimationFrame이나 timeout에서 해제)
      } else {
        // 프로그래밍 방식이 아니므로 추적 해제 (다른 곳에서 스크롤한 경우)
      }
      
      if (isSyncing) return;
      isSyncing = true;
      
      scheduleVisibleRangeUpdate();

      // 룰러의 가로 스크롤 동기화
      if (rulerContainer) {
        rulerContainer.scrollLeft = pianoRollContainer.scrollLeft;
      }

      const velocityGraphArea = velocityGraphAreaRef.current;
      if (velocityGraphArea) {
        const targetScrollLeft = pianoRollContainer.scrollLeft;
        // scrollLeft를 직접 설정하면 스크롤 이벤트가 발생할 수 있으므로, 값이 다를 때만 설정
        if (Math.abs(velocityGraphArea.scrollLeft - targetScrollLeft) > 0.1) {
          velocityGraphArea.scrollLeft = targetScrollLeft;
        }
      }

      // 피아노 키(키보드)와 세로 스크롤 동기화
      if (pianoKeysScroll && Math.abs(pianoKeysScroll.scrollTop - pianoRollContainer.scrollTop) > 1) {
        pianoKeysScroll.scrollTop = pianoRollContainer.scrollTop;
      }
      
      isSyncing = false;
    };

    const handlePianoKeysScroll = () => {
      if (isSyncing) return;
      isSyncing = true;

      if (pianoKeysScroll && Math.abs(pianoRollContainer.scrollTop - pianoKeysScroll.scrollTop) > 1) {
        pianoRollContainer.scrollTop = pianoKeysScroll.scrollTop;
      }

      isSyncing = false;
    };

    const handleRulerScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      
      if (pianoRollContainer && rulerContainer) {
        pianoRollContainer.scrollLeft = rulerContainer.scrollLeft;
      }
      
      const velocityGraphArea = velocityGraphAreaRef.current;
      if (velocityGraphArea && rulerContainer) {
        velocityGraphArea.scrollLeft = rulerContainer.scrollLeft;
      }
      
      isSyncing = false;
    };

    // velocityGraphArea의 스크롤 이벤트 리스너는 제거
    // 벨로시티 영역에서 스크롤 신호가 벨로시티 영역으로 가지 않고 레인 영역으로만 가야 하므로
    // velocityGraphArea의 스크롤 이벤트는 무시함
    // handleScroll에서만 velocityGraphArea를 동기화함
    
    pianoRollContainer.addEventListener('scroll', handleScroll);
    if (pianoKeysScroll) {
      pianoKeysScroll.addEventListener('scroll', handlePianoKeysScroll);
    }
    if (rulerContainer) {
      rulerContainer.addEventListener('scroll', handleRulerScroll);
    }
    // velocityGraphArea의 스크롤 이벤트 리스너는 제거
    // 벨로시티 영역에서 스크롤 신호가 벨로시티 영역으로 가지 않고 레인 영역으로만 가야 하므로
    // velocityGraphArea의 스크롤 이벤트는 무시함
    // handleScroll에서만 velocityGraphArea를 동기화함

    return () => {
      pianoRollContainer.removeEventListener('scroll', handleScroll);
      if (pianoKeysScroll) {
        pianoKeysScroll.removeEventListener('scroll', handlePianoKeysScroll);
      }
      if (rulerContainer) {
        rulerContainer.removeEventListener('scroll', handleRulerScroll);
      }
      // velocityGraphArea의 스크롤 이벤트 리스너는 더 이상 필요 없음
    };
  }, [scheduleVisibleRangeUpdate, pianoRollContainerRef, measureRulerRef, pianoKeysRef, velocityGraphAreaRef, lastProgrammaticScrollLeftRef]);

  return {};
};

