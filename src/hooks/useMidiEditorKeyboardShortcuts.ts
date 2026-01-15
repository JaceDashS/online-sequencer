import { useEffect } from 'react';
import { getProject, getMidiPartNotes, removeMultipleNotesFromMidiPart, updateNoteInMidiPart, undoMidiPart, redoMidiPart, mergeNotes, addMultipleNotesToMidiPart } from '../store/projectStore';
import { isSplitByKey3Mode, useUIState } from '../store/uiStore';
import { getPpqn, getTimeSignature, ticksToSecondsPure, secondsToTicksPure } from '../utils/midiTickUtils';
import { quantizeNote } from '../components/MidiEditor/MidiEditorCalculations';
import type { AudioEngine } from '../core/audio/AudioEngine';
import type { MidiNote } from '../types/project';

type UIStateType = ReturnType<typeof useUIState>;

/**
 * useMidiEditorKeyboardShortcuts 훅 Props
 */
export interface UseMidiEditorKeyboardShortcutsProps {
  /** 편집할 MIDI 파트의 ID */
  partId: string;
  /** 선택된 노트 인덱스 Set */
  selectedNotes: Set<number>;
  /** 선택된 노트 설정 함수 */
  setSelectedNotes: (notes: Set<number>) => void;
  /** 타임 시그니처 [beatsPerMeasure, beatUnit] */
  timeSignature: [number, number];
  /** 벨로시티 탭 선택 상태 */
  velocityTabSelection: 'velocity' | 'sustain';
  /** 선택된 서스테인 범위 인덱스 */
  selectedSustainRange: Set<number>;
  /** 서스테인 범위 배열 */
  sustainRanges: Array<{ startTick: number; endTick: number }>;
  /** UI 상태 및 액션 */
  ui: UIStateType;
  /** 에디터 닫기 콜백 */
  onClose: () => void;
  /** 서스테인 컨트롤 변경 업데이트 함수 */
  updateSustainControlChanges: (ranges: Array<{ startTick: number; endTick: number }>, selectedIndices?: Set<number> | null) => void;
  /** 파트 노트 설정 함수 */
  setPartNotes: (notes: any[] | ((prev: any[]) => any[])) => void;
  /** 피치 클램핑 함수 */
  clampPianoPitch: (pitch: number) => number;
  /** AudioEngine ref */
  audioEngineRef: React.RefObject<AudioEngine | null>;
  /** 마지막 재생 피치 추적 ref */
  lastPreviewedPitchesRef: React.MutableRefObject<Map<number, number>>;
  /** Split 미리보기 X 좌표 설정 함수 */
  setSplitPreviewX: (x: number | null) => void;
  /** Split 미리보기 노트 인덱스 설정 함수 */
  setSplitPreviewNoteIndex: (index: number | null) => void;
  /** 빨간색 테마 활성화 여부 설정 함수 */
  setIsRedThemeActive?: (active: boolean) => void;
  /** 현재 빨간색 테마 활성화 상태 */
  isRedThemeActive?: boolean;
  /** 파트의 절대 시작 시간 (마디 기준 퀀타이즈용) */
  partStartTime: number;
  /** BPM */
  bpm: number;
  /** 선택된 서스테인 범위 설정 함수 */
  setSelectedSustainRange: (indices: Set<number>) => void;
}

/**
 * MIDI 에디터 키보드 단축키 핸들러 훅
 * Phase 7.9.1: 키보드 단축키 핸들러를 훅으로 추출
 */
