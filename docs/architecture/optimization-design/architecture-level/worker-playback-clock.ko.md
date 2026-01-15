# 워커 기반 재생 클록

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

**카테고리**: 아키텍처 수준 - 렌더링 아키텍처

---

## 개요

메인 스레드와 시간 생성 로직을 분리하여 독립적인 시간 틱을 생성하고, 메인 스레드 부하를 감소시키는 최적화 기법입니다.

---

## 설계 목표

- 메인 스레드와 시간 생성 로직 분리
- 독립적인 시간 틱 생성으로 메인 스레드 부하 감소
- 버퍼 사이즈에 따른 유연한 스케줄링

---

## 구현 위치

- `src/workers/playbackClock.worker.ts`: 워커 내부 시간 생성 로직
- `src/utils/playbackClock.ts`: 워커 래퍼 및 메인 스레드 통신
- `src/components/Toolbar/TransportControls.tsx`: 버퍼 사이즈 기반 interval 계산
- `src/constants/ui.ts`: `AUDIO_BUFFER_CONSTANTS` 정의

---

## 아키텍처 특징

### 스레드 분리

```mermaid
graph LR
    A[메인 스레드] -->|워커 생성| B[Web Worker<br/>playbackClock.worker.ts]
    B -->|독립 실행| C[setInterval<br/>시간 틱 생성]
    C -->|postMessage| D[메인 스레드로<br/>타임 틱 전달]
    D -->|구독자 호출| E[playbackTimeStore]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#ffebee
    style E fill:#f3e5f5
```

Web Worker에서 독립적으로 시간 틱을 생성하여 메인 스레드의 CPU 사용량을 감소시킵니다.

### 모듈 경계

```mermaid
graph TB
    A[메인 스레드] --> B[playbackClock.ts<br/>워커 래퍼]
    B -->|통신| C[playbackClock.worker.ts<br/>독립 모듈]
    C -->|타임 틱 생성| C
    C -->|postMessage| B
    B -->|구독자 호출| D[playbackTimeStore]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#f3e5f5
```

`playbackClock.worker.ts`가 독립적인 시간 생성 모듈로 동작합니다.

### 버퍼 사이즈 연동
버퍼 사이즈에 따라 틱 간격을 조절하여 유연한 스케줄링을 제공합니다.

---

## 동작 방식

```mermaid
sequenceDiagram
    participant Main as 메인 스레드
    participant Wrapper as playbackClock.ts<br/>(래퍼)
    participant Worker as Web Worker<br/>(playbackClock.worker.ts)
    
    Main->>Wrapper: 워커 초기화 요청
    Wrapper->>Worker: Worker 생성
    Main->>Wrapper: 버퍼 사이즈 설정
    Note over Main: 틱 간격 계산<br/>intervalMs = round((bufferSize / 48000) * 2 * 1000)
    Main->>Wrapper: setInterval(intervalMs) 명령
    Wrapper->>Worker: setInterval 명령 전달<br/>(intervalMs만 전달)
    
    loop 재생 중
        Worker->>Worker: setInterval으로<br/>시간 틱 생성
        Worker->>Wrapper: postMessage(타임 틱)
        Wrapper->>Main: 구독자 호출
    end
    
    Main->>Wrapper: 워커 종료 요청
    Wrapper->>Worker: terminate()
```

### 1. 워커 초기화
메인 스레드에서 워커를 생성하고 메시지 수신 리스너를 등록합니다.

### 2. 시간 틱 생성
워커 내부에서 `setInterval`을 사용하여 설정된 간격으로 시간 틱을 생성합니다.

### 3. 틱 간격 계산

```mermaid
graph LR
    A[버퍼 사이즈<br/>64-2048] --> B[메인 스레드<br/>계산]
    C[샘플 레이트<br/>48000 Hz] --> B
    D[주기 수<br/>2] --> B
    B --> E[intervalMs =<br/>round((bufferSize / 48000) * 2 * 1000)]
    E --> F[setInterval 명령<br/>intervalMs 전달]
    F --> G[워커<br/>setInterval 적용]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style E fill:#fff9c4
    style F fill:#ffebee
    style G fill:#f3e5f5
```

틱 간격 계산은 메인 스레드에서 수행되며, 계산된 `intervalMs`만 워커로 전달됩니다:

**메인 스레드 (TransportControls.tsx)**:
```typescript
const intervalMs = Math.round(
  (bufferSize / AUDIO_BUFFER_CONSTANTS.SAMPLE_RATE) * 
  AUDIO_BUFFER_CONSTANTS.PERIODS * 1000
);
setPlaybackClockInterval(intervalMs);
```

**워커 (playbackClock.worker.ts)**:
워커는 메인 스레드로부터 받은 `intervalMs`를 그대로 사용하여 `setInterval`을 설정합니다.

- `bufferSize`: 오디오 버퍼 크기 (64, 128, 256, 512, 1024, 2048)
- `SAMPLE_RATE`: 샘플 레이트 (48000 Hz, `AUDIO_BUFFER_CONSTANTS`에서 정의)
- `PERIODS`: 주기 수 (2, `AUDIO_BUFFER_CONSTANTS`에서 정의)

### 4. 메인 스레드로 전달
`postMessage`를 통해 시간 틱을 메인 스레드로 전달합니다.

---

## 효과

### 성능 개선
- 메인 스레드 CPU 사용량 감소
- 시간 생성 로직의 독립성 확보
- 버퍼 사이즈 조절에 따른 유연한 스케줄링

### 사용자 경험
- 메인 스레드가 다른 작업(UI 업데이트 등)에 집중 가능
- 안정적인 시간 틱 생성

---

## 관련 문서

- [`rAF 기반 재생헤드 업데이트`](./raf-playback-head.ko.md)
- [`조절 가능한 오디오 버퍼 사이즈`](../implementation-level/audio-buffer-size.ko.md)

---

**Last Updated**: 2026-01-14

