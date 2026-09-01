# 오디오 재생 렉에 따른 노트 타이밍 지연 분석

**작성일**: 2026-08-29

**대상 버전**: 0.1.0

**범위**: 원인 분석, 개선안, 구현 및 검증 결과

## 결론

분석 결과, 현상의 주원인은 수정 전 **오디오 스케줄러가 UI용 재생 시간을 기준으로 매 주기마다 오디오 시계를 다시 맞추던 구조**일 가능성이 높았다. 메인 스레드가 멈추면 UI용 시간이 오래된 값으로 남고, 이후 노트가 그만큼 늦은 `AudioContext` 시각에 예약될 수 있었다. 이 경우 소리는 끊기기보다 노트가 뒤로 끌리며 박자가 밀리는 형태로 들린다.

추가로, 수정 전에는 피아노의 같은 pitch class가 겹칠 때 노트 시작을 3ms씩 누적 지연했다. 이 값은 이름과 달리 총 지연의 최댓값이 아니어서 동시 보이스가 많으면 3ms, 6ms, 9ms처럼 계속 증가했다. 이는 렉과 무관하게 실제 박자를 변형하던 확정 요인이며, 이번 변경에서 기본 비활성화하고 상한을 적용했다.

권장 우선순위는 다음과 같다.

1. 오디오 예약의 기준을 `playbackTimeStore`에서 `AudioContext.currentTime` 기반의 고정 앵커로 변경한다.
2. 준비가 끝난 뒤 UI 클록과 오디오 재생을 같은 시점에 시작한다.
3. pitch class 시간 오프셋을 제거하거나 기본값을 0으로 바꾸고, 피크 문제는 게인으로 해결한다.
4. 레벨 미터의 프레임별 할당과 React 렌더를 줄인다.
5. 측정 결과에 따라 lookahead를 동적으로 조정한다.

`AudioWorklet` 전환은 첫 번째 해결책으로 권장하지 않는다. 현재 샘플 기반 구조는 Web Audio의 선행 예약만 올바르게 사용해도 메인 스레드 렉과 상당 부분 분리할 수 있다.

## 구현 결과

2026-08-29에 다음 개선을 적용했다.

- `AudioContext.currentTime`과 프로젝트 타임라인을 연결하는 고정 앵커를 도입했다.
- 노트와 메트로놈 예약이 UI용 `playbackTimeStore`를 기준으로 다시 매핑되지 않도록 변경했다.
- 샘플 준비 완료 후 75ms lead를 두고 오디오와 Worker 클록을 함께 시작하도록 변경했다.
- seek도 새 오디오 앵커와 Worker 클록의 지연 시작을 함께 적용한다.
- 기본 lookahead를 0.75초로 늘리고 스케줄 확인 간격을 50ms로 줄였다.
- pitch class 오프셋 기본값을 0ms로 변경하고, 기능을 활성화해도 누적값이 설정된 최댓값을 넘지 않도록 제한했다.
- analyser용 `Float32Array`를 재사용하고, 레벨 미터 측정과 React 갱신을 30Hz로 제한했다.
- 타임라인 앵커, 지연 시작, 장시간 스케줄러 정지 후 이벤트 시각 보존, 늦은 노트 처리에 대한 단위 테스트를 추가했다.

전체 자동 테스트 99개와 프로덕션 빌드는 통과했다. 로컬 브라우저에서 실제 MIDI 프로젝트 재생·일시정지·정지를 확인했으며 콘솔 오류는 발생하지 않았다. 재생 중 메인 스레드를 300ms 정지시킨 시험에서는 벽시계 1.18초 동안 표시 시간이 1.10초 진행해, 300ms 정지가 재생 시간의 영구 지연으로 누적되지 않았다. 실제 출력 장치에서의 박자와 음질은 최종 청취 확인이 필요하다.

## 수정 전 재생 경로

