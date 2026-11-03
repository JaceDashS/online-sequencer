import React, { useEffect, useState, useRef } from 'react';
import styles from './DeveloperPanel.module.css';
import { useUIState } from '../../store/uiStore';
import { playbackController, type ScheduleHealth } from '../../core/audio/PlaybackController';
import { AUDIO_BUFFER_CONSTANTS } from '../../constants/ui';
import {
  describeApprovalFailure,
  getJaceSession,
  hasAdminAccess,
  requestAdminApproval,
  subscribeJaceSession,
  type JaceSessionState,
} from '../../core/auth/jaceSession';
import { DEVELOPER_PANEL_PERMISSION } from '../../utils/adminPreviewPermissions';
import { isDevBuild } from '../../utils/apiConfig';
import { showError } from '../../utils/toastStore';

/**
 * 개발자 패널 표시 조건
 * - 운영: jace-s 세션의 adminAccess가 DEVELOPER_PANEL_PERMISSION(monitor read) 이상이면 숨김 없이 표시
 * - 로컬 개발 서버: 기존처럼 테마 버튼 10번 클릭(devModeEnabled)으로도 표시
 */
function canShowDeveloperPanel(session: JaceSessionState, devModeEnabled: boolean): boolean {
  if (hasAdminAccess(session, DEVELOPER_PANEL_PERMISSION.menu, DEVELOPER_PANEL_PERMISSION.level)) return true;
  return isDevBuild() && devModeEnabled;
}

/**
 * 모든 패널 동작은 적용 직전에 서버에서 권한을 다시 확인한다.
 */
async function approveDeveloperAction(): Promise<boolean> {
  const result = await requestAdminApproval(DEVELOPER_PANEL_PERMISSION.menu, DEVELOPER_PANEL_PERMISSION.level);
  if (!result.approved) {
    showError(describeApprovalFailure(result.reason));
  }
  return result.approved;
}

