import { useCallback, useEffect, useMemo, useState } from 'react';
import qaProjectRaw from '../../case-tests/fixtures/qa-project.json?raw';
import { getApiBaseUrl } from '../utils/apiConfig';
import { qaScenarios, type QaExecutor, type QaScale } from '../qa/qaScenarios';
import styles from './QaPage.module.css';

type QaStatus = 'not-run' | 'pass' | 'fail' | 'blocked';
type ResultSource = 'manual' | 'preflight';
type ServerState = 'unchecked' | 'checking' | 'online' | 'offline' | 'unconfigured';

interface QaResult {
  status: QaStatus;
  note: string;
  updatedAt: string | null;
  source: ResultSource;
}

interface ServerCheck {
  state: ServerState;
  message: string;
  checkedAt: string | null;
  baseUrl: string | null;
}

interface ViewportInfo {
  width: number;
  height: number;
  dpr: number;
}

const RESULT_STORAGE_KEY = 'online-sequencer-qa-results-v1';
const TARGET_VIEWPORT = { width: 1280, height: 720 };
const validStatuses: QaStatus[] = ['not-run', 'pass', 'fail', 'blocked'];

const statusLabels: Record<QaStatus, string> = {
  'not-run': 'NOT RUN',
  pass: 'PASS',
  fail: 'FAIL',
  blocked: 'BLOCKED',
};

const serverLabels: Record<ServerState, string> = {
  unchecked: 'NOT CHECKED',
  checking: 'CHECKING',
  online: 'ONLINE',
  offline: 'OFFLINE',
  unconfigured: 'NOT CONFIGURED',
};

const executorLabels: Record<QaExecutor, string> = {
  browser: 'Codex 브라우저',
  user: '사용자 직접 확인',
};

const scaleLabels: Record<QaScale, string> = {
  large: '큰 시나리오',
  focused: '집중 시나리오',
};

const scenarioGroups: Array<{
  executor: QaExecutor;
  scale: QaScale;
  title: string;
}> = [
  { executor: 'browser', scale: 'large', title: '2. Codex 브라우저 · 큰 시나리오' },
  { executor: 'browser', scale: 'focused', title: '2. Codex 브라우저 · 집중 시나리오' },
  { executor: 'user', scale: 'large', title: '3. 사용자 · 큰 시나리오' },
  { executor: 'user', scale: 'focused', title: '3. 사용자 · 집중 시나리오' },
];

function emptyResult(): QaResult {
  return {
    status: 'not-run',
    note: '',
    updatedAt: null,
    source: 'manual',
  };
}

function loadStoredResults(): Record<string, QaResult> {
  try {
    const raw = window.localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const restored: Record<string, QaResult> = {};
    for (const [scenarioId, value] of Object.entries(parsed)) {
      if (typeof value !== 'object' || value === null) continue;

      const candidate = value as Partial<QaResult>;
      if (!candidate.status || !validStatuses.includes(candidate.status)) continue;

      restored[scenarioId] = {
        status: candidate.status,
        note: typeof candidate.note === 'string' ? candidate.note : '',
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
        source: candidate.source === 'preflight' ? 'preflight' : 'manual',
      };
    }
    return restored;
  } catch {
    return {};
  }
}

function currentViewport(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio,
  };
}

