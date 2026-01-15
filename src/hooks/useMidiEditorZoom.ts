import { useState, useRef, useEffect } from 'react';
import { MIDI_EDITOR_CONSTANTS } from '../constants/ui';
import type { MidiPart } from '../types/project';

/**
 * useMidiEditorZoom 훅 Props
 */
export interface UseMidiEditorZoomProps {
  /** MIDI 파트 */
  part: MidiPart | null;
  /** 파트 duration (초) */
  partDuration: number;
  /** 초기 픽셀/초 */
  initialPixelsPerSecond: number;
  /** 피아노 롤 컨테이너 ref */
  pianoRollContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * useMidiEditorZoom 훅 반환 타입
 */
export interface UseMidiEditorZoomReturn {
  /** 현재 픽셀/초 (줌 레벨) */
  pixelsPerSecond: number | null;
  /** 픽셀/초 설정 함수 */
  setPixelsPerSecond: (value: number) => void;
  /** 사용자가 줌을 수동으로 조정했는지 여부 */
  hasUserAdjustedZoom: boolean;
  /** 사용자가 줌을 수동으로 조정했는지 여부 설정 함수 */
  setHasUserAdjustedZoom: (value: boolean) => void;
  /** 줌 계산 중인지 여부 */
  isCalculatingZoom: boolean;
  /** 컨테이너 렌더링 완료 여부 */
  isContainerReady: boolean;
  /** 최소 줌 레벨 */
  minZoom: number | null;
}

/**
 * MIDI 에디터 줌 계산 로직을 관리하는 훅
 * Phase 7.9.2: 줌 계산 로직을 훅으로 추출
 */
export const useMidiEditorZoom = ({
  part,
  partDuration,
  initialPixelsPerSecond,
  pianoRollContainerRef,
}: UseMidiEditorZoomProps): UseMidiEditorZoomReturn => {
  // 줌 상태 (내부에서 관리)
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number | null>(null);
  const [hasUserAdjustedZoom, setHasUserAdjustedZoom] = useState(false);
  const [isCalculatingZoom, setIsCalculatingZoom] = useState(true);
  const [isContainerReady, setIsContainerReady] = useState(false); // 컨테이너 렌더링 완료 여부
  
  // SSOT: 로드 시 한 번만 계산된 최소 줌 값 (슬라이더 min 속성에 사용)
  const [minZoom, setMinZoom] = useState<number | null>(null);
  
  const resizeDebounceRef = useRef<number | null>(null);
  
  // 줌 범위 설정
  const MIN_ZOOM = MIDI_EDITOR_CONSTANTS.MIN_ZOOM;
  const MAX_ZOOM = MIDI_EDITOR_CONSTANTS.MAX_ZOOM;

  // 컨테이너가 렌더링되고 실제 너비가 측정될 때까지 대기
  useEffect(() => {
    if (!part || isContainerReady) return;
    
    const checkContainer = () => {
      if (pianoRollContainerRef.current) {
        const containerWidth = pianoRollContainerRef.current.clientWidth;
        if (containerWidth > 0) {
          setIsContainerReady(true);
          return true;
        }
      }
      return false;
    };
    
    // 즉시 확인
    if (checkContainer()) {
      return;
    }
    
    // 여러 프레임에 걸쳐 확인 (최대 10번 시도)
    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = setInterval(() => {
      attempts++;
      if (checkContainer() || attempts >= maxAttempts) {
        clearInterval(checkInterval);
        if (attempts >= maxAttempts) {
          // 타임아웃 시에도 준비 완료로 표시 (예상값 사용)
          setIsContainerReady(true);
        }
      }
    }, 16); // 약 60fps
    
    return () => clearInterval(checkInterval);
  }, [part, isContainerReady, pianoRollContainerRef]);

  // 클립 길이에 따라 기본 pixelsPerSecond 자동 계산 (컨테이너가 준비된 후)
  // useRef로 계산 완료 여부 추적하여 중복 실행 방지
  const hasCalculatedRef = useRef(false);
  useEffect(() => {
    // 이미 계산했으면 다시 계산하지 않음
    if (hasCalculatedRef.current) {
      return;
    }
    
    // isCalculatingZoom이 false면 이미 계산 완료된 상태
    if (!isCalculatingZoom) {
      return;
    }
    
    // 컨테이너가 준비되지 않았으면 대기
    if (!isContainerReady) {
      return;
    }
    
    // clip이 없으면 기본값 사용하고 계산 종료
    if (!part) {
      return;
    }
    
    // 실제 컨테이너 너비 측정 (반드시 준비된 상태)
    let availableWidth = 0;
    if (pianoRollContainerRef.current) {
      availableWidth = pianoRollContainerRef.current.clientWidth;
    }
    
    // 컨테이너가 없거나 너비가 0이면 예상값 사용
    if (availableWidth <= 0) {
      const viewportWidth = window.innerWidth;
      const editorWidth = Math.min(viewportWidth * MIDI_EDITOR_CONSTANTS.EDITOR_WIDTH_RATIO, MIDI_EDITOR_CONSTANTS.EDITOR_MAX_WIDTH);
      const pianoKeysWidth = MIDI_EDITOR_CONSTANTS.PIANO_KEYS_WIDTH;
      availableWidth = editorWidth - pianoKeysWidth;
    }
    
    if (availableWidth <= 0 || partDuration <= 0) {
      // 계산 실패 시 기본값 사용
      // SSOT: minZoom도 기본값으로 설정
      if (minZoom === null) {
        setMinZoom(MIN_ZOOM);
      }
      setPixelsPerSecond(initialPixelsPerSecond);
      setIsCalculatingZoom(false);
      hasCalculatedRef.current = true;
      return;
    }
    
    // 파트 전체가 정확히 보이도록 계산: pixelsPerSecond = availableWidth / partDuration
    // 이것이 최소 zoom (파트 전체가 보이는 상태)
    // contentWidth = partDuration * pixelsPerSecond = availableWidth가 되어야 함
    const minZoomForPart = availableWidth / partDuration;
    
    // MIN_ZOOM보다 작으면 MIN_ZOOM 사용, MAX_ZOOM보다 크면 MAX_ZOOM 사용
    // 파트 전체가 보이는 최소 zoom 값
    const clampedPixelsPerSecond = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, minZoomForPart));
    
    // SSOT: minZoom을 한 번만 설정 (이후 변경하지 않음)
    if (minZoom === null) {
      setMinZoom(clampedPixelsPerSecond);
    }
    
    // 초기 zoom을 최소값(파트 전체가 보이는 상태)으로 설정
    // React가 자동으로 리렌더링하여 이 값이 적용됨
    setPixelsPerSecond(clampedPixelsPerSecond);
    setIsCalculatingZoom(false);
    hasCalculatedRef.current = true;
  }, [part, initialPixelsPerSecond, isCalculatingZoom, partDuration, isContainerReady, minZoom, pianoRollContainerRef]);

  // 실제 컨테이너가 렌더링된 후 실제 너비로 재계산 (예상값을 사용한 경우)
  useEffect(() => {
    if (!part || isCalculatingZoom || hasUserAdjustedZoom || !pixelsPerSecond) {
      return;
    }
    
    // 실제 컨테이너가 렌더링될 때까지 여러 번 시도
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkAndRecalculate = () => {
      attempts++;
      
      if (pianoRollContainerRef.current) {
        const actualWidth = pianoRollContainerRef.current.clientWidth;
        
        if (actualWidth > 0 && partDuration > 0) {
          // 현재 pixelsPerSecond로 계산된 contentWidth
          const currentContentWidth = partDuration * pixelsPerSecond;
          // 실제 컨테이너 너비와 차이가 5px 이상이면 재계산
          if (Math.abs(actualWidth - currentContentWidth) > 5) {
            const newMinZoomForPart = actualWidth / partDuration;
            const newClampedPixelsPerSecond = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newMinZoomForPart));
            setPixelsPerSecond(newClampedPixelsPerSecond);
            return; // 재계산 완료
          }
        }
      }
      
      // 아직 준비되지 않았으면 다시 시도
      if (attempts < maxAttempts) {
        requestAnimationFrame(checkAndRecalculate);
      }
    };
    
    // 첫 번째 체크는 다음 프레임에서
    requestAnimationFrame(checkAndRecalculate);
  }, [part, isCalculatingZoom, hasUserAdjustedZoom, pixelsPerSecond, partDuration, pianoRollContainerRef]);

  useEffect(() => {
    if (part || !isCalculatingZoom) return;

    const timer = window.setTimeout(() => {
      if (!part) {
        setIsCalculatingZoom(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [part, isCalculatingZoom]);
  
  // 윈도우 리사이즈 시 재계산 (사용자가 수동으로 조정하지 않은 경우에만)
  useEffect(() => {
    if (!part || hasUserAdjustedZoom || isCalculatingZoom) {
      return;
    }
    
    const handleResize = () => {
      if (hasUserAdjustedZoom) {
        return;
      }
      
      const viewportWidth = window.innerWidth;
      const editorWidth = Math.min(viewportWidth * MIDI_EDITOR_CONSTANTS.EDITOR_WIDTH_RATIO, MIDI_EDITOR_CONSTANTS.EDITOR_MAX_WIDTH);
      const pianoKeysWidth = MIDI_EDITOR_CONSTANTS.PIANO_KEYS_WIDTH;
      
      // 실제 컨테이너 너비 측정
      let availableWidth = editorWidth - pianoKeysWidth;
      if (pianoRollContainerRef.current) {
        availableWidth = pianoRollContainerRef.current.clientWidth;
      }
      
      if (availableWidth > 0 && partDuration > 0) {
        // 파트 전체가 보이는 최소 zoom 계산
        const minZoomForPart = availableWidth / partDuration;
        const clampedPixelsPerSecond = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, minZoomForPart));
        if (resizeDebounceRef.current !== null) {
          window.clearTimeout(resizeDebounceRef.current);
        }
        resizeDebounceRef.current = window.setTimeout(() => {
          setPixelsPerSecond(clampedPixelsPerSecond);
          resizeDebounceRef.current = null;
        }, 120);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeDebounceRef.current !== null) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
    };
  }, [part, hasUserAdjustedZoom, isCalculatingZoom, partDuration, pianoRollContainerRef]);

  return {
    pixelsPerSecond,
    setPixelsPerSecond,
    hasUserAdjustedZoom,
    setHasUserAdjustedZoom,
    isCalculatingZoom,
    isContainerReady,
    minZoom,
  };
};