```mermaid
flowchart LR
    Worker["Web Worker<br/>performance.now() 클록"] -->|postMessage| Store["playbackTimeStore<br/>UI 표시 시간"]
    Store -->|requestAnimationFrame| UI["재생헤드와 시간 UI"]
    Store -->|getPlaybackTime()| Scheduler["PlaybackController<br/>메인 스레드 setInterval 100ms"]
    Scheduler -->|매 주기 audioOffset 재계산| Context["AudioContext.currentTime"]
    Context --> Render["Web Audio 렌더링 스레드"]
    MainJank["레이아웃·GC·React 렌더 등<br/>메인 스레드 렉"] -.-> Store
    MainJank -.-> Scheduler
```

Web Worker는 시간 숫자를 생성하지만, 메시지 수신·`requestAnimationFrame`·오디오 노드 생성은 다시 메인 스레드에서 실행된다. 따라서 Worker가 살아 있어도 메인 스레드가 막힌 동안 새 Web Audio 이벤트는 예약되지 않는다. 이미 `AudioContext`에 예약된 이벤트만 렌더링 스레드에서 계속 정확하게 재생된다.

## 수정 전 코드 근거와 원인 판정

| 우선순위 | 판정 | 수정 전 근거와 영향 | 처리 결과 |
|---|---|---|---|
| P0 | 가능성 높음 | `PlaybackController`가 UI용 `getPlaybackTime()`을 읽고 매 윈도우마다 `audioOffset`을 다시 계산해, 렉 직후 이후 노트까지 늦은 오디오 시각에 매핑할 수 있었다. | [`PlaybackController`](../../src/core/audio/PlaybackController.ts)가 고정 `PlaybackAnchor`에서 타임라인과 노트 예약 시각을 계산하도록 변경했다. |
| P0 | 확정 | `playbackTimeStore`의 캐시된 표시 시간이 오디오 스케줄러 입력으로 사용되어, 메인 스레드 정지 후 오래된 UI 시간이 예약 기준에 유입됐다. | UI 표시 시계와 오디오 예약 시계를 분리했다. |
| P0 | 확정 | 같은 pitch class의 겹친 보이스 수만큼 기본 3ms를 누적해 10보이스에서 최대 27ms까지 onset이 벌어질 수 있었다. | [`AudioEngine`](../../src/core/audio/AudioEngine.ts)의 기본값을 0ms로 바꾸고 활성화 시에도 설정 상한을 넘지 않도록 제한했다. |
| P1 | 확정 | UI Worker 클록이 먼저 시작되고 샘플 prefetch 완료를 기다리지 않아, 콜드 스타트에서 화면이 소리보다 먼저 진행할 수 있었다. | [`TransportControls`](../../src/components/Toolbar/TransportControls.tsx)가 오디오 준비 및 앵커 생성을 기다린 뒤 같은 lead로 Worker 클록을 시작한다. |
| P1 | 가능성 높음 | 트랙·마스터 레벨 조회마다 2048 길이 배열을 좌우로 새로 만들고 각 미터가 별도 rAF와 React 상태 갱신을 수행했다. | 배열을 재사용하고 [`audioLevelStore`](../../src/utils/audioLevelStore.ts)의 중앙 30Hz 갱신으로 통합했다. |
| P1 | 확정 | lookahead 0.5초와 메인 스레드 `setInterval` 100ms 조합은 약 0.5초를 넘는 정지에 취약했다. | 기본값을 0.75초/50ms로 조정하고, 늦은 노트가 다음 이벤트 기준 시각을 밀지 않도록 했다. |
| P2 | 확정 | BUF 설정이 Worker 틱과 `latencyHint`를 함께 바꿨지만 오디오 스케줄러 간격에는 직접 작용하지 않았다. | 이번 변경 범위에서는 유지했다. 사용자 프리셋과 진단 정보 분리는 후속 과제다. |

### 1. 서로 다른 시계의 재매핑

Web Audio는 `AudioContext.currentTime` 좌표계에 이벤트를 예약하면 렌더링 스레드가 정해진 시각에 처리한다. 수정 전 구현도 `source.start(audioStartTime)`을 사용했지만, `audioStartTime`을 만드는 기준이 고정되어 있지 않았다.

