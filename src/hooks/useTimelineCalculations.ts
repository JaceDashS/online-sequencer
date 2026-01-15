import { useMemo } from 'react';

interface TimelineCalculationsOptions {
  bpm: number;
  timeSignature: [number, number];
  pixelsPerSecond?: number;
  measures?: number;
}

/**
 * 타임라인 관련 계산 로직을 캡슐화한 커스텀 훅
 * 여러 컴포넌트에서 중복되는 타임라인 계산 로직을 통합
 */
export const useTimelineCalculations = ({
  bpm,
  timeSignature,
  pixelsPerSecond = 50,
  measures = 150,
}: TimelineCalculationsOptions) => {
  const calculations = useMemo(() => {
    const beatsPerMeasure = timeSignature[0];
    const beatUnit = timeSignature[1];
    
    // beatUnit에 따라 실제 음표 길이 계산 (4=4분음표, 8=8분음표 기준)
    const noteValueRatio = 4 / beatUnit; // 4/4면 1, 6/8이면 0.5
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
    const totalWidth = measures * secondsPerMeasure * pixelsPerSecond;
    
    return {
      beatsPerMeasure,
      beatUnit,
      noteValueRatio,
      secondsPerBeat,
      secondsPerMeasure,
      totalWidth,
      pixelsPerSecond,
      measures,
    };
  }, [bpm, timeSignature, pixelsPerSecond, measures]);

  return calculations;
};