function downloadTextFile(fileName: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatTime(value: string | null): string {
  if (!value) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function QaPage() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(qaScenarios[0].id);
  const [results, setResults] = useState<Record<string, QaResult>>(loadStoredResults);
  const [viewport, setViewport] = useState<ViewportInfo>(currentViewport);
  const [server, setServer] = useState<ServerCheck>({
    state: 'unchecked',
    message: '서버 상태를 아직 확인하지 않았습니다.',
    checkedAt: null,
    baseUrl: null,
  });
  const [validationMessage, setValidationMessage] = useState('');

  const selectedIndex = qaScenarios.findIndex((scenario) => scenario.id === selectedScenarioId);
  const selectedScenario = qaScenarios[selectedIndex] ?? qaScenarios[0];
  const selectedResult = results[selectedScenario.id] ?? emptyResult();
  const isTargetViewport = viewport.width === TARGET_VIEWPORT.width
    && viewport.height === TARGET_VIEWPORT.height;
  const isServerScenarioUnavailable = selectedScenario.requiresServer && server.state !== 'online';

  const counts = useMemo(() => {
    const next: Record<QaStatus, number> = {
      'not-run': 0,
      pass: 0,
      fail: 0,
      blocked: 0,
    };

    for (const scenario of qaScenarios) {
      next[(results[scenario.id] ?? emptyResult()).status] += 1;
    }
    return next;
  }, [results]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(results));
    } catch {
      setValidationMessage('브라우저 저장소를 사용할 수 없어 새로고침하면 결과가 사라질 수 있습니다.');
    }
  }, [results]);

  useEffect(() => {
    const updateViewport = () => setViewport(currentViewport());
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const applyServerAvailability = useCallback((available: boolean, reason: string) => {
    setResults((previous) => {
      const next = { ...previous };

      for (const scenario of qaScenarios) {
        if (!scenario.requiresServer) continue;

        const existing = next[scenario.id];
        if (available) {
          if (existing?.source === 'preflight') delete next[scenario.id];
          continue;
        }

        if (!existing || existing.status === 'not-run' || existing.source === 'preflight') {
          next[scenario.id] = {
            status: 'blocked',
            note: reason,
            updatedAt: new Date().toISOString(),
            source: 'preflight',
          };
        }
      }
      return next;
    });
  }, []);

  const checkServer = useCallback(async () => {
    setServer((previous) => ({
      ...previous,
      state: 'checking',
      message: '협업 API 응답을 기다리는 중입니다.',
    }));

    let baseUrl: string;
    try {
      baseUrl = getApiBaseUrl();
    } catch {
      const reason = 'API 환경 변수가 없어 서버 테스트를 실행할 수 없습니다.';
      setServer({
        state: 'unconfigured',
        message: reason,
        checkedAt: new Date().toISOString(),
        baseUrl: null,
      });
      applyServerAvailability(false, reason);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${baseUrl}/rooms`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const message = `API가 HTTP ${response.status}로 응답했습니다.`;
      setServer({
        state: 'online',
        message,
        checkedAt: new Date().toISOString(),
        baseUrl,
      });
      applyServerAvailability(true, '');
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      const reason = isTimeout
        ? '3초 안에 API 응답이 없어 서버 테스트를 보류했습니다.'
        : 'API에 연결할 수 없어 서버 테스트를 보류했습니다.';
      setServer({
        state: 'offline',
        message: reason,
        checkedAt: new Date().toISOString(),
        baseUrl,
      });
      applyServerAvailability(false, reason);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [applyServerAvailability]);

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  const updateNote = (note: string) => {
    setValidationMessage('');
    setResults((previous) => ({
      ...previous,
      [selectedScenario.id]: {
        ...(previous[selectedScenario.id] ?? emptyResult()),
        note,
      },
    }));
  };

  const recordResult = (status: QaStatus) => {
    if (status === 'fail' && !selectedResult.note.trim()) {
      setValidationMessage('FAIL에는 재현 조건이나 실제 결과를 반드시 적어 주세요.');
      return;
    }

    setValidationMessage('');
    if (status === 'not-run') {
      setResults((previous) => {
        const next = { ...previous };
        delete next[selectedScenario.id];
        return next;
      });
      return;
    }

    setResults((previous) => ({
      ...previous,
      [selectedScenario.id]: {
        status,
        note: selectedResult.note.trim(),
        updatedAt: new Date().toISOString(),
        source: 'manual',
      },
    }));
  };

  const resetRun = () => {
    if (!window.confirm('현재 QA 결과와 메모를 모두 지우시겠습니까?')) return;
    setResults({});
    setValidationMessage('');
    void checkServer();
  };

  const exportReport = () => {
    const generatedAt = new Date().toISOString();
    const report = {
      schemaVersion: 1,
      generatedAt,
      targetViewport: TARGET_VIEWPORT,
      actualViewport: viewport,
      server,
      summary: counts,
      scenarios: qaScenarios.map((scenario) => ({
        ...scenario,
        result: results[scenario.id] ?? emptyResult(),
      })),
    };
    downloadTextFile(
      `online-sequencer-qa-${generatedAt.replace(/[:.]/g, '-')}.json`,
      JSON.stringify(report, null, 2),
    );
  };

  const moveSelection = (offset: number) => {
    const nextIndex = Math.min(Math.max(selectedIndex + offset, 0), qaScenarios.length - 1);
    setSelectedScenarioId(qaScenarios[nextIndex].id);
    setValidationMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>DEVELOPMENT ONLY · INTEGRATION QA</p>
          <h1>Online Sequencer 통합 테스트</h1>
          <p className={styles.headerDescription}>
            스크립트 → Codex 브라우저 → 사용자 확인 순서로 진행하며, 각 단계는 큰 시나리오부터 시작합니다.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={exportReport}>
            결과 JSON 내보내기
          </button>
          <button type="button" className={styles.dangerButton} onClick={resetRun}>
            새 실행으로 초기화
          </button>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.workflow} aria-label="테스트 우선순위">
          <article className={styles.workflowCard}>
            <span className={styles.stepNumber}>1</span>
            <div>
              <strong>스크립트 통합 테스트</strong>
              <code>npm test</code>
              <p>실패가 있으면 브라우저 테스트보다 먼저 해결합니다.</p>
            </div>
          </article>
          <article className={styles.workflowCard}>
            <span className={styles.stepNumber}>2</span>
            <div>
              <strong>Codex 브라우저 테스트</strong>
              <p>1280×720 Chromium에서 오른쪽 시나리오를 직접 조작합니다.</p>
            </div>
          </article>
          <article className={styles.workflowCard}>
            <span className={styles.stepNumber}>3</span>
            <div>
              <strong>사용자 직접 테스트</strong>
              <p>청취, 실제 장치, 외부망, Electron처럼 사람과 환경이 필요한 항목만 확인합니다.</p>
            </div>
          </article>
        </section>

        <section className={styles.preflight} aria-label="테스트 사전 점검">
          <article className={styles.preflightCard}>
            <div className={styles.preflightHeading}>
              <span>브라우저 기준</span>
              <span className={styles.statusBadge} data-status={isTargetViewport ? 'pass' : 'blocked'}>
                {isTargetViewport ? 'READY' : 'DIFFERENT'}
              </span>
            </div>
            <strong>{viewport.width} × {viewport.height}</strong>
            <p>DPR {viewport.dpr} · 기준 {TARGET_VIEWPORT.width} × {TARGET_VIEWPORT.height}</p>
          </article>

          <article className={styles.preflightCard}>
            <div className={styles.preflightHeading}>
              <span>협업 서버</span>
              <span className={styles.statusBadge} data-status={server.state}>
                {serverLabels[server.state]}
              </span>
            </div>
            <strong>{server.baseUrl ?? 'API URL 없음'}</strong>
            <p>{server.message} · {formatTime(server.checkedAt)}</p>
            <button
              type="button"
              className={styles.inlineButton}
              onClick={() => void checkServer()}
              disabled={server.state === 'checking'}
            >
              서버 다시 확인
            </button>
          </article>

          <article className={styles.preflightCard}>
            <div className={styles.preflightHeading}>
              <span>고정 테스트 데이터</span>
              <span className={styles.statusBadge} data-status="pass">READY</span>
            </div>
            <strong>qa-project.json</strong>
            <p>3개 트랙 · 짧은 파트 3개 · 긴 파트 1개 · 빈 트랙 1개</p>
            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.inlineButton}
                onClick={() => downloadTextFile('qa-project.json', qaProjectRaw)}
              >
                프로젝트 받기
              </button>
              <a className={styles.inlineLink} href="/" target="_blank" rel="noreferrer">
                앱 새 탭 열기
              </a>
            </div>
          </article>
        </section>

        <section className={styles.summary} aria-label="테스트 결과 요약">
          {(Object.keys(statusLabels) as QaStatus[]).map((status) => (
            <div key={status} className={styles.summaryItem} data-status={status}>
              <span>{statusLabels[status]}</span>
              <strong>{counts[status]}</strong>
            </div>
          ))}
        </section>

        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <strong>시나리오</strong>
              <span>{counts.pass + counts.fail + counts.blocked}/{qaScenarios.length} 판정</span>
            </div>

            {scenarioGroups.map((group) => {
              const scenarios = qaScenarios.filter((scenario) => (
                scenario.executor === group.executor && scenario.scale === group.scale
              ));
              return (
                <section key={`${group.executor}-${group.scale}`} className={styles.scenarioGroup}>
                  <h2>{group.title}</h2>
                  {scenarios.map((scenario) => {
                    const status = (results[scenario.id] ?? emptyResult()).status;
                    return (
                      <button
                        type="button"
                        key={scenario.id}
                        className={styles.scenarioButton}
                        data-active={scenario.id === selectedScenario.id}
                        onClick={() => {
                          setSelectedScenarioId(scenario.id);
                          setValidationMessage('');
                        }}
                      >
                        <span className={styles.statusDot} data-status={status} />
                        <span>
                          <small>{scenario.id}{scenario.requiresServer ? ' · SERVER' : ''}</small>
                          <strong>{scenario.title}</strong>
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </aside>

          <article className={styles.scenarioPanel}>
            <div className={styles.scenarioHeading}>
              <div>
                <div className={styles.badges}>
                  <span>{selectedScenario.id}</span>
                  <span>{executorLabels[selectedScenario.executor]}</span>
                  <span>{scaleLabels[selectedScenario.scale]}</span>
                  <span>약 {selectedScenario.estimatedMinutes}분</span>
                  {selectedScenario.requiresServer && <span className={styles.serverRequired}>SERVER</span>}
                </div>
                <h2>{selectedScenario.title}</h2>
                <p>{selectedScenario.summary}</p>
              </div>
              <span className={styles.resultPill} data-status={selectedResult.status}>
                {statusLabels[selectedResult.status]}
              </span>
            </div>

            {isServerScenarioUnavailable && (
              <div className={styles.blockedNotice} role="status">
                서버가 준비되지 않아 이 시나리오는 실패가 아니라 BLOCKED입니다. 오프라인 시나리오는 계속 진행할 수 있습니다.
              </div>
            )}

            <section className={styles.detailSection}>
              <h3>사전조건</h3>
              <ol>
                {selectedScenario.prerequisites.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </section>

            <section className={styles.detailSection}>
              <h3>실행 절차</h3>
              <ol>
                {selectedScenario.steps.map((item) => <li key={item}>{item}</li>)}
              </ol>
            </section>

            <section className={styles.detailSection}>
              <h3>기대 결과</h3>
              <ul>
                {selectedScenario.expected.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>

            <section className={styles.detailSection}>
              <h3>포함 범위</h3>
              <div className={styles.coverageList}>
                {selectedScenario.coverage.map((item) => <span key={item}>{item}</span>)}
              </div>
            </section>

            <section className={styles.resultSection}>
              <div className={styles.resultSectionHeading}>
                <div>
                  <h3>결과 기록</h3>
                  <p>FAIL이면 실제 결과와 재현 조건을 적습니다. 서버나 장비 문제는 BLOCKED로 구분합니다.</p>
                </div>
                <small>마지막 판정: {formatTime(selectedResult.updatedAt)}</small>
              </div>
              <label htmlFor="qa-note">메모 / 실제 결과</label>
              <textarea
                id="qa-note"
                value={selectedResult.note}
                onChange={(event) => updateNote(event.target.value)}
                placeholder="예: 6단계에서 Ctrl+Y 후 두 번째 파트의 노트가 사라짐. Chrome 1280×720에서 2회 재현."
                rows={5}
              />
              {validationMessage && (
                <p className={styles.validationMessage} role="alert">{validationMessage}</p>
              )}
              <div className={styles.resultActions}>
                <button
                  type="button"
                  data-status="pass"
                  onClick={() => recordResult('pass')}
                  disabled={isServerScenarioUnavailable}
                >
                  PASS
                </button>
                <button
                  type="button"
                  data-status="fail"
                  onClick={() => recordResult('fail')}
                  disabled={isServerScenarioUnavailable}
                >
                  FAIL
                </button>
                <button type="button" data-status="blocked" onClick={() => recordResult('blocked')}>
                  BLOCKED
                </button>
                <button type="button" data-status="not-run" onClick={() => recordResult('not-run')}>
                  NOT RUN
                </button>
              </div>
            </section>

            <footer className={styles.scenarioFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => moveSelection(-1)}
                disabled={selectedIndex === 0}
              >
                이전 시나리오
              </button>
              <span>{selectedIndex + 1} / {qaScenarios.length}</span>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => moveSelection(1)}
                disabled={selectedIndex === qaScenarios.length - 1}
              >
                다음 시나리오
              </button>
            </footer>
          </article>
        </div>
      </main>
    </div>
  );
}

export default QaPage;