수정 전 계산은 다음과 같았다.

```text
audioOffset = AudioContext.currentTime - UI playbackTime
audioStartTime = audioOffset + note.startTime
```

정상 상태에서는 두 시계가 비슷하므로 문제가 작다. 그러나 UI 시간이 300ms 오래된 상태에서 위 식을 다시 계산하면, 미래 노트도 약 300ms 뒤로 이동한다. 수정 전 0.5초 lookahead는 이미 예약된 구간을 보호하지만, 렉이 풀린 뒤 새로 예약하는 구간에서 기준을 다시 잡는 순간 박자가 끌릴 수 있었다.

Web Audio 공식 사양은 `AudioScheduledSourceNode.start(when)`의 `when`을 `AudioContext.currentTime`과 같은 좌표계의 정확한 예약 시각으로 정의한다. 과거 시각을 넘기면 즉시 재생된다. 따라서 UI 클록을 오디오 예약의 기준으로 사용하지 않고, 재생 시작 시 한 번 만든 오디오 앵커를 유지해야 한다.

### 2. 의도적으로 추가되는 누적 노트 지연

수정 전 피아노 보이스는 같은 음이 아니라 `midi % 12`가 같은 모든 옥타브를 한 그룹으로 묶고, 이미 예약된 겹침 수만큼 지연했다.

```text
offset = overlappingVoiceCount × 3ms
```

예를 들어 C3, C4, C5, C6를 동시에 예약하면 각 시작이 0ms, 3ms, 6ms, 9ms로 벌어진다. 여러 트랙의 지속음도 전역 Map에 함께 들어가므로 밀집된 편곡에서 더 커질 수 있다. 리듬 정확성이 핵심인 시퀀서에서 위상/피크 완화를 위해 onset을 바꾸는 방식은 적절하지 않다.

### 3. 오디오 준비와 트랜스포트 시작의 경쟁

재생 버튼을 누르면 Worker 클록은 즉시 시작하지만, 오디오 컨트롤러는 SFZ Map 준비와 프로젝트 전체 샘플 prefetch를 비동기로 기다린다. 이 작업이 500ms 걸리면 화면상 재생 위치는 이미 500ms 진행한 뒤다. 이후 컨트롤러는 최초 요청 시각으로 스케줄을 초기화하여 준비 지연과 재생 시각이 분리된다.

샘플 로딩 자체는 비동기이므로 메인 스레드 동기 블로킹의 직접 원인은 아닐 수 있다. 문제는 **준비가 끝나기 전에 트랜스포트를 진행시키는 순서**다.

### 4. 레벨 미터의 메인 스레드 부하

최대 10트랙과 마스터가 표시되면 고유 analyser는 11개이며, 각 analyser에서 좌우 2048개 샘플 배열을 매 프레임 새로 만든다.

```text
11 channels × 2 sides × 2048 samples × 4 bytes × 60fps
≈ 10.3 MiB/s 임시 배열 할당
```

여기에 좌우 미터 22개가 각각 rAF 루프, `setState`, 20개 bar의 React 비교를 수행한다. 이 경로는 오디오 렌더링 스레드가 아니라 스케줄러와 같은 메인 스레드를 사용하므로, 스케줄 예약을 늦추는 유력한 부하원이다. 다만 실제 기기에서 Performance 프로파일로 상관관계를 확인해야 한다.

## 권장 설계

### 1단계: 오디오 고정 앵커 도입

재생 준비가 끝난 시점에 다음 값을 한 번 정한다.

```typescript
type PlaybackAnchor = {
  timelineTime: number;
  audioTime: number;
};

anchor.timelineTime = requestedPlaybackTime;
anchor.audioTime = audioContext.currentTime + startupLeadSeconds;
```

모든 계산은 이후 같은 앵커를 사용한다.

```text
timelineNow = anchor.timelineTime
            + (AudioContext.currentTime - anchor.audioTime)

noteAudioTime = anchor.audioTime
              + (note.startTime - anchor.timelineTime)
```

