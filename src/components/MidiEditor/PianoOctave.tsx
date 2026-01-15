import React, { useState, useEffect } from 'react';
import styles from './MidiEditor.module.css';

interface PianoOctaveProps {
  // 옥타브 번호 (-1부터 9까지)
  octave?: number;
  // 표시할 MIDI 노트 범위 (기본: 0-127)
  minMidiNote?: number;
  maxMidiNote?: number;
  // 흑 건반 높이 비율 (백건반 높이 대비, 예: 1/3 = 0.333)
  blackKeyHeightRatio?: number;
  // 건반 클릭 핸들러 (note: MIDI 노트 이름, octave: 옥타브 번호)
  onKeyClick?: (note: string, octave: number) => void;
  // 건반 릴리즈 핸들러 (note: MIDI 노트 이름, octave: 옥타브 번호)
  onKeyRelease?: (note: string, octave: number) => void;
  // 호버된 MIDI 노트 번호 (null이면 호버 없음)
  hoveredMidiNote?: number | null;
  // 눌려진 MIDI 노트 번호들 (노트를 그리거나 선택할 때 사용, null이면 눌림 없음)
  pressedMidiNotes?: Set<number> | null;
}

const PianoOctave: React.FC<PianoOctaveProps> = ({ octave = 4, minMidiNote = 0, maxMidiNote = 127, blackKeyHeightRatio = 1 / 1.5, onKeyClick, onKeyRelease, hoveredMidiNote = null, pressedMidiNotes = null }) => {
  // 눌려진 건반 추적 (노트 이름) - 마우스를 누르고 있는 동안만
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  // 전역 mouseup 이벤트 처리 (건반 밖에서 마우스를 놓았을 때)
  useEffect(() => {
    const handleMouseUp = () => {
      setPressedKey(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // MIDI 노트 이름을 MIDI 노트 번호로 변환하는 함수
  const noteNameToMidiNote = (noteName: string, octaveNum: number): number => {
    const noteMap: { [key: string]: number } = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };
    return (octaveNum + 1) * 12 + noteMap[noteName];
  };

  // 한 옥타브의 흰 건반: C, D, E, F, G, A, B (7개)
  const allWhiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
  const whiteKeys = allWhiteKeys.filter((note) => {
    const midi = noteNameToMidiNote(note, octave);
    return midi >= minMidiNote && midi <= maxMidiNote;
  });
  const whiteKeyCount = whiteKeys.length;
  const whiteKeyHeight = 100 / Math.max(1, whiteKeyCount); // 백건반 높이: 1/N

  // 흑 건반 높이 계산 (백건반 높이 * 비율)
  const blackKeyHeight = whiteKeyHeight * blackKeyHeightRatio;

  // 흑 건반 정보: 두 흰 건반 사이의 경계 위에 배치
  // 아래쪽(낮은 음계): C, D, E 구간에 2개 (C#, D#)
  // 위쪽(높은 음계): F, G, A, B 구간에 3개 (F#, G#, A#)
  // topOffset: 경계에 위치 (아래쪽 백건반의 top 위치)
  // C가 맨 아래(index 0 → top: 6*whiteKeyHeight), B가 맨 위(index 6 → top: 0)
  const blackKeyDefs: Array<{ name: string; lowerWhite: string; upperWhite: string }> = [
    { name: 'C#', lowerWhite: 'C', upperWhite: 'D' },
    { name: 'D#', lowerWhite: 'D', upperWhite: 'E' },
    { name: 'F#', lowerWhite: 'F', upperWhite: 'G' },
    { name: 'G#', lowerWhite: 'G', upperWhite: 'A' },
    { name: 'A#', lowerWhite: 'A', upperWhite: 'B' },
  ];

  return (
    <div className={styles.pianoOctave}>
      {/* 흰 건반 레이어 (아래가 낮은 음계, 위가 높은 음계) */}
      <div className={styles.whiteKeysLayer}>
        {whiteKeys.map((note, index) => {
          // 역순 계산: C(index 0)가 맨 아래, B(index 6)가 맨 위
          const topPercent = (whiteKeyCount - 1 - index) * whiteKeyHeight;
          const midiNote = noteNameToMidiNote(note, octave);
          const isInRange = midiNote >= minMidiNote && midiNote <= maxMidiNote;
          const isHovered = hoveredMidiNote === midiNote;
          const isPressedFromNotes = pressedMidiNotes ? pressedMidiNotes.has(midiNote) : false;
          
          return (
            <div
              key={`white-${note}-${octave}`}
              className={`${styles.pianoKey} ${styles.pianoKeyWhite} ${pressedKey === note || isPressedFromNotes ? styles.pianoKeyPressed : ''} ${isHovered ? styles.pianoKeyHovered : ''}`}
              style={{
                top: `${topPercent}%`,
                height: `${whiteKeyHeight}%`,
                visibility: isInRange ? 'visible' : 'hidden',
                pointerEvents: isInRange ? 'auto' : 'none',
              }}
              onMouseDown={() => {
                setPressedKey(note);
                onKeyClick?.(note, octave);
              }}
              onMouseUp={() => {
                if (pressedKey === note) {
                  onKeyRelease?.(note, octave);
                }
                setPressedKey(null);
              }}
            >
              <span className={styles.pianoKeyLabel}>
                {isInRange ? (note === 'C' ? `C${octave}` : note) : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* 흑 건반 레이어 (백건반 경계 위에 배치) */}
      <div className={styles.blackKeysLayer}>
        {blackKeyDefs.map((blackKey) => {
          const midiNote = noteNameToMidiNote(blackKey.name, octave);
          const isInRange = midiNote >= minMidiNote && midiNote <= maxMidiNote;
          // 인접한 두 백건반이 모두 표시되는 경우에만 흑건반을 표시 (부분 옥타브 정합)
          const hasAdjacentWhites = whiteKeys.includes(blackKey.lowerWhite as any) && whiteKeys.includes(blackKey.upperWhite as any);
          if (!isInRange || !hasAdjacentWhites) return null;

          const lowerWhiteIndex = whiteKeys.indexOf(blackKey.lowerWhite as any);
          // lowerWhiteIndex는 화면에서 아래(낮은 음)쪽에 더 가까움. 현재 렌더링은 역순 top 배치이므로
          // lower white의 topPercent를 그대로 사용하면 두 백건반 경계에 흑건반이 위치함.
          const topPercent = (whiteKeyCount - 1 - lowerWhiteIndex) * whiteKeyHeight;
          const isHovered = hoveredMidiNote === midiNote;
          const isPressedFromNotes = pressedMidiNotes ? pressedMidiNotes.has(midiNote) : false;
          
          return (
            <div
              key={`black-${blackKey.name}-${octave}`}
              className={`${styles.pianoKey} ${styles.pianoKeyBlack} ${pressedKey === blackKey.name || isPressedFromNotes ? styles.pianoKeyPressed : ''} ${isHovered ? styles.pianoKeyHovered : ''}`}
              style={{
                top: `${topPercent}%`,
                height: `${blackKeyHeight}%`,
                left: '0',
              }}
              onMouseDown={() => {
                setPressedKey(blackKey.name);
                onKeyClick?.(blackKey.name, octave);
              }}
              onMouseUp={() => {
                if (pressedKey === blackKey.name) {
                  onKeyRelease?.(blackKey.name, octave);
                }
                setPressedKey(null);
              }}
            >
              <span className={styles.pianoKeyLabel}>{blackKey.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PianoOctave;
