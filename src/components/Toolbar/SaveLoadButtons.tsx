import React, { useRef, useState, useEffect } from 'react';
import styles from './SaveLoadButtons.module.css';
import { getProject, setProject } from '../../store/projectStore';
import type { Project } from '../../types/project';
import { exportProjectToMidiFile } from '../../core/midi/MidiExporter';
import { importMidiFileToProject } from '../../core/midi/MidiParser';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { BREAKPOINTS } from '../../constants/ui';
import { useUIState } from '../../store/uiStore';
import { secondsToTicksPure, getTimeSignature, getPpqn } from '../../utils/midiTickUtils';
import { addMidiPart } from '../../store/midiPartActions';
import { addTrack } from '../../store/actions/trackActions';

/**
 * 플랫폼 타입
 * 웹과 React Native를 구분하기 위한 타입
 */
type Platform = 'web' | 'native';

/**
 * 플랫폼 감지 함수
 * Electron, React Native, 웹 환경을 자동으로 감지
 */
const detectPlatform = (): Platform => {
  // Electron 환경 감지
  if (typeof window !== 'undefined' && window.electronAPI) {
    return 'native';
  }
  // React Native 환경 감지 (나중에 확장 시 사용)
  // if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  //   return 'native';
  // }
  return 'web';
};

/**
 * 저장/불러오기 버튼 컴포넌트 Props
 */
interface SaveLoadButtonsProps {
  /** 프로젝트 저장 콜백 함수 (선택, 제공되지 않으면 기본 저장 로직 사용) */
  onSave?: (project: Project) => void;
  /** 프로젝트 불러오기 콜백 함수 (선택, 제공되지 않으면 기본 불러오기 로직 사용) */
  onLoad?: (project: Project) => void;
  /** 플랫폼 타입 (선택, 자동 감지) */
  platform?: Platform;
}