const DeveloperPanel: React.FC = () => {
  const ui = useUIState();
  const [session, setSession] = useState<JaceSessionState>(() => getJaceSession());
  const [pendingAction, setPendingAction] = useState(false);
  useEffect(() => subscribeJaceSession(setSession), []);
  const visible = canShowDeveloperPanel(session, ui.devModeEnabled);

  // 예약 상태·출력 지연 측정값 (1초마다 읽기만 함, 서버 요청 없음)
  const [health, setHealth] = useState<ScheduleHealth>(() => playbackController.getScheduleHealth());
  const [latency, setLatency] = useState(() => playbackController.getEngine().getLatencyInfo());
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setHealth(playbackController.getScheduleHealth());
      setLatency(playbackController.getEngine().getLatencyInfo());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [visible]);
  const [driftInput, setDriftInput] = useState(String(ui.playbackDriftMs));
  const [pitchOffsetInput, setPitchOffsetInput] = useState(String(ui.pitchOffsetMaxMs));
  const [lookaheadInput, setLookaheadInput] = useState(String(ui.scheduleLookaheadSeconds));
  const isDriftLogEnabled = ui.playbackDriftLoggingEnabled;
  const isScheduleLogEnabled = ui.scheduleLogEnabled;
  const isLongTaskLogEnabled = ui.longTaskLogEnabled;
  const [overscanInput, setOverscanInput] = useState(String(ui.timelineOverscanMultiplier));
  const isEditingDriftRef = useRef(false);
  const isEditingPitchOffsetRef = useRef(false);
  const isEditingLookaheadRef = useRef(false);
  const isEditingOverscanRef = useRef(false);
  
  // 초기값 설정 및 값 변경 시 AudioEngine에 반영
  useEffect(() => {
    if (!visible) return;
    playbackController.getEngine().setPitchOffsetMaxMs(ui.pitchOffsetMaxMs);
  }, [visible, ui.pitchOffsetMaxMs]);
  
  useEffect(() => {
    if (!visible) return;
    playbackController.setScheduleLookaheadSeconds(ui.scheduleLookaheadSeconds);
  }, [visible, ui.scheduleLookaheadSeconds]);

  if (!visible) return null;

  /**
   * 서버 승인 후에만 action을 실행한다. 거절되면 onDenied로 입력값을 되돌린다.
   */
  const runApproved = async (action: () => void, onDenied?: () => void) => {
    setPendingAction(true);
    try {
      if (await approveDeveloperAction()) {
        action();
      } else {
        onDenied?.();
      }
    } finally {
      setPendingAction(false);
    }
  };

  const commitNumberInput = (
    rawValue: string,
    fallbackValue: number,
    onCommit: (value: number) => void,
    clamp?: (value: number) => number,
    revertInput?: () => void
  ) => {
    if (rawValue.trim() === '') {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      onCommit(fallbackValue);
      return;
    }
    const nextValue = clamp ? clamp(parsed) : parsed;
    if (nextValue === fallbackValue) {
      return;
    }
    void runApproved(() => onCommit(nextValue), revertInput);
  };

  const handleDriftCommit = () => {
    commitNumberInput(
      driftInput,
      ui.playbackDriftMs,
      (value) => ui.setPlaybackDriftMs(Math.round(value)),
      (value) => Math.max(0, Math.min(500, value)),
      () => setDriftInput(String(ui.playbackDriftMs))
    );
  };

  const handlePitchOffsetCommit = () => {
    commitNumberInput(
      pitchOffsetInput,
      ui.pitchOffsetMaxMs,
      (value) => {
        const nextValue = Math.round(value);
        ui.setPitchOffsetMaxMs(nextValue);
        playbackController.getEngine().setPitchOffsetMaxMs(nextValue);
      },
      (value) => Math.max(0, Math.min(20, value)),
      () => setPitchOffsetInput(String(ui.pitchOffsetMaxMs))
    );
  };

  const handleLookaheadCommit = () => {
    commitNumberInput(
      lookaheadInput,
      ui.scheduleLookaheadSeconds,
      (value) => {
        const nextValue = Math.round(value * 100) / 100;
        ui.setScheduleLookaheadSeconds(nextValue);
        playbackController.setScheduleLookaheadSeconds(nextValue);
      },
      (value) => Math.max(0, Math.min(5, value)),
      () => setLookaheadInput(String(ui.scheduleLookaheadSeconds))
    );
  };

  const handleDriftLogToggle = () => {
    const nextValue = !isDriftLogEnabled;
    void runApproved(() => ui.setPlaybackDriftLoggingEnabled(nextValue));
  };

  const handleScheduleLogToggle = () => {
    const nextValue = !isScheduleLogEnabled;
    void runApproved(() => ui.setScheduleLogEnabled(nextValue));
  };

  const handleLongTaskLogToggle = () => {
    const nextValue = !isLongTaskLogEnabled;
    void runApproved(() => ui.setLongTaskLogEnabled(nextValue));
  };

  const handleOverscanCommit = () => {
    commitNumberInput(
      overscanInput,
      ui.timelineOverscanMultiplier,
      (value) => {
        const nextValue = Math.round(value * 100) / 100;
        ui.setTimelineOverscanMultiplier(nextValue);
      },
      (value) => Math.max(0, Math.min(2, value)),
      () => setOverscanInput(String(ui.timelineOverscanMultiplier))
    );
  };

  const handleLevelMeterToggle = () => {
    const nextValue = !ui.levelMeterEnabled;
    void runApproved(() => ui.setLevelMeterEnabled(nextValue));
  };

  const handleProjectSubscriptionToggle = () => {
    const nextValue = !ui.timelineProjectSubscriptionEnabled;
    void runApproved(() => ui.setTimelineProjectSubscriptionEnabled(nextValue));
  };

  const handleBufferChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      void runApproved(() => ui.setAudioBufferSize(nextValue));
    }
  };

  const handleLogChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (Number.isFinite(nextValue)) {
      void runApproved(() => ui.setDebugLogBufferSize(nextValue));
    }
  };

  // BUF(이전 명칭): 실제 렌더링 버퍼가 아니라 UI 틱 간격과 latencyHint 선호값을 함께 정하는 값
  const bufferOptions = AUDIO_BUFFER_CONSTANTS.BUFFER_SIZES.map((size) => ({
    label: `${size} · ${Math.round((size / AUDIO_BUFFER_CONSTANTS.SAMPLE_RATE) * AUDIO_BUFFER_CONSTANTS.PERIODS * 1000)}ms`,
    value: size,
  }));
  const formatMs = (seconds: number | null) => (seconds === null ? '—' : `${(seconds * 1000).toFixed(1)}ms`);

  const handleAutoLookaheadToggle = () => {
    const nextValue = !health.autoEnabled;
    void runApproved(() => {
      playbackController.setAutoLookaheadEnabled(nextValue);
      setHealth(playbackController.getScheduleHealth());
    });
  };

  const handleScheduleHealthReset = () => {
    void runApproved(() => {
      playbackController.resetScheduleHealth();
      setHealth(playbackController.getScheduleHealth());
    });
  };

  const logOptions = [
    { label: 'OFF', value: 0 },
    { label: '60', value: 60 },
    { label: '120', value: 120 },
    { label: '300', value: 300 },
    { label: '600', value: 600 },
  ];

  return (
    <div className={styles.devPanel}>
      <div className={styles.headerContainer}>
        <div className={styles.header}>DEV</div>
        {pendingAction && <span className={styles.pending}>checking permission…</span>}
      </div>
      <div className={styles.controls}>
        <div className={styles.row}>
          <span className={styles.label}>DRIFT</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={500}
              step={1}
              value={driftInput}
              onChange={(event) => setDriftInput(event.target.value)}
              onFocus={() => { isEditingDriftRef.current = true; }}
              onBlur={() => { isEditingDriftRef.current = false; handleDriftCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>DRIFT LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isDriftLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleDriftLogToggle}
            >
              [{isDriftLogEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>SCHEDULE LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isScheduleLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleScheduleLogToggle}
            >
              [{isScheduleLogEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LONGTASK LOG</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${isLongTaskLogEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleLongTaskLogToggle}
            >
              [{isLongTaskLogEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label} title="UI tick interval and AudioContext latencyHint preference. Not the Web Audio render buffer (fixed 128 frames).">LATENCY HINT</span>
          <div className={styles.field}>
            <select
              className={`${styles.select} ${styles.selectWide}`}
              value={ui.audioBufferSize}
              onChange={handleBufferChange}
            >
              {bufferOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label} title="Values reported by the browser. latencyHint changes apply after playback stops.">ACTUAL</span>
          <span className={styles.value}>
            base {formatMs(latency.baseLatency)} / out {formatMs(latency.outputLatency)}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LOG</span>
          <div className={styles.field}>
            <select
              className={styles.select}
              value={ui.debugLogBufferSize}
              onChange={handleLogChange}
            >
              {logOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>PITCH OFFSET</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={20}
              step={1}
              value={pitchOffsetInput}
              onChange={(event) => setPitchOffsetInput(event.target.value)}
              onFocus={() => { isEditingPitchOffsetRef.current = true; }}
              onBlur={() => { isEditingPitchOffsetRef.current = false; handlePitchOffsetCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>ms</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>LOOKAHEAD</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={lookaheadInput}
              onChange={(event) => setLookaheadInput(event.target.value)}
              onFocus={() => { isEditingLookaheadRef.current = true; }}
              onBlur={() => { isEditingLookaheadRef.current = false; handleLookaheadCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>s</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label} title="Raise the lookahead automatically when scheduled audio runs low">AUTO LOOKAHEAD</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${health.autoEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleAutoLookaheadToggle}
            >
              [{health.autoEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>EFFECTIVE</span>
          <span className={styles.value}>
            {health.effectiveLookaheadSeconds.toFixed(2)}s
            {health.autoExtraSeconds > 0 ? ` (+${health.autoExtraSeconds.toFixed(2)} auto ×${health.autoIncreaseCount})` : ''}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label} title="Scheduler ticks with less than 50ms of audio scheduled / none scheduled">LOW / EMPTY</span>
          <span className={styles.value}>
            {health.lowCount} / {health.depletedCount}
            {health.minRemainingSeconds !== null ? ` · min ${formatMs(health.minRemainingSeconds)}` : ''}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>SCHEDULE</span>
          <div className={styles.field}>
            <button type="button" className={styles.toggleButton} onClick={handleScheduleHealthReset}>
              RESET
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>METER</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${ui.levelMeterEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleLevelMeterToggle}
            >
              [{ui.levelMeterEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>SUB PROJ</span>
          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.toggleButton} ${ui.timelineProjectSubscriptionEnabled ? styles.toggleButtonOn : styles.toggleButtonOff}`}
              onClick={handleProjectSubscriptionToggle}
            >
              [{ui.timelineProjectSubscriptionEnabled ? 'ON' : 'OFF'}]
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>OVERSCAN</span>
          <div className={styles.field}>
            <input
              className={styles.input}
              type="number"
              min={0}
              max={2}
              step={0.05}
              value={overscanInput}
              onChange={(event) => setOverscanInput(event.target.value)}
              onFocus={() => { isEditingOverscanRef.current = true; }}
              onBlur={() => { isEditingOverscanRef.current = false; handleOverscanCommit(); }}
              onKeyDown={(event) => { if (event.key === 'Enter') { (event.target as HTMLInputElement).blur(); } }}
            />
            <span className={styles.unit}>x</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperPanel;



