export const useMidiEditorKeyboardShortcuts = ({
  partId,
  selectedNotes,
  setSelectedNotes,
  timeSignature,
  velocityTabSelection,
  selectedSustainRange,
  sustainRanges,
  ui,
  onClose,
  updateSustainControlChanges,
  setPartNotes,
  clampPianoPitch,
  audioEngineRef,
  lastPreviewedPitchesRef,
  setSplitPreviewX,
  setSplitPreviewNoteIndex,
  setIsRedThemeActive,
  isRedThemeActive = false,
  partStartTime,
  bpm,
  setSelectedSustainRange,
}: UseMidiEditorKeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 입력 필드, 버튼, select 등에 포커스가 있으면 키보드 이벤트 무시
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      
      // 입력 필드, textarea, select, contentEditable에 포커스가 있으면 무시
      // Delete/Backspace 키는 서스테인 범위가 선택되어 있을 때는 BUTTON에서도 처리
      const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace';
      const shouldAllowDeleteOnButton = isDeleteKey && velocityTabSelection === 'sustain' && selectedSustainRange.size > 0;
      
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        (target.tagName === 'BUTTON' && !shouldAllowDeleteOnButton)
      ) {
        return;
      }

      // Ctrl+Z: Undo (현재 클립의 노트 편집 히스토리만 사용)
      // 미디 에디터가 열려있을 때는 노트 편집 언두만 처리하고 이벤트 전파 중단
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undoMidiPart(partId);
        setPartNotes(getMidiPartNotes(partId));
        return;
      }

      // Ctrl+Y 또는 Ctrl+Shift+Z: Redo (현재 클립의 노트 편집 히스토리만 사용)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        e.stopPropagation();
        redoMidiPart(partId);
        setPartNotes(getMidiPartNotes(partId));
        return;
      }

      // Ctrl+D: 선택된 노트 복제 또는 서스테인 페달 복제
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        e.stopPropagation();
        
        // 서스테인 탭에서 서스테인 페달 복제
        if (velocityTabSelection === 'sustain' && selectedSustainRange.size > 0) {
          const project = getProject();
          const part = project.midiParts.find(p => p.id === partId);
          if (!part) return;
          
          const selectedIndices = Array.from(selectedSustainRange)
            .filter(index => index >= 0 && index < sustainRanges.length)
            .sort((a, b) => a - b);
          
          if (selectedIndices.length === 0) return;
          
          // 선택된 범위들을 복제하여 각 범위가 끝나는 지점에 생성
          const clonedRanges: Array<{ startTick: number; endTick: number }> = [];
          const newSelectedIndices: number[] = [];
          
          // 범위를 추가하기 전에 현재 범위 개수를 저장
          const currentRangeCount = sustainRanges.length;
          
          selectedIndices.forEach((rangeIndex) => {
            const originalRange = sustainRanges[rangeIndex];
            if (!originalRange) return;
            
            const originalStartTick = originalRange.startTick;
            const originalEndTick = originalRange.endTick;
            const rangeDuration = originalEndTick - originalStartTick;
            
            // 범위가 끝나는 지점 계산: endTick
            const clonedStartTick = originalEndTick;
            const clonedEndTick = clonedStartTick + rangeDuration;
            
            // 파트 범위 내에 있는지 확인
            if (clonedEndTick <= part.durationTicks) {
              clonedRanges.push({
                startTick: clonedStartTick,
                endTick: clonedEndTick,
              });
            }
          });
          
          // 복제된 범위들을 추가
          if (clonedRanges.length > 0) {
            const nextRanges = [...sustainRanges, ...clonedRanges];
            
            // 복제된 범위들을 선택 상태로 설정 (추가된 범위들의 인덱스 계산)
            const clonedRangeStartIndex = currentRangeCount;
            for (let i = 0; i < clonedRanges.length; i++) {
              newSelectedIndices.push(clonedRangeStartIndex + i);
            }
            
            updateSustainControlChanges(nextRanges, new Set(newSelectedIndices));
            setSelectedNotes(new Set()); // Clear note selection
          }
          
          return;
        }
        
        // 노트 복제 (각 노트가 끝나는 지점에 생성)
        if (selectedNotes.size > 0 && velocityTabSelection !== 'sustain') {
          
          const project = getProject();
          const part = project.midiParts.find(p => p.id === partId);
          if (!part) return;
          
          const currentNotes = getMidiPartNotes(partId);
          const selectedNoteIndices = Array.from(selectedNotes)
            .filter(index => index >= 0 && index < currentNotes.length)
            .sort((a, b) => a - b);
          
          if (selectedNoteIndices.length === 0) return;
          
          // 각 선택된 노트를 복제하여 노트가 끝나는 지점에 생성
          const clonedNotes: MidiNote[] = [];
          const newSelectedIndices: number[] = [];
          
          // 노트를 추가하기 전에 현재 노트 개수를 저장
          const currentNoteCount = currentNotes.length;
          
          selectedNoteIndices.forEach((noteIndex) => {
            const originalNote = currentNotes[noteIndex];
            if (!originalNote) return;
            
            // 노트가 끝나는 지점 계산: startTick + durationTicks
            const originalStartTick = originalNote.startTick ?? 0;
            const originalDurationTicks = originalNote.durationTicks ?? 0;
            const endTick = originalStartTick + originalDurationTicks;
            
            // 파트 범위 내에 있는지 확인
            if (endTick + originalDurationTicks <= part.durationTicks) {
              const clonedNote: MidiNote = {
                note: originalNote.note,
                velocity: originalNote.velocity ?? 100,
                channel: originalNote.channel,
                releaseVelocity: originalNote.releaseVelocity,
                startTick: endTick,
                durationTicks: originalDurationTicks,
              };
              
              clonedNotes.push(clonedNote);
            }
          });
          
          // 복제된 노트들을 추가
          if (clonedNotes.length > 0) {
            addMultipleNotesToMidiPart(partId, clonedNotes);
            setPartNotes(getMidiPartNotes(partId));
            
            // 복제된 노트들을 선택 상태로 설정 (추가된 노트들의 인덱스 계산)
            const clonedNoteStartIndex = currentNoteCount;
            for (let i = 0; i < clonedNotes.length; i++) {
              newSelectedIndices.push(clonedNoteStartIndex + i);
            }
            setSelectedNotes(new Set(newSelectedIndices));
            
            // 복제 플래시 효과
            ui.setDuplicateFlashActive(true);
            setTimeout(() => {
              ui.setDuplicateFlashActive(false);
            }, 200);
            
            // 첫 번째 복제된 노트 사운드 피드백
            if (audioEngineRef.current && clonedNotes.length > 0) {
              const track = project.tracks.find(t => t.id === part.trackId);
              const instrument = track?.instrument || 'piano';
              const firstClonedNote = clonedNotes[0];
              void audioEngineRef.current.previewNote(firstClonedNote.note, firstClonedNote.velocity ?? 100, instrument);
            }
          }
        }
        return;
      }

      // 4번 키: mergeByKey4 모드 토글
      if (e.key === '4' || e.key === 'Digit4') {
        e.preventDefault();
        e.stopPropagation();
        ui.toggleMerge();
        return;
      }

      // 1번 키: splitByKey3 및 mergeByKey4 모드 비활성화
      if (e.key === '1' || e.key === 'Digit1') {
        e.preventDefault();
        e.stopPropagation();
        if (isSplitByKey3Mode(ui.cursorMode)) {
          ui.setCursorMode(null);
          setSplitPreviewX(null);
          setSplitPreviewNoteIndex(null);
        } else if (ui.cursorMode === 'mergeByKey4') {
          ui.setCursorMode(null);
        }
        return;
      }

      // Enter 키: 선택된 노트들 merge
      if (e.key === 'Enter') {
        if (selectedNotes.size >= 2) {
          e.preventDefault();
          e.stopPropagation();
          const noteIndices = Array.from(selectedNotes).sort((a, b) => a - b);
          const result = mergeNotes(partId, noteIndices);
          if (result) {
            setPartNotes(getMidiPartNotes(partId));
            setSelectedNotes(new Set([result.mergedNoteIndex]));
          }
          return;
        }
      }
      
      if (e.key === 'Escape') {
        e.preventDefault();
        if (velocityTabSelection === 'sustain' && selectedSustainRange.size > 0) {
          updateSustainControlChanges(sustainRanges, new Set());
          setSelectedNotes(new Set());
          return;
        }
        // 선택 해제 또는 에디터 닫기
        if (selectedNotes.size > 0) {
          setSelectedNotes(new Set());
        } else {
          onClose();
        }
      }
      
      // Delete/Backspace: 선택된 노트 삭제 또는 서스테인 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        
        // 서스테인이 선택되어 있으면 서스테인 삭제
        if (selectedSustainRange.size > 0) {
          // 선택된 모든 서스테인 범위 삭제
          const indicesToDelete = Array.from(selectedSustainRange);
          const nextRanges = sustainRanges.filter((_, index) => !indicesToDelete.includes(index));
          
          updateSustainControlChanges(nextRanges, new Set());
          setSelectedNotes(new Set());
          e.stopImmediatePropagation(); // 다른 핸들러 실행 완전 차단
          return;
        }
        
        // 노트가 선택되어 있으면 노트 삭제
        if (selectedNotes.size > 0) {
          // 선택된 노트가 있으면 노트 삭제 (하나의 히스토리 액션으로 처리)
          const currentNotes = getMidiPartNotes(partId);
          const noteIndicesToDelete = Array.from(selectedNotes)
            .filter(index => index >= 0 && index < currentNotes.length)
            .sort((a, b) => b - a); // 역순 정렬
          
          if (noteIndicesToDelete.length > 0) {
            // 여러 노트를 한 번에 삭제하여 하나의 히스토리 액션으로 기록
            removeMultipleNotesFromMidiPart(partId, noteIndicesToDelete);
            setPartNotes(getMidiPartNotes(partId));
            setSelectedNotes(new Set());
          }
          return;
        }
        
        // 선택된 항목이 없으면 이벤트 전파는 중지 (에디터가 닫히는 것을 방지)
        return;
      }
      
      if (selectedNotes.size > 0 && (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      )) {
        e.preventDefault();
        const project = getProject();
        const part = project.midiParts.find(p => p.id === partId);
        if (!part) return;

        const currentNotes = getMidiPartNotes(partId);
        const ticksPerQuarter = getPpqn(project);
        const beatUnit = timeSignature[1];
        const ticksPerBeat = Math.round(ticksPerQuarter * (4 / beatUnit));
        const deltaTick = e.key === 'ArrowLeft'
          ? -ticksPerBeat
          : e.key === 'ArrowRight'
            ? ticksPerBeat
            : 0;
        const deltaPitch = e.key === 'ArrowUp'
          ? 1   // 위로 올리면 피치 증가 (높은 음)
          : e.key === 'ArrowDown'
            ? -1  // 아래로 내리면 피치 감소 (낮은 음)
            : 0;

        Array.from(selectedNotes)
          .filter(index => index < currentNotes.length)
          .forEach(index => {
            const note = currentNotes[index];
            const originalStartTick = note.startTick ?? 0;
            const durationTicks = note.durationTicks ?? 0;
            let nextStartTick = originalStartTick + deltaTick;
            nextStartTick = Math.max(0, nextStartTick);
            if (part.durationTicks !== undefined) {
              const maxStartTick = Math.max(0, part.durationTicks - durationTicks);
              nextStartTick = Math.min(nextStartTick, maxStartTick);
            }

            const nextPitch = clampPianoPitch(note.note + deltaPitch);
            if (nextStartTick === originalStartTick && nextPitch === note.note) return;

            // 피치가 변경된 경우 소리 피드백 (드래그 로직과 동일하게 이전 소리 중지)
            if (deltaPitch !== 0 && audioEngineRef.current) {
              const lastPitch = lastPreviewedPitchesRef.current.get(index);
              
              if (nextPitch !== lastPitch) {
                // Get track instrument for preview
                const part = project.midiParts.find(p => p.id === partId);
                const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
                const instrument = track?.instrument || 'piano';
                
                // 이전 피치의 소리 중지
                if (lastPitch !== undefined) {
                  audioEngineRef.current.stopPreview(lastPitch);
                }
                // 새로운 피치의 소리 재생
                void audioEngineRef.current.previewNote(nextPitch, note.velocity ?? 100, instrument);
                // 마지막 재생 피치 업데이트
                lastPreviewedPitchesRef.current.set(index, nextPitch);
              }
            }

            updateNoteInMidiPart(partId, index, {
              startTick: nextStartTick,
              note: nextPitch,
            });
          });

        setPartNotes(getMidiPartNotes(partId));
        return;
      }

      // Ctrl+Q: 선택된 노트 또는 서스테인 퀀타이즈 (글로벌 마디 기준)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        e.stopPropagation();
        
        // 서스테인 탭에서 서스테인 퀀타이즈
        if (velocityTabSelection === 'sustain' && selectedSustainRange.size > 0) {
          const project = getProject();
          const part = project.midiParts.find(p => p.id === partId);
          if (!part) return;
          
          const projectTimeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const beatUnit = projectTimeSignature[1];
          const noteValueRatio = 4 / beatUnit;
          const secondsPerBeat = (60 / bpm) * noteValueRatio;
          const gridSize = secondsPerBeat;
          
          const selectedIndices = Array.from(selectedSustainRange)
            .filter(index => index >= 0 && index < sustainRanges.length)
            .sort((a, b) => a - b);
          
          if (selectedIndices.length === 0) return;
          
          const quantizedRanges = sustainRanges.map((range, index) => {
            if (!selectedIndices.includes(index)) {
              return range;
            }
            
            // tick을 seconds로 변환 (상대 시간)
            const { startTime: startTimeRelative } = ticksToSecondsPure(range.startTick, 0, tempoMap, projectTimeSignature, ppqn);
            const { startTime: endTimeRelative } = ticksToSecondsPure(range.endTick, 0, tempoMap, projectTimeSignature, ppqn);
            
            // 상대 시간을 절대 시간으로 변환 (마디 기준)
            const startTimeAbsolute = partStartTime + startTimeRelative;
            const endTimeAbsolute = partStartTime + endTimeRelative;
            
            // 퀀타이즈 적용 (절대 시간 기준)
            const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
            const quantizedEndTimeAbsolute = quantizeNote(endTimeAbsolute, gridSize);
            
            // 절대 시간을 상대 시간으로 변환
            const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
            const quantizedEndTimeRelative = quantizedEndTimeAbsolute - partStartTime;
            
            // 상대 시간을 tick으로 변환
            const { startTick: quantizedStartTick } = secondsToTicksPure(quantizedStartTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            const { startTick: quantizedEndTick } = secondsToTicksPure(quantizedEndTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            
            const newStartTick = Math.max(0, quantizedStartTick);
            const newEndTick = Math.max(newStartTick, quantizedEndTick);
            
            return {
              startTick: newStartTick,
              endTick: newEndTick,
            };
          });
          
          updateSustainControlChanges(quantizedRanges, selectedSustainRange);
          return;
        }
        
        // 노트 탭에서 노트 퀀타이즈
        if (selectedNotes.size > 0) {
          const project = getProject();
          const part = project.midiParts.find(p => p.id === partId);
          if (!part) return;
          
          const projectTimeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const beatUnit = projectTimeSignature[1];
          const noteValueRatio = 4 / beatUnit;
          const secondsPerBeat = (60 / bpm) * noteValueRatio;
          const gridSize = secondsPerBeat;
          
          const currentNotes = getMidiPartNotes(partId);
          const notesToQuantize = Array.from(selectedNotes)
            .filter(index => index < currentNotes.length)
            .map(index => ({ index, note: currentNotes[index] }));
          
          notesToQuantize.forEach(({ index, note }) => {
            const originalStartTick = note.startTick ?? 0;
            
            // tick을 seconds로 변환 (상대 시간)
            const { startTime: startTimeRelative } = ticksToSecondsPure(originalStartTick, 0, tempoMap, projectTimeSignature, ppqn);
            
            // 상대 시간을 절대 시간으로 변환 (마디 기준)
            const startTimeAbsolute = partStartTime + startTimeRelative;
            
            // 퀀타이즈 적용 (절대 시간 기준)
            const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
            
            // 절대 시간을 상대 시간으로 변환
            const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
            
            // 상대 시간을 tick으로 변환
            const { startTick: quantizedStartTick } = secondsToTicksPure(quantizedStartTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            
            const newStartTick = Math.max(0, quantizedStartTick);
            if (newStartTick === originalStartTick) {
              return;
            }
            updateNoteInMidiPart(partId, index, { startTick: newStartTick }, false);
          });
          setPartNotes(getMidiPartNotes(partId));
          setSelectedSustainRange(new Set()); // Clear sustain selection
        }
      }

      // V key: activate velocity color mode while held.
      if (e.key === 'v' || e.key === 'V') {
        if (e.repeat) return;
        
        if (selectedNotes.size > 0 && setIsRedThemeActive) {
          e.preventDefault();
          e.stopPropagation();
          setIsRedThemeActive(true);
        }
        return;
      }

    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // 입력 필드, 버튼, select 등에 포커스가 있으면 키보드 이벤트 무시
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        if (setIsRedThemeActive) {
          e.preventDefault();
          e.stopPropagation();
          setIsRedThemeActive(false);
        }
        return;
      }
    };

    // capture phase에서 등록하여 다른 핸들러보다 먼저 실행되도록 함
    window.addEventListener('keydown', handleKeyPress, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyPress, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [partId, selectedNotes, timeSignature, velocityTabSelection, selectedSustainRange, sustainRanges, ui, onClose, updateSustainControlChanges, setPartNotes, clampPianoPitch, audioEngineRef, lastPreviewedPitchesRef, setSplitPreviewX, setSplitPreviewNoteIndex, setSelectedNotes, setIsRedThemeActive, isRedThemeActive]);
};