핵심 규칙은 다음과 같다.

- 스케줄러는 `getPlaybackTime()`을 사용하지 않는다.
- 스케줄링 반복마다 `audioOffset`을 새로 만들지 않는다.
- UI 재생 시간은 오디오 앵커에서 파생하거나, 최소한 오디오 예약과 분리한다.
- seek/resume 때만 새 앵커를 만들고 기존 예약 소스를 정리한다.
- 출력 장치와 화면의 대응이 필요하면 지원 환경에서 `getOutputTimestamp()`를 사용한다.

이 구조에서는 메인 스레드가 잠시 멈춰도 이미 예약된 노트의 시각은 바뀌지 않는다. 렉이 lookahead보다 짧으면 오디오 박자는 유지되고 UI만 건너뛰어 따라온다.

### 2단계: 원자적인 재생 시작

재생 상태를 `idle → preparing → playing`으로 구분한다.

1. 사용자 클릭으로 `AudioContext.resume()`을 요청한다.
2. 시작 위치 근처에 필요한 샘플을 우선 준비한다.
3. `AudioContext.currentTime + 50~100ms`에 첫 오디오 이벤트를 예약한다.
4. 같은 앵커를 기준으로 UI 트랜스포트를 시작한다.
5. 준비 중 취소·seek가 들어오면 start token으로 이전 작업을 폐기한다.

전체 프로젝트의 모든 샘플을 기다릴 필요가 크다면 시작 위치 주변을 우선 로드하고 나머지를 후순위로 prefetch한다. 어떤 방식을 택하든 준비 중 UI 시간만 먼저 흐르는 상태는 없어야 한다.

### 3단계: 지각 가능한 지연을 만드는 보정 제거

`pitchOffsetMaxMs`의 기본값을 0으로 바꾸고, 정확한 동시 onset을 유지한다. 피크 문제는 다음 순서로 해결한다.

1. 트랙과 마스터에 충분한 headroom을 둔다.
2. 같은 샘플의 동시 보이스 합산 게인을 보이스 수에 따라 보정한다.
3. 필요하면 limiter/compressor를 사용하되 리듬 위치는 바꾸지 않는다.
4. 시간 분산이 음악적 효과로 필요하다면 명시적인 humanize 기능으로 분리한다.

최소 수정으로 기존 기능을 유지해야 한다면 총 오프셋을 실제 `pitchOffsetMaxMs` 이하로 clamp할 수 있다. 다만 1~3ms도 트랜지언트를 퍼뜨릴 수 있어 정확한 시퀀서 기본값으로는 0ms가 안전하다.

### 4단계: 스케줄 고갈 복구 정책

각 이벤트의 이상적인 `noteAudioTime`과 현재 `AudioContext.currentTime`을 비교해 `latenessMs`를 기록한다.

- 예약 시각이 미래이면 원래 그리드 시각에 예약한다.
- 아주 조금 늦었고 노트가 아직 유효하면 즉시 시작하되 샘플 offset으로 지난 구간을 건너뛴다.
- 허용 한계를 넘긴 짧은 노트는 건너뛴다.
- 어떤 경우에도 지연량을 이후 노트의 기준 시각에 누적하지 않는다.

lookahead는 고정 상수만 늘리기보다 관측한 long task의 p95/p99에 안전 여유를 더해 조정하는 편이 낫다. 초기 실험값으로 갱신 간격 25~50ms, lookahead 0.5~1.0초를 비교할 수 있다. 너무 긴 lookahead는 많은 노드를 미리 만들고 실시간 편집 반영을 늦추므로 상한이 필요하다.

### 5단계: 메인 스레드 부하 축소

- analyser별 `Float32Array`를 한 번 만들고 재사용한다.
- 레벨 측정은 60Hz 대신 20~30Hz로 제한한다.
- 각 `LevelMeter`의 개별 rAF를 제거하고 하나의 중앙 프레임/타이머로 묶는다.
- React로 20개 bar를 매 프레임 다시 그리기보다 CSS transform 또는 단일 높이 값을 갱신한다.
- 화면에 보이지 않거나 비활성화된 미터는 측정하지 않는다.
- 필요 정확도를 확인한 뒤 analyser `fftSize`를 2048보다 낮추는 A/B 테스트를 한다.

