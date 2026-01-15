import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './Inspector.module.css';
import EffectItem from './EffectItem';
import { getProject, addEffectToTrack, removeEffectFromTrack, updateEffectInTrack, reorderEffectsInTrack, addEffectToMaster, removeEffectFromMaster, updateEffectInMaster, reorderEffectsInMaster, subscribeToTrackChanges, subscribeToProjectChanges } from '../../store/projectStore';
import { findTrackById } from '../../store/projectState';
import { getBpm, getTimeSignature } from '../../utils/midiTickUtils';
import type { Effect } from '../../types/project';

/**
 * 인스펙터 컴포넌트 Props
 * 선택된 트랙의 속성과 이펙터를 편집할 수 있는 사이드 패널입니다.
 */
interface InspectorProps {
  /** 선택된 트랙 ID (선택, 없으면 마스터 채널 표시) */
  selectedTrackId?: string;
}

const Inspector: React.FC<InspectorProps> = ({ selectedTrackId }) => {
  const [updateCounter, setUpdateCounter] = useState(0);
  const project = getProject();
  
  // 선택된 트랙이 없으면 null
  const trackId = selectedTrackId || null;
  const isMaster = trackId === 'master';
  
  // BPM과 Time Signature 가져오기 (딜레이 이펙트용)
  const bpm = useMemo(() => getBpm(project), [project, updateCounter]);
  const timeSignature = useMemo(() => getTimeSignature(project), [project, updateCounter]);
  
  // track과 effects를 useMemo로 메모이제이션
  const track = useMemo(() => {
    return trackId && !isMaster ? findTrackById(trackId) : null;
  }, [trackId, isMaster, updateCounter]);
  
  const masterEffects = useMemo(() => {
    return isMaster ? (project.masterEffects || []) : [];
  }, [isMaster, project.masterEffects, updateCounter]);
  
  const effects = useMemo(() => {
    return isMaster ? masterEffects : (track ? track.effects : []);
  }, [isMaster, masterEffects, track]);
  
  // 드래그 앤 드롭 상태 관리
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);

  // 프로젝트 변경 감지 (pub-sub 패턴)
  useEffect(() => {
    const unsubscribeProject = subscribeToProjectChanges((event) => {
      // 마스터 이펙트 변경 또는 트랙 변경 감지
      if (event.type === 'master' || (event.type === 'track' && isMaster)) {
        setUpdateCounter(prev => prev + 1);
      }
    });
    const unsubscribeTrack = subscribeToTrackChanges((event) => {
      // 선택된 트랙의 변경만 처리
      if (event.trackId === trackId && !isMaster) {
        setUpdateCounter(prev => prev + 1);
      }
    });
    return () => {
      unsubscribeProject();
      unsubscribeTrack();
    };
  }, [trackId, isMaster]);

  const handleAddEffect = useCallback((type: 'eq' | 'delay' | 'reverb') => {
    if (!trackId) return;
    
    // 최대 4개의 이펙트 제한
    if (effects.length >= 4) return;

    const defaultParams: Effect['params'] = {};
    if (type === 'eq') {
      defaultParams.lowGain = 0;
      defaultParams.midGain = 0;
      defaultParams.highGain = 0;
      defaultParams.q = 5;
    } else if (type === 'delay') {
      defaultParams.delayDivision = 1; // 기본값: 1박자
      defaultParams.feedback = 30;
      defaultParams.mix = 30;
    } else if (type === 'reverb') {
      defaultParams.roomSize = 50;
      defaultParams.dampening = 30;
      defaultParams.wetLevel = 30;
    }

    const newEffect: Effect = {
      type,
      enabled: true,
      params: defaultParams,
    };

    if (isMaster) {
      addEffectToMaster(newEffect);
    } else {
      addEffectToTrack(trackId, newEffect);
    }
  }, [trackId, isMaster, effects.length]);

  const handleUpdateEffect = useCallback((trackId: string, effectIndex: number, updates: Partial<Effect>) => {
    if (isMaster) {
      updateEffectInMaster(effectIndex, updates);
    } else {
      updateEffectInTrack(trackId, effectIndex, updates);
    }
  }, [isMaster]);

  const handleRemoveEffect = useCallback((trackId: string, effectIndex: number) => {
    if (isMaster) {
      removeEffectFromMaster(effectIndex);
    } else {
      removeEffectFromTrack(trackId, effectIndex);
    }
  }, [isMaster]);

  const handleReorderEffects = useCallback((trackId: string, fromIndex: number, toIndex: number) => {
    if (isMaster) {
      reorderEffectsInMaster(fromIndex, toIndex);
    } else {
      reorderEffectsInTrack(trackId, fromIndex, toIndex);
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setDropPosition(null);
  }, [isMaster]);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
    setDropPosition(null);
  }, []);

  const handleDragOver = useCallback((index: number, position: 'above' | 'below', e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(index);
    setDropPosition(position);
  }, []);

  const handleDrop = useCallback((index: number, position: 'above' | 'below') => {
    if (draggedIndex !== null && draggedIndex !== index) {
      let targetIndex: number;
      if (position === 'above') {
        targetIndex = index;
      } else {
        targetIndex = index + 1;
      }
      
      // 드래그한 아이템이 타겟보다 위에 있으면 인덱스 조정 필요
      let adjustedToIndex = targetIndex;
      if (draggedIndex < targetIndex) {
        adjustedToIndex = targetIndex - 1;
      }
      
      if (draggedIndex !== adjustedToIndex) {
        handleReorderEffects(trackId!, draggedIndex, adjustedToIndex);
      }
    }
    handleDragEnd();
  }, [draggedIndex, trackId, handleReorderEffects, handleDragEnd]);

  if (!trackId) {
    return (
      <div className={styles.inspector}>
        <div className={styles.inspectorHeader}>
          <h3 className={styles.inspectorTitle}>Inspector</h3>
        </div>
        <div className={styles.inspectorContent}>
          <div className={styles.emptyState}>No track selected</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHeader}>
        <h3 className={styles.inspectorTitle}>Inspector</h3>
      </div>
      <div className={styles.inspectorContent}>
        <div className={styles.effectsSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Effects</div>
            <button
              className={styles.addEffectButton}
              onClick={() => handleAddEffect('eq')}
              title={effects.length >= 4 ? "Maximum 4 effects allowed" : "Add Effect"}
              disabled={!trackId || effects.length >= 4}
            >
              +
            </button>
          </div>
          <div className={styles.effectsChain}>
            {/* Input 컨테이너 */}
            <div className={styles.chainNode}>
              <div className={styles.chainItem}>
                <div className={styles.ioLabel}>
                  {isMaster ? 'MASTER' : (track ? track.name.toUpperCase() : 'INPUT')}
                </div>
              </div>
            </div>
            {/* 이펙트 리스트 */}
            {effects.length === 0 ? (
              <div className={styles.chainConnector}></div>
            ) : (
              effects.map((effect, index) => (
                <React.Fragment key={`effect-${trackId}-${index}`}>
                  {/* 드롭 가이드 - 위쪽 (첫 번째 이펙트만 또는 드래그 중일 때) */}
                  <div 
                    className={`${styles.dropGuide} ${dropTargetIndex === index && dropPosition === 'above' && draggedIndex !== null && draggedIndex !== index ? styles.dropGuideActive : ''}`}
                    onDragOver={(e) => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handleDragOver(index, 'above', e);
                      }
                    }}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handleDrop(index, 'above');
                      }
                    }}
                  />
                  <div className={styles.chainConnector}></div>
                  <div className={styles.chainNode}>
                    <div className={styles.chainItemWrapper}>
                      <EffectItem
                        effect={effect}
                        effectIndex={index}
                        trackId={trackId!}
                        onUpdate={handleUpdateEffect}
                        onRemove={handleRemoveEffect}
                        onReorder={handleReorderEffects}
                        isDraggable={true}
                        onDragStart={() => handleDragStart(index)}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedIndex === index}
                        bpm={bpm}
                        timeSignature={timeSignature}
                      />
                    </div>
                  </div>
                  {/* 드롭 가이드 - 아래쪽 (모든 이펙트 뒤) */}
                  <div 
                    className={`${styles.dropGuide} ${dropTargetIndex === index && dropPosition === 'below' && draggedIndex !== null && draggedIndex !== index ? styles.dropGuideActive : ''}`}
                    onDragOver={(e) => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handleDragOver(index, 'below', e);
                      }
                    }}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handleDrop(index, 'below');
                      }
                    }}
                  />
                </React.Fragment>
              ))
            )}
            {/* Output 컨테이너 */}
            {effects.length > 0 && <div className={styles.chainConnector}></div>}
            <div className={styles.chainNode}>
              <div className={styles.chainItem}>
                <div className={styles.ioLabel}>
                  {isMaster ? 'OUTPUT' : 'MASTER CHANNEL'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inspector;
