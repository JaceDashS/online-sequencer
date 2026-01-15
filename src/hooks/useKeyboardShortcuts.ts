import { useEffect } from 'react';
import { useUIState } from '../store/uiStore';
import { 
  getProject, 
  removeMultipleMidiParts, 
  mergeMidiParts, 
  undoMidiPartLevel, 
  redoMidiPartLevel, 
  undoMidiPart, 
  redoMidiPart,
  updateTrack,
  cloneMidiPart
} from '../store/projectStore';
import { ticksToMeasurePure, getTimeSignature, getPpqn } from '../utils/midiTickUtils';

/**
 * 전역 키보드 단축키를 처리하는 훅
 * 
 * @remarks
 * - Phase 6.2: DawPage의 키보드 단축키를 훅으로 분리
 * - 입력 필드나 텍스트 영역에 포커스가 있으면 단축키를 무시합니다.
 * - 미디 에디터가 켜져있을 때도 작동합니다.
 */
export const useKeyboardShortcuts = (): void => {
  const ui = useUIState();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      
      // 버튼/select에서 스페이스바/엔터 기본 동작 방지 (먼저 체크)
      // contentEditable은 제외 (실제 입력이 필요)
      if ((e.key === ' ' || e.key === 'Enter' || e.code === 'Space') &&
          (target.tagName === 'BUTTON' || target.tagName === 'SELECT') &&
          !target.isContentEditable) {
        e.preventDefault();
        e.stopPropagation();
        // 스페이스바/엔터는 기본 동작만 막고 여기서 return (TransportControls에서 처리)
        return;
      }
      
      // 실제 입력 요소만 단축키에서 제외 (버튼/select는 단축키 작동)
      if (
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // 'q' 키로 퀀타이즈 토글
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        ui.toggleQuantize();
        return;
      }
      
      // 'n' 키로 메트로놈 토글
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        ui.toggleMetronome();
        return;
      }
      
      // 'f' 키로 오토스크롤 토글
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        ui.toggleAutoScroll();
        return;
      }
      
      // 'm' 키로 현재 포커스된 트랙의 뮤트 토글
      if (e.key === 'm' || e.key === 'M') {
        if (ui.selectedTrackId && ui.selectedTrackId !== 'master') {
          e.preventDefault();
          const currentTracks = getProject().tracks;
          const track = currentTracks.find(t => t.id === ui.selectedTrackId);
          if (track) {
            // 다른 트랙 중 솔로가 활성화된 것이 있는지 확인
            const hasAnySolo = currentTracks.some(t => t.id !== ui.selectedTrackId && t.solo);
            
            // 다른 트랙이 솔로 상태이면 뮤트 버튼이 작동하지 않음
            if (!hasAnySolo) {
              const newMuteState = !track.mute;
              const wasSolo = track.solo;
              
              // 명시적 뮤트 상태 변경 시 자동 뮤트 해제 및 솔로 해제
              updateTrack(ui.selectedTrackId, { 
                mute: newMuteState, 
                mutedBySolo: false,
                solo: false 
              });

              // 솔로 상태였던 트랙을 뮤트하면, 사실상 솔로가 해제된 것이므로
              // 다른 트랙들의 자동 뮤트를 해제해야 함
              if (wasSolo && newMuteState) {
                const tracksAfterUpdate = getProject().tracks;
                const hasAnyOtherSolo = tracksAfterUpdate.some(t => t.id !== ui.selectedTrackId && t.solo);
                
                // 다른 활성 솔로가 없으면 모든 자동 뮤트 해제
                if (!hasAnyOtherSolo) {
                  tracksAfterUpdate.forEach(t => {
                    if (t.mutedBySolo) {
                      updateTrack(t.id, { mutedBySolo: false });
                    }
                  });
                }
              }
            }
          }
        }
        return;
      }
      
      // 's' 키로 현재 포커스된 트랙의 솔로 토글
      if (e.key === 's' || e.key === 'S') {
        if (ui.selectedTrackId && ui.selectedTrackId !== 'master') {
          e.preventDefault();
          const currentTracks = getProject().tracks;
          const track = currentTracks.find(t => t.id === ui.selectedTrackId);
          if (track) {
            const newSoloState = !track.solo;
            
            if (newSoloState) {
              // 솔로를 활성화할 때: 현재 뮤트 상태를 저장하고 뮤트를 해제
              updateTrack(ui.selectedTrackId, { 
                solo: true, 
                mutedBySolo: false, 
                mute: false,
                previousMute: track.mute // 이전 뮤트 상태 저장
              });
            } else {
              // 솔로를 비활성화할 때: 이전 뮤트 상태를 복원
              const muteToRestore = track.previousMute !== undefined ? track.previousMute : track.mute;
              updateTrack(ui.selectedTrackId, { 
                solo: false, 
                mutedBySolo: false, 
                mute: muteToRestore,
                previousMute: undefined // 복원 후 초기화
              });
            }

            if (newSoloState) {
              // 솔로가 활성화되면, 다른 트랙들 중 명시적 뮤트가 아닌 트랙들은 자동 뮤트
              currentTracks.forEach(t => {
                if (t.id !== ui.selectedTrackId && !t.solo && !t.mute) {
                  updateTrack(t.id, { mutedBySolo: true });
                }
              });
            } else {
              // 솔로가 비활성화되면, 활성 솔로가 있는지 확인
              const tracksAfterUpdate = getProject().tracks;
              const hasAnySolo = tracksAfterUpdate.some(t => t.id !== ui.selectedTrackId && t.solo);
              
              if (hasAnySolo) {
                // 다른 솔로가 있으면, 현재 트랙을 포함하여 솔로가 아니고 명시적 뮤트가 아닌 모든 트랙을 자동 뮤트로 설정
                tracksAfterUpdate.forEach(t => {
                  if (!t.solo && !t.mute) {
                    if (!t.mutedBySolo) {
                      updateTrack(t.id, { mutedBySolo: true });
                    }
                  }
                });
              } else {
                // 활성 솔로가 없으면 모든 자동 뮤트 해제
                tracksAfterUpdate.forEach(t => {
                  if (t.mutedBySolo) {
                    updateTrack(t.id, { mutedBySolo: false });
                  }
                });
              }
            }
          }
        }
        return;
      }
      
      // '3' 키와 '4' 키는 EventDisplay에서 처리 (중복 방지)
      // '1' 키는 EventDisplay에서 처리 (중복 방지)
      
      // Delete 키로 선택된 클립 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // MIDI 에디터가 열려있으면 Delete 키 처리를 MIDI 에디터에서 처리하도록 함
        if (ui.editingPartId) {
          return;
        }
        if (ui.selectedClipIds.size > 0) {
          e.preventDefault();
          // 여러 파트를 한번에 삭제 (히스토리에 하나의 액션으로 기록)
          removeMultipleMidiParts(Array.from(ui.selectedClipIds));
          ui.clearSelectedClipIds();
        }
        return;
      }
      
      // Ctrl+Z: 언두 (미디 에디터가 열려있으면 해당 파트의 노트 편집 히스토리 사용, 아니면 파트 레벨 히스토리 사용)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        // 미디 에디터가 열려있으면 해당 파트의 노트 편집 히스토리 사용
        if (ui.editingPartId) {
          undoMidiPart(ui.editingPartId);
        } else {
          // 미디 에디터가 열려있지 않으면 파트 레벨 히스토리 사용
          undoMidiPartLevel();
        }
        return;
      }
      
      // Ctrl+Y 또는 Ctrl+Shift+Z: 리두 (미디 에디터가 열려있으면 해당 파트의 노트 편집 히스토리 사용, 아니면 파트 레벨 히스토리 사용)
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        // 미디 에디터가 열려있으면 해당 파트의 노트 편집 히스토리 사용
        if (ui.editingPartId) {
          redoMidiPart(ui.editingPartId);
        } else {
          // 미디 에디터가 열려있지 않으면 파트 레벨 히스토리 사용
          redoMidiPartLevel();
        }
        return;
      }
      
      // Ctrl+D: 선택된 MIDI 파트 복제 (파트가 끝나는 지점에 생성)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (ui.selectedClipIds.size === 1) {
          e.preventDefault();
          const project = getProject();
          const partId = Array.from(ui.selectedClipIds)[0];
          const part = project.midiParts.find(p => p.id === partId);
          
          if (part) {
            // 파트가 끝나는 지점 계산: startTick + durationTicks
            const endTick = part.startTick + part.durationTicks;
            
            // tick을 measure로 변환
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqn(project);
            const { measureStart: endMeasureStart } = ticksToMeasurePure(endTick, 0, timeSignature, ppqn);
            
            // 파트 복제 (파트가 끝나는 지점에 생성)
            const newPartId = cloneMidiPart(partId, endMeasureStart, part.trackId);
            
            if (newPartId) {
              // 복제된 파트를 선택 상태로 설정
              ui.setSelectedClipIds(new Set([newPartId]));
              // 복제 플래시 효과
              ui.setDuplicateFlashActive(true);
              setTimeout(() => {
                ui.setDuplicateFlashActive(false);
              }, 200);
            }
          }
        }
        return;
      }
      
      // Enter 키로 선택된 클립 병합 (같은 트랙에 2개 이상 선택된 경우)
      if (e.key === 'Enter') {
        if (ui.selectedClipIds.size >= 2) {
          const project = getProject();
          const selectedParts = Array.from(ui.selectedClipIds)
            .map(id => project.midiParts.find(p => p.id === id))
            .filter(part => part !== undefined);
          
          // 같은 트랙에 속하는지 확인
          if (selectedParts.length >= 2) {
            const firstTrackId = selectedParts[0].trackId;
            if (selectedParts.every(part => part.trackId === firstTrackId)) {
              e.preventDefault();
              // Enter 키는 cursorMode 변경하지 않음 (merge 동작만 수행, 하지만 merge 버튼에 순간적으로 불이 들어옴)
              const result = mergeMidiParts(Array.from(ui.selectedClipIds));
              if (result) {
                // 병합 후 선택 상태 업데이트 (병합된 파트만 선택)
                ui.setSelectedClipIds(new Set([result.mergedPartId]));
                // merge 버튼에 순간적으로 불이 들어오도록 설정
                ui.setMergeFlashActive(true);
                setTimeout(() => {
                  ui.setMergeFlashActive(false);
                }, 200);
              }
            }
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [ui]);
};