## BUF 설정의 역할 정리

숫자형 `latencyHint`는 브라우저에 전달하는 선호값이며 실제 적용값이 아니다. Web Audio 사양도 브라우저가 값을 해석할 재량이 있고 실제값은 `baseLatency`로 확인하도록 정의한다. 따라서 현재 BUF 메뉴는 다음처럼 정리하는 것이 맞다.

- 사용자에게는 `Low latency / Balanced / Stable playback` 같은 프리셋을 제공한다.
- 실제 `audioContext.baseLatency`와 가능하면 `outputLatency`를 진단 정보에 표시한다.
- UI Worker의 tick 간격은 출력 버퍼 힌트와 분리한다.
- 스케줄러 lookahead도 별도 정책으로 관리한다.

BUF를 크게 하는 것은 오디오 렌더링 underrun이나 출력 끊김에는 도움이 될 수 있지만, 오래된 UI 시간을 사용해 노트를 늦게 예약하는 문제는 해결하지 못한다.

## 측정과 검증 계획

### 진단 현황과 추가 항목

기존 `schedule_tick_lag`, `lookahead_depleted`, Long Tasks 로깅에 10ms 이상 늦게 처리된 노트의 `latenessMs`, 이벤트 시각, 현재 재생 시각을 남기는 `schedule_note_late` 로그를 추가했다. 다음 값은 상세 성능 분석을 위한 후속 항목이다.

- `idealAudioTime`, `scheduledAtAudioTime`, `latenessMs`
- `timelineNow`, `uiPlaybackTime`, 두 값의 차이
- lookahead 잔량의 최솟값
- 늦어서 즉시 시작한 노트 수, 건너뛴 노트 수
- 샘플 준비 시간과 최초 노트 예약까지의 시간
- `baseLatency`, `outputLatency`, `AudioContext.state`
- 활성 source 수와 한 윈도우에서 생성한 source 수

Long Tasks API는 50ms 이상 UI 스레드를 독점하는 작업을 관측하므로, 기존 [`longTaskLogger`](../../src/utils/longTaskLogger.ts)와 오디오 deadline 로그를 같은 타임라인으로 비교하면 원인 상관관계를 확인할 수 있다.

### 자동 테스트 현황

순수 타임라인 모듈의 회귀 테스트로 다음 항목을 검증했다.

1. 시작 lead 동안 타임라인이 먼저 진행하지 않는다.
2. 스케줄러 호출이 늦어져도 이벤트의 `audioStartTime`이 변하지 않는다.
3. 장시간 정지 뒤 다음 이벤트 시각에 지연이 누적되지 않는다.
4. 늦었지만 아직 유효한 노트는 지난 샘플 구간을 건너뛰고 남은 길이만 재생한다.
5. 이미 끝난 노트는 건너뛴다.
6. pitch offset 기본값 0과 활성화 시 상한을 보장한다.

컨트롤러에 fake `AudioEngine`과 가상 시계를 주입하는 통합 테스트, 700ms 이상 고갈 복구, `latencyHint` 무시 환경은 후속 자동화 대상이다.

### 수동 성능 시나리오

| 시나리오 | 조건 | 합격 기준 |
|---|---|---|
| 짧은 렉 | 재생 중 100ms/300ms busy task 주입 | lookahead 고갈 0회, 이후 노트 grid shift 없음 |
| 긴 렉 | 재생 중 700ms busy task 주입 | 누락 정책은 발생할 수 있으나 다음 박자부터 기준 시각 복귀 |
| 밀집 프로젝트 | 10트랙, 지속 페달, 빠른 반복 노트 | 누적 onset offset 없음, large batch와 source 수가 상한 내 유지 |
| 미터 A/B | 같은 프로젝트에서 레벨 미터 ON/OFF | long task 수, GC 시간, scheduler lag가 ON에서 유의하게 악화되지 않음 |
| 콜드 스타트 | 캐시 삭제 후 즉시 재생 | 준비 표시 후 화면과 첫 음이 함께 시작 |
| 출력 안정성 | BUF 프리셋별 반복 | 실제 `baseLatency` 기록, crackle/dropout과 박자 밀림을 별도 판정 |