const SaveLoadButtons: React.FC<SaveLoadButtonsProps> = ({ 
  onSave,
  onLoad,
  platform,
}) => {
  const ui = useUIState();
  const currentPlatform = platform || detectPlatform();
  const isWeb = currentPlatform === 'web';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const midiFileInputRef = useRef<HTMLInputElement>(null);
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [showLoadDropdown, setShowLoadDropdown] = useState(false);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSaveNameModal, setShowSaveNameModal] = useState(false);
  const [saveMode, setSaveMode] = useState<'project' | 'midi'>('project');
  const [projectName, setProjectName] = useState('project');
  const [loadedProjectFile, setLoadedProjectFile] = useState<{
    name: string;
    midiFileName: string;
    jsonHandle?: string; // Electron 파일 경로 (덮어쓰기용)
    midiHandle?: string; // Electron 파일 경로 (덮어쓰기용)
  } | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [pendingFileInput, setPendingFileInput] = useState<HTMLInputElement | null>(null);
  const [startAsNewProject, setStartAsNewProject] = useState(true);
  const [importToSingleTrack, setImportToSingleTrack] = useState(false);
  const [startFromTrack, setStartFromTrack] = useState(1);
  const windowWidth = useWindowWidth();
  const fileButtonRef = useRef<HTMLDivElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  
  const isNarrowScreen = windowWidth <= BREAKPOINTS.ICON_ONLY;

  const handleSaveProject = () => {
    if (isWeb) {
      // 웹 환경: 항상 파일명 입력 모달 표시 (덮어쓰기 불가능하므로)
      setSaveMode('project');
      setShowSaveNameModal(true);
      setProjectName(loadedProjectFile?.name || 'project');
      // 모달이 열릴 때 입력 필드에 포커스
      setTimeout(() => {
        projectNameInputRef.current?.focus();
        projectNameInputRef.current?.select();
      }, 0);
      setShowFileDropdown(false);
    } else {
      // React Native 환경: 로드된 파일이 있으면 바로 저장, 없으면 Save As
      // TODO: React Native에서 File System Access API 사용하여 덮어쓰기 구현
      if (loadedProjectFile) {
        handleQuickSave();
        setShowFileDropdown(false);
      } else {
        handleSaveProjectAs();
      }
    }
  };

  const handleSaveProjectAs = () => {
    // Save As: 항상 프로젝트명 입력 모달 표시
    // 웹에서는 사용되지 않지만, React Native 확장을 위해 유지
    setSaveMode('project');
    setShowSaveNameModal(true);
    setProjectName(loadedProjectFile?.name || 'project');
    // 모달이 열릴 때 입력 필드에 포커스
    setTimeout(() => {
      projectNameInputRef.current?.focus();
      projectNameInputRef.current?.select();
    }, 0);
    setShowSaveDropdown(false);
  };

  const handleQuickSave = async () => {
    if (!loadedProjectFile) return;
    
    const project = getProject();
    const baseFileName = loadedProjectFile.name;
    const midiFileName = loadedProjectFile.midiFileName;
    
    // 로케이터 범위가 설정되어 있으면 해당 범위 내의 MIDI만 저장
    let rangeStartTick: number | undefined;
    let rangeEndTick: number | undefined;
    
    if (ui.exportRangeStart !== null && ui.exportRangeEnd !== null) {
      const timing = project.timing || {
        ppqn: 480,
        tempoMap: [{ tick: 0, mpqn: 500000 }],
        timeSigMap: [{ tick: 0, num: 4, den: 4 }],
      };
      const timeSignature = getTimeSignature(project);
      const ppqn = getPpqn(project);
      
      // 초를 tick으로 변환
      const startResult = secondsToTicksPure(
        ui.exportRangeStart,
        0,
        timing.tempoMap,
        timeSignature,
        ppqn
      );
      const endResult = secondsToTicksPure(
        ui.exportRangeEnd,
        0,
        timing.tempoMap,
        timeSignature,
        ppqn
      );
      
      rangeStartTick = startResult.startTick;
      rangeEndTick = endResult.startTick;
    }
    
    // 저장할 프로젝트 데이터 생성 (JSON용)
    const savedProject = {
      ...project,
      midiFileName: midiFileName,
      locatorStart: ui.exportRangeStart,
      locatorEnd: ui.exportRangeEnd,
    };
    
    const json = JSON.stringify(savedProject, null, 2);
    
    // Electron 환경: 파일 핸들로 덮어쓰기
    if (!isWeb && window.electronAPI && loadedProjectFile.jsonHandle && loadedProjectFile.midiHandle) {
      try {
        // JSON 파일 저장
        await window.electronAPI.saveFileHandle({
          filePath: loadedProjectFile.jsonHandle,
          content: json,
          isBinary: false,
        });
        
        // MIDI 파일 저장
        const midiData = exportProjectToMidiFile(project, rangeStartTick, rangeEndTick);
        await window.electronAPI.saveFileHandle({
          filePath: loadedProjectFile.midiHandle,
          content: midiData.buffer as ArrayBuffer,
          isBinary: true,
        });
      } catch (error) {
        console.error('Failed to save file:', error);
        alert('Failed to save file');
      }
      return;
    }
    
    // 웹 환경: 다운로드 (덮어쓰기 불가능)
    const jsonBlob = new Blob([json], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${baseFileName}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);
    
    // MIDI 파일 다운로드
    try {
      const midiData = exportProjectToMidiFile(project, rangeStartTick, rangeEndTick);
      const midiBlob = new Blob([midiData.buffer as ArrayBuffer], { type: 'audio/midi' });
      const midiUrl = URL.createObjectURL(midiBlob);
      const midiLink = document.createElement('a');
      midiLink.href = midiUrl;
      midiLink.download = midiFileName;
      document.body.appendChild(midiLink);
      setTimeout(() => {
        midiLink.click();
        document.body.removeChild(midiLink);
        URL.revokeObjectURL(midiUrl);
      }, 100);
    } catch (error) {
      console.error('Failed to export MIDI file:', error);
      alert('Failed to export MIDI file');
    }
  };

  const handleConfirmSave = async () => {
    const project = getProject();
    
    // 파일명 검증 (빈 문자열, 특수문자 제거)
    let baseFileName = projectName.trim() || 'project';
    // 파일명에 사용할 수 없는 문자 제거
    baseFileName = baseFileName.replace(/[<>:"/\\|?*]/g, '');
    if (baseFileName === '') {
      baseFileName = 'project';
    }
    
    if (saveMode === 'midi') {
      // MIDI만 저장
      handleExportMidiWithName(baseFileName);
      setShowSaveNameModal(false);
      return;
    }
    
    // 프로젝트 저장: JSON + MIDI 파일 모두 저장
    const midiFileName = `${baseFileName}.mid`;
    
    if (onSave) {
      onSave(project);
      setShowSaveNameModal(false);
      return;
    }
    
    // 로케이터 범위가 설정되어 있으면 해당 범위 내의 MIDI만 저장
    let rangeStartTick: number | undefined;
    let rangeEndTick: number | undefined;
    
    if (ui.exportRangeStart !== null && ui.exportRangeEnd !== null) {
      const timing = project.timing || {
        ppqn: 480,
        tempoMap: [{ tick: 0, mpqn: 500000 }],
        timeSigMap: [{ tick: 0, num: 4, den: 4 }],
      };
      const timeSignature = getTimeSignature(project);
      const ppqn = getPpqn(project);
      
      // 초를 tick으로 변환
      const startResult = secondsToTicksPure(
        ui.exportRangeStart,
        0,
        timing.tempoMap,
        timeSignature,
        ppqn
      );
      const endResult = secondsToTicksPure(
        ui.exportRangeEnd,
        0,
        timing.tempoMap,
        timeSignature,
        ppqn
      );
      
      rangeStartTick = startResult.startTick;
      rangeEndTick = endResult.startTick;
    }
    
    // 저장할 프로젝트 데이터 생성 (JSON용)
    const savedProject = {
      ...project,
      midiFileName: midiFileName,
      locatorStart: ui.exportRangeStart,
      locatorEnd: ui.exportRangeEnd,
    };
    
    const json = JSON.stringify(savedProject, null, 2);
    
    // Electron 환경: 파일 저장 다이얼로그 사용
    if (!isWeb && window.electronAPI) {
      try {
        // JSON 파일 저장
        const jsonResult = await window.electronAPI.saveFile({
          fileName: `${baseFileName}.json`,
          content: json,
          isBinary: false,
        });
        
        if (jsonResult.canceled) {
          setShowSaveNameModal(false);
          return;
        }
        
        // MIDI 파일 저장
        const midiData = exportProjectToMidiFile(project, rangeStartTick, rangeEndTick);
        const midiResult = await window.electronAPI.saveFile({
          fileName: midiFileName,
          content: midiData.buffer as ArrayBuffer,
          isBinary: true,
        });
        
        if (!midiResult.canceled && jsonResult.filePath) {
          // 파일 핸들 저장 (다음 Save 시 덮어쓰기용)
          setLoadedProjectFile({
            name: baseFileName,
            midiFileName: midiFileName,
            jsonHandle: jsonResult.filePath,
            midiHandle: midiResult.filePath || undefined,
          });
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        alert('Failed to save file');
      }
      setShowSaveNameModal(false);
      return;
    }
    
    // 웹 환경: 다운로드
    const jsonBlob = new Blob([json], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${baseFileName}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);
    
    // MIDI 파일 다운로드
    try {
      const midiData = exportProjectToMidiFile(project, rangeStartTick, rangeEndTick);
      const midiBlob = new Blob([midiData.buffer as ArrayBuffer], { type: 'audio/midi' });
      const midiUrl = URL.createObjectURL(midiBlob);
      const midiLink = document.createElement('a');
      midiLink.href = midiUrl;
      midiLink.download = midiFileName;
      document.body.appendChild(midiLink);
      setTimeout(() => {
        midiLink.click();
        document.body.removeChild(midiLink);
        URL.revokeObjectURL(midiUrl);
      }, 100);
    } catch (error) {
      console.error('Failed to export MIDI file:', error);
      alert('Failed to export MIDI file');
    }
    
    // 저장한 파일 정보를 추적하도록 업데이트 (웹에서는 파일명만 저장)
    setLoadedProjectFile({
      name: baseFileName,
      midiFileName: midiFileName,
    });
    
    setShowSaveNameModal(false);
  };

  const handleCancelSave = () => {
    setShowSaveNameModal(false);
    setProjectName('project');
  };

  const handleSaveMidiOnly = () => {
    // MIDI만 저장: 프로젝트명 입력 모달 표시
    setSaveMode('midi');
    setShowSaveNameModal(true);
    setProjectName('project');
    // 모달이 열릴 때 입력 필드에 포커스
    setTimeout(() => {
      projectNameInputRef.current?.focus();
      projectNameInputRef.current?.select();
    }, 0);
    setShowSaveDropdown(false);
  };

  const handleLoadProject = async () => {
    // Electron 환경: 파일 열기 다이얼로그 사용
    if (!isWeb && window.electronAPI) {
      try {
        const result = await window.electronAPI.loadFile({
          filters: [
            { name: 'Project Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        
        if (result.canceled || !result.content || !result.filePath) {
        setShowFileDropdown(false);
        return;
      }
      
      // 파일 내용 파싱
        const json = result.isBinary && result.content
          ? atob(result.content) // Base64 디코딩 (웹 표준 API)
          : result.content || '';
        const parsed = JSON.parse(json);
        
        if (!isValidProject(parsed)) {
          throw new Error('Invalid project structure');
        }
        
        const project = parsed as Project;
        
        // 로드된 파일 정보 저장 (파일 핸들 포함)
        const baseFileName = result.fileName?.replace(/\.json$/i, '') || 'project';
        const midiFileName = (project as any).midiFileName || `${baseFileName}.mid`;
        
        // MIDI 파일 경로 찾기 (같은 디렉토리에서)
        const jsonDir = result.filePath.substring(0, result.filePath.lastIndexOf('/') || result.filePath.lastIndexOf('\\'));
        const midiPath = `${jsonDir}/${midiFileName}`;
        
        setLoadedProjectFile({
          name: baseFileName,
          midiFileName: midiFileName,
          jsonHandle: result.filePath,
          midiHandle: midiPath, // MIDI 파일이 실제로 존재하는지는 확인하지 않음
        });
        
        // 프로젝트 로드
        if (onLoad) {
          onLoad(project);
        } else {
          setProject(project);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        alert('Failed to load project file');
      }
      setShowFileDropdown(false);
      return;
    }
    
    // 웹 환경: 파일 입력 사용
    fileInputRef.current?.click();
    setShowFileDropdown(false);
  };

  const handleLoadMidi = async () => {
    // Electron 환경: 파일 열기 다이얼로그 사용
    if (!isWeb && window.electronAPI) {
      try {
        const result = await window.electronAPI.loadFile({
          filters: [
            { name: 'MIDI Files', extensions: ['mid', 'midi'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        
        if (result.canceled || !result.content) {
          setShowFileDropdown(false);
          return;
        }
        
        // MIDI 파일 파싱
        let arrayBuffer: ArrayBuffer;
        if (result.isBinary && result.content) {
          // Base64 디코딩
          const binaryString = atob(result.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
        } else {
          arrayBuffer = new TextEncoder().encode(result.content || '').buffer;
        }
        
        const uint8Array = new Uint8Array(arrayBuffer);
        const project = importMidiFileToProject(uint8Array);
        
        // 기존 프로젝트에 MIDI 파트가 있으면 확인 모달 표시
        const currentProject = getProject();
        if (currentProject.midiParts.length > 0 || currentProject.tracks.length > 1) {
          setPendingProject(project);
          setPendingFileInput(null);
          setStartAsNewProject(true);
          setImportToSingleTrack(false);
          setStartFromTrack(currentProject.tracks.length);
          setShowConfirmModal(true);
          return;
        }
        
        // 프로젝트 로드
        if (onLoad) {
          onLoad(project);
        } else {
          setProject(project);
        }
      } catch (error) {
        console.error('Failed to load MIDI file:', error);
        alert('Failed to load MIDI file');
      }
      setShowFileDropdown(false);
      return;
    }
    
    // 웹 환경: 파일 입력 사용
    midiFileInputRef.current?.click();
    setShowFileDropdown(false);
  };

  const handleExportMidiWithName = (baseFileName: string) => {
    const project = getProject();
    try {
      // 로케이터 범위가 설정되어 있으면 해당 범위 내의 MIDI만 저장
      let rangeStartTick: number | undefined;
      let rangeEndTick: number | undefined;
      
      if (ui.exportRangeStart !== null && ui.exportRangeEnd !== null) {
        const timing = project.timing || {
          ppqn: 480,
          tempoMap: [{ tick: 0, mpqn: 500000 }],
          timeSigMap: [{ tick: 0, num: 4, den: 4 }],
        };
        const timeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        
        // 초를 tick으로 변환
        const startResult = secondsToTicksPure(
          ui.exportRangeStart,
          0,
          timing.tempoMap,
          timeSignature,
          ppqn
        );
        const endResult = secondsToTicksPure(
          ui.exportRangeEnd,
          0,
          timing.tempoMap,
          timeSignature,
          ppqn
        );
        
        rangeStartTick = startResult.startTick;
        rangeEndTick = endResult.startTick;
      }
      
      const midiFileName = `${baseFileName}.mid`;
      const midiData = exportProjectToMidiFile(project, rangeStartTick, rangeEndTick);
      const blob = new Blob([midiData.buffer as ArrayBuffer], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = midiFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export MIDI file:', error);
      alert('Failed to export MIDI file');
    }
  };

  const handleMidiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (!event.target || !(event.target.result instanceof ArrayBuffer)) {
          throw new Error('Invalid file format: expected MIDI file');
        }
        
        const arrayBuffer = event.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        const project = importMidiFileToProject(uint8Array);
        
        // 기존 프로젝트에 MIDI 파트가 있으면 확인 모달 표시
        const currentProject = getProject();
        if (currentProject.midiParts.length > 0 || currentProject.tracks.length > 1) {
          setPendingProject(project);
          setPendingFileInput(e.target);
          setStartAsNewProject(true);
          setImportToSingleTrack(false);
          setStartFromTrack(currentProject.tracks.length);
          setShowConfirmModal(true);
          return;
        }
        
        // 프로젝트 로드 (마이그레이션은 setProject 내부에서 자동 처리)
        if (onLoad) {
          onLoad(project);
        } else {
          // 기본 동작: 프로젝트를 스토어에 로드
          setProject(project);
        }
      } catch (error) {
        console.error('Failed to load MIDI file:', error);
        alert('Failed to load MIDI file');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // 파일 입력 초기화
    e.target.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // FileReader result 타입 가드
        if (!event.target || typeof event.target.result !== 'string') {
          throw new Error('Invalid file format: expected text file');
        }
        
        const json = event.target.result;
        const parsed = JSON.parse(json);
        
        // 기본적인 Project 타입 검증
        if (!isValidProject(parsed)) {
          throw new Error('Invalid project structure');
        }
        
        const project = parsed as Project;
        
        // 로드된 파일 정보 저장 (파일명만 저장)
        const baseFileName = file.name.replace(/\.json$/i, '');
        const midiFileName = (project as any).midiFileName || `${baseFileName}.mid`;
        setLoadedProjectFile({
          name: baseFileName,
          midiFileName: midiFileName,
        });
        
        // 프로젝트 로드 (마이그레이션은 setProject 내부에서 자동 처리)
        if (onLoad) {
          onLoad(project);
        } else {
          // 기본 동작: 프로젝트를 스토어에 로드
          setProject(project);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        alert('Failed to load project file');
      }
    };
    reader.readAsText(file);
    
    // 파일 입력 초기화 (같은 파일을 다시 선택할 수 있도록)
    e.target.value = '';
  };

  // Project 타입 검증 함수 (timing map 지원)
  const isValidProject = (obj: unknown): obj is Project => {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }
    
    const project = obj as Record<string, unknown>;
    
    // 필수 필드 검증
    const hasTracks = Array.isArray(project.tracks);
    const hasMidiParts = Array.isArray(project.midiParts);
    
    // timing 필드가 있어야 함
    const hasTiming = project.timing !== undefined;
    
    return hasTracks && hasMidiParts && hasTiming;
  };

  const handleConfirmLoad = () => {
    if (!pendingProject) return;
    
    if (startAsNewProject) {
      // 새 프로젝트로 시작
      if (onLoad) {
        onLoad(pendingProject);
      } else {
        setProject(pendingProject);
      }
    } else {
      // 기존 프로젝트에 임포트
      const currentProject = getProject();
      
      if (importToSingleTrack) {
        // 단일 트랙에 모두 넣기
        if (startFromTrack < 1 || startFromTrack > currentProject.tracks.length) {
          alert(`Error: Track ${startFromTrack} does not exist. Please select a valid track.`);
          return;
        }
        
        const targetTrackId = currentProject.tracks[startFromTrack - 1]?.id;
        if (!targetTrackId) {
          alert(`Error: Track ${startFromTrack} does not exist. Please select a valid track.`);
          return;
        }
        
        // 모든 MIDI 파트를 선택한 트랙에 추가
        pendingProject.midiParts.forEach(newPart => {
          const partToAdd = {
            ...newPart,
            id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            trackId: targetTrackId,
          };
          addMidiPart(partToAdd, false);
        });
      } else {
        // 트랙 번호부터 시작하여 임포트
        const newTracksCount = pendingProject.tracks.length;
        const currentTracksCount = currentProject.tracks.length;
        const startTrackIndex = startFromTrack - 1;
        
        // 트랙 범위 검증
        if (startFromTrack < 1) {
          alert(`Error: Start track number must be at least 1.`);
          return;
        }
        
        // 새 트랙을 추가하는 경우 (startFromTrack이 현재 트랙 수보다 큰 경우)
        if (startFromTrack > currentTracksCount) {
          const tracksToAdd = startFromTrack - currentTracksCount;
          const totalTracksAfterAdd = currentTracksCount + tracksToAdd + newTracksCount;
          
          if (totalTracksAfterAdd > 10) {
            const maxNewTracks = 10 - currentTracksCount;
            alert(`Error: Cannot import. Adding ${tracksToAdd} new tracks and ${newTracksCount} imported tracks would exceed the maximum of 10 tracks. Maximum ${maxNewTracks} new tracks can be added.`);
            return;
          }
        } else {
          // 기존 트랙부터 시작하는 경우
          const tracksNeeded = startTrackIndex + newTracksCount;
          
          if (tracksNeeded > 10) {
            const maxTracksFromStart = 10 - startTrackIndex;
            alert(`Error: Cannot import. Starting from track ${startFromTrack} and adding ${newTracksCount} tracks would exceed the maximum of 10 tracks. Maximum ${maxTracksFromStart} tracks can be added from track ${startFromTrack}.`);
            return;
          }
          
          // 기존 트랙이 부족한 경우 새 트랙 추가 필요
          const existingTracksAvailable = currentTracksCount - startTrackIndex;
          const newTracksNeeded = newTracksCount - existingTracksAvailable;
          
          if (newTracksNeeded > 0) {
            const totalTracksAfterAdd = currentTracksCount + newTracksNeeded;
            if (totalTracksAfterAdd > 10) {
              const maxNewTracks = 10 - currentTracksCount;
              alert(`Error: Cannot import. Need ${newTracksNeeded} new tracks but only ${maxNewTracks} can be added (maximum 10 tracks).`);
              return;
            }
          }
        }
        
        // 새 프로젝트의 트랙들을 기존 프로젝트에 추가
        let addedTracksCount = 0;
        pendingProject.tracks.forEach((newTrack, index) => {
          // 최대 10개 제한 확인
          if (currentProject.tracks.length >= 10) {
            return;
          }
          
          // 트랙 ID 충돌 방지를 위해 새 ID 생성
          const trackToAdd = {
            ...newTrack,
            id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
          };
          
          try {
            addTrack(trackToAdd);
            addedTracksCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            alert(`Error: Failed to add track ${index + 1}: ${errorMessage}`);
            return;
          }
        });
        
        // 새 프로젝트의 MIDI 파트들을 기존 프로젝트에 추가
        pendingProject.midiParts.forEach((newPart, index) => {
          // 원본 트랙 인덱스 찾기
          const originalTrackIndex = pendingProject.tracks.findIndex(t => t.id === newPart.trackId);
          const targetTrackIndex = startFromTrack - 1 + originalTrackIndex;
          const targetTrack = currentProject.tracks[targetTrackIndex];
          
          if (targetTrack) {
            const partToAdd = {
              ...newPart,
              id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
              trackId: targetTrack.id,
            };
            addMidiPart(partToAdd, false);
          } else {
            console.warn(`Warning: Target track at index ${targetTrackIndex} not found for part ${index}`);
          }
        });
      }
    }
    
    // 파일 입력 초기화
    if (pendingFileInput) {
      pendingFileInput.value = '';
    }
    
    setShowConfirmModal(false);
    setPendingProject(null);
    setPendingFileInput(null);
    setStartAsNewProject(true);
    setImportToSingleTrack(false);
  };

  const handleCancelLoad = () => {
    // 파일 입력 초기화
    if (pendingFileInput) {
      pendingFileInput.value = '';
    }
    
    setShowConfirmModal(false);
    setPendingProject(null);
    setPendingFileInput(null);
    setStartAsNewProject(true);
    setImportToSingleTrack(false);
  };

  // Ctrl+S 단축키 처리 (Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S 또는 Cmd+S
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        // 입력 필드에 포커스가 있으면 기본 동작 허용
        if (e.target instanceof HTMLElement) {
          const target = e.target;
          if (
            (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
          ) {
            return;
          }
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // 웹에서는 항상 파일명 입력 모달 표시
        // React Native에서는 로드된 파일이 있으면 빠른 저장
        handleSaveProject();
      }
      
      // Ctrl+Shift+S 또는 Cmd+Shift+S (Save As - React Native용, 웹에서는 사용 안 함)
      if (!isWeb && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        // 입력 필드에 포커스가 있으면 기본 동작 허용
        if (e.target instanceof HTMLElement) {
          const target = e.target;
          if (
            (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
          ) {
            return;
          }
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Save As: 항상 프로젝트명 입력 모달 표시 (React Native용)
        handleSaveProjectAs();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadedProjectFile, ui, isWeb]);

  // 드롭다운 외부 클릭 시 닫기
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileButtonRef.current && !fileButtonRef.current.contains(event.target as Node)) {
        setShowFileDropdown(false);
        setShowSaveDropdown(false);
        setShowLoadDropdown(false);
      }
    };

    if (showFileDropdown || showSaveDropdown || showLoadDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFileDropdown, showSaveDropdown, showLoadDropdown]);

  return (
    <div className={styles.saveLoadButtons}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={midiFileInputRef}
        type="file"
        accept=".mid,.midi"
        style={{ display: 'none' }}
        onChange={handleMidiFileChange}
      />
      <div 
        ref={fileButtonRef}
        className={styles.fileButtonContainer}
        onMouseEnter={() => setShowFileDropdown(true)}
        onMouseLeave={() => setShowFileDropdown(false)}
      >
        <button
          className={styles.fileButton}
          title="File operations"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          {!isNarrowScreen && <span>File</span>}
          {!isNarrowScreen && (
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className={styles.dropdownArrow}
            >
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          )}
        </button>
        {showFileDropdown && (
          <div 
            className={styles.fileDropdown}
            onMouseEnter={() => setShowFileDropdown(true)}
            onMouseLeave={() => setShowFileDropdown(false)}
          >
            <div className={styles.dropdownSection}>
              <div className={styles.dropdownSectionTitle}>Save</div>
              <button
                className={styles.dropdownItem}
                onClick={handleSaveProject}
                title={isWeb ? "Save project (Ctrl+S)" : (loadedProjectFile ? "Save project (Ctrl+S)" : "Save project (JSON + MIDI)")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>Save</span>
              </button>
              {!isWeb && (
                <button
                  className={styles.dropdownItem}
                  onClick={handleSaveProjectAs}
                  title="Save project as (Ctrl+Shift+S)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <span>Save As</span>
                </button>
              )}
              <button
                className={styles.dropdownItem}
                onClick={handleSaveMidiOnly}
                title="Save as MIDI only"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>Save as MIDI</span>
              </button>
            </div>
            <div className={styles.dropdownDivider}></div>
            <div className={styles.dropdownSection}>
              <div className={styles.dropdownSectionTitle}>Load</div>
              <button
                className={styles.dropdownItem}
                onClick={handleLoadProject}
                title="Load project (JSON)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>Load Project</span>
              </button>
              <button
                className={styles.dropdownItem}
                onClick={handleLoadMidi}
                title="Load MIDI file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M17 10L12 15L7 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>Load MIDI</span>
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Save Name Modal */}
      {showSaveNameModal && (
        <div className={styles.modalOverlay} onClick={handleCancelSave}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{saveMode === 'project' ? 'Save Project' : 'Save as MIDI'}</h3>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalInputGroup}>
                <label className={styles.modalInputLabel}>
                  {saveMode === 'project' ? 'Project Name:' : 'MIDI File Name:'}
                  <input
                    ref={projectNameInputRef}
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleConfirmSave();
                      } else if (e.key === 'Escape') {
                        handleCancelSave();
                      }
                    }}
                    className={styles.modalInput}
                    placeholder="project"
                    maxLength={100}
                  />
                </label>
                <p className={styles.modalHint}>
                  {saveMode === 'project' ? (
                    <>
                      Files will be saved as: <strong>{projectName.trim() || 'project'}.json</strong> and <strong>{projectName.trim() || 'project'}.mid</strong>
                    </>
                  ) : (
                    <>
                      File will be saved as: <strong>{projectName.trim() || 'project'}.mid</strong>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.modalButtonCancel}
                onClick={handleCancelSave}
              >
                Cancel
              </button>
              <button
                className={styles.modalButtonConfirm}
                onClick={handleConfirmSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className={styles.modalOverlay} onClick={handleCancelLoad}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Load MIDI File</h3>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalCheckboxGroup}>
                <label className={styles.modalCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={startAsNewProject}
                    onChange={(e) => setStartAsNewProject(e.target.checked)}
                    className={styles.modalCheckbox}
                  />
                  <span>Start as new project</span>
                </label>
                
                {!startAsNewProject && (
                  <>
                    <label className={styles.modalCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={importToSingleTrack}
                        onChange={(e) => setImportToSingleTrack(e.target.checked)}
                        className={styles.modalCheckbox}
                      />
                      <span>Import to single track</span>
                    </label>
                    
                    {!importToSingleTrack && (
                      <div className={styles.modalSelectGroup}>
                        <label className={styles.modalSelectLabel}>
                          Start from track:
                          <select
                            value={startFromTrack}
                            onChange={(e) => setStartFromTrack(Number(e.target.value))}
                            className={styles.modalSelect}
                          >
                            {getProject().tracks.map((track, index) => (
                              <option key={track.id} value={index + 1}>
                                Track {index + 1}: {track.name}
                              </option>
                            ))}
                            {getProject().tracks.length < 10 && (
                              <option value={getProject().tracks.length + 1}>
                                New track ({getProject().tracks.length + 1})
                              </option>
                            )}
                          </select>
                        </label>
                      </div>
                    )}
                    
                    {importToSingleTrack && (
                      <div className={styles.modalSelectGroup}>
                        <label className={styles.modalSelectLabel}>
                          Target track:
                          <select
                            value={startFromTrack}
                            onChange={(e) => setStartFromTrack(Number(e.target.value))}
                            className={styles.modalSelect}
                          >
                            {getProject().tracks.map((track, index) => (
                              <option key={track.id} value={index + 1}>
                                Track {index + 1}: {track.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.modalButtonCancel}
                onClick={handleCancelLoad}
              >
                Cancel
              </button>
              <button
                className={styles.modalButtonConfirm}
                onClick={handleConfirmLoad}
              >
                {startAsNewProject ? 'Load' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaveLoadButtons;
