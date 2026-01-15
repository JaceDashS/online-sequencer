import React, { useRef, useEffect } from 'react';
import { getProject } from '../../store/projectStore';
import styles from './Timeline.module.css';

/**
 * 타임라인 컴포넌트 Props
 */
interface TimelineProps {
  /** BPM (Beats Per Minute) */
  bpm: number;
  /** 타임 시그니처 [beatsPerMeasure, beatUnit] */
  timeSignature: [number, number];
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 시작 시간 (초, 선택) */
  startTime?: number;
  /** 트랙별 높이 맵 (선택) */
  trackHeights?: Map<string, number>;
  /** 스크롤 위치 (선택) */
  scrollTop?: number;
}

/**
 * 마디 마커 인터페이스
 */
interface MeasureMarker {
  /** 마디 번호 */
  measure: number;
  /** X 좌표 (픽셀) */
  x: number;
}

/**
 * 타임라인 컴포넌트
 * 트랙과 마디 구분선을 표시하는 타임라인 뷰입니다.
 * 
 * @param props - TimelineProps
 * @returns 타임라인 JSX 요소
 */
const Timeline: React.FC<TimelineProps> = ({
  bpm = 120,
  timeSignature = [4, 4],
  pixelsPerSecond = 50,
  startTime = 0,
  trackHeights = new Map(),
  scrollTop = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const project = getProject();
  const tracks = project.tracks;

  // MeasureRuler와 동일한 너비 계산
  // 박자 변경 시에도 확대/축소가 되지 않도록 timeSignature에 관계없이 고정된 시간 범위 사용
  const baseBeatsPerMeasure = 4; // 고정된 기준 박자 (4/4)
  const baseBeatUnit = 4;
  const baseNoteValueRatio = 4 / baseBeatUnit;
  const baseSecondsPerBeat = (60 / bpm) * baseNoteValueRatio;
  const baseSecondsPerMeasure = baseBeatsPerMeasure * baseSecondsPerBeat;
  const totalWidth = 300 * baseSecondsPerMeasure * pixelsPerSecond;
  
  // 마디 구분선 위치 계산에는 실제 박자 사용
  const beatsPerMeasure = timeSignature[0];
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;

  // 가로 스크롤 동기화 (MeasureRuler와 동일한 로직)
  useEffect(() => {
    if (!timelineContentRef.current) return;

    const timelineContent = timelineContentRef.current;
    const bottomScrollbar = document.getElementById('timeline-scrollbar');
    
    if (!timelineContent || !bottomScrollbar) return;

    // 하단 스크롤바를 움직이면 타임라인도 움직임
    const handleScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (target === bottomScrollbar) {
        timelineContent.style.transform = `translateX(-${target.scrollLeft}px)`;
      }
    };

    bottomScrollbar.addEventListener('scroll', handleScroll);

    return () => {
      bottomScrollbar.removeEventListener('scroll', handleScroll);
    };
  }, [totalWidth]);

  // 세로 스크롤 동기화 (TrackList와 동기화)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  // 마디 구분선 생성
  const measureMarkers: MeasureMarker[] = [];
  for (let i = 0; i <= 150; i++) {
    const measureTime = i * secondsPerMeasure;
    const xPosition = (measureTime - startTime) * pixelsPerSecond;
    measureMarkers.push({
      measure: i,
      x: xPosition,
    });
  }

  return (
    <div className={styles.timeline} ref={containerRef}>
      <div ref={timelineContentRef} className={styles.timelineContent} style={{ width: `${totalWidth}px`, minWidth: '100%' }}>
        {tracks.map((track) => {
          const trackHeight = trackHeights.get(track.id) || 70; // 기본값 70px
          return (
            <div 
              key={track.id} 
              className={styles.timelineTrack}
              style={{ height: `${trackHeight}px`, minHeight: `${trackHeight}px` }}
            >
              {/* 마디 구분선 */}
              {measureMarkers.map((marker) => (
                <div
                  key={`measure-${track.id}-${marker.measure}`}
                  className={styles.measureDivider}
                  style={{ left: `${marker.x}px` }}
                />
              ))}
              {/* 이벤트 영역 (나중에 클립들이 여기에 표시됨) */}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Timeline;