최종 합격 기준은 최소한 다음을 포함한다.

- 300ms 이하 메인 스레드 정지에서 예약된 노트의 추가 지연 0ms
- 정상 부하에서 `latenessMs` p99 5ms 이하
- underrun 뒤 다음 그리드 이벤트에 누적 drift 없음
- 동일 시각의 MIDI 노트가 pitch class나 트랙 수 때문에 서로 다른 onset을 갖지 않음
- 콜드 스타트에서 UI 재생헤드 선행 없음

## 구현 범위와 후속 과제

1. **완료 — 고정 오디오 앵커와 시작 동기화**: `PlaybackController`, `TransportControls`, playback Worker
2. **완료 — pitch offset 기본 비활성화와 상한 테스트**: `AudioEngine`, `uiStore`, 관련 문서
3. **완료 — 레벨 미터 최적화**: `AudioEngine`, `audioLevelStore`, `LevelMeter`
4. **일부 완료 — 진단 보강**: 늦은 노트 로그를 추가했으며 상세 개발자 패널은 후속 과제다.
5. **후속 — 측정 기반 lookahead/latency 프리셋 조정**
6. **후속 — 위 변경 후에도 고갈이 반복되는 경우에만 AudioWorklet 기반 sampler 검토**

`AudioWorklet`은 사용자 코드가 오디오 렌더링 스레드에서 실행될 수 있게 하지만, 샘플러·보이스 관리·메시지 프로토콜을 새로 설계해야 하고 렌더링 deadline을 직접 지켜야 한다. 위 1~5단계 후에도 허용할 수 없는 고갈이 반복될 때 별도 아키텍처 작업으로 다루는 것이 안전하다.

## 외부 근거

- [Web Audio API 1.1 사양](https://webaudio.github.io/web-audio-api/): `AudioContext.currentTime`, 정확한 source 예약, control/rendering thread 분리, `latencyHint`와 실제 `baseLatency`의 관계를 정의한다.
- [A tale of two clocks — web.dev](https://web.dev/articles/audio-scheduling): JavaScript 타이머는 GC·레이아웃·렌더링으로 늦어질 수 있으므로 AudioContext 시계와 겹치는 lookahead 윈도우를 사용해야 함을 설명한다.
- [Long Tasks API — W3C](https://www.w3.org/TR/longtasks-1/): UI 스레드를 50ms 이상 점유하는 작업의 관측 기준을 정의한다.
- [AudioContext.getOutputTimestamp()](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp): 오디오 출력의 `contextTime`과 `performanceTime` 대응을 제공한다.

## 기존 문서와의 관계

- [`Lookahead 스케줄링`](../architecture/optimization-design/implementation-level/lookahead-scheduling.ko.md)은 선행 예약 방향은 맞지만, UI 시간과 오디오 시간의 재매핑 위험 및 underrun 복구 정책을 추가해야 한다.
- [`워커 기반 재생 클록`](../architecture/optimization-design/architecture-level/worker-playback-clock.ko.md)은 UI 시간 생성 분리에는 유효하지만, Web Worker가 Web Audio 렌더링 스레드를 대신하지 않는다는 한계를 명시해야 한다.
- [`오디오 버퍼 사이즈`](../architecture/optimization-design/implementation-level/audio-buffer-size.ko.md)는 실제 버퍼 크기가 아니라 브라우저 latency hint와 UI tick 설정이라는 점을 사용자 노출 명칭에도 반영해야 한다.
- [`같은 음계 간섭 방지`](../architecture/optimization-design/implementation-level/pitch-class-interference-prevention.ko.md)는 리듬 정확성과 충돌하므로 기본 정책을 재검토해야 한다.
