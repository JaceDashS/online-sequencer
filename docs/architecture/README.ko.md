# 아키텍처 문서

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 문서 구조

### 최적화 설계
- [`optimization-design/index.ko.md`](./optimization-design/index.ko.md) - 성능 최적화 기법 카테고리별 정리
  - **아키텍처 수준**: 렌더링 아키텍처 최적화
  - **구현 수준**: 오디오 재생, UI, 데이터 접근 최적화

---

## 최적화 설계 문서

최적화 설계 문서는 카테고리별로 분리되어 있습니다:

```mermaid
graph TD
    A[최적화 설계] --> B[아키텍처 수준]
    A --> C[구현 수준]
    
    B --> B1[렌더링 아키텍처]
    B --> B2[리소스 관리]
    
    B1 --> B1a[rAF 기반<br/>재생헤드 업데이트]
    B1 --> B1b[워커 기반<br/>재생 클록]
    
    B2 --> B2a[리소스 생명주기<br/>관리]
    
    C --> C1[오디오 재생]
    C --> C2[UI 최적화]
    C --> C3[데이터 접근]
    
    C1 --> C1a[Lookahead<br/>스케줄링]
    C1 --> C1b[Drift 보정]
    C1 --> C1c[오디오 버퍼<br/>사이즈]
    C1 --> C1d[음계 간섭<br/>방지]
    C1 --> C1e[배치 샘플<br/>로딩]
    
    C2 --> C2a[스크롤<br/>동기화]
    
    C3 --> C3a[데이터<br/>인덱싱]
    C3 --> C3b[시간 변환<br/>캐싱]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style B1 fill:#ffebee
    style B2 fill:#ffebee
    style C1 fill:#f3e5f5
    style C2 fill:#f3e5f5
    style C3 fill:#f3e5f5
```

### 아키텍처 수준 최적화
- [rAF 기반 재생헤드 업데이트](./optimization-design/architecture-level/raf-playback-head.md)
- [워커 기반 재생 클록](./optimization-design/architecture-level/worker-playback-clock.md)

### 구현 수준 최적화

#### 오디오 재생 최적화
- [Lookahead 스케줄링](./optimization-design/implementation-level/lookahead-scheduling.md)
- [Drift 보정 시스템](./optimization-design/implementation-level/drift-correction.md)
- [조절 가능한 오디오 버퍼 사이즈](./optimization-design/implementation-level/audio-buffer-size.md)
- [같은 음계 간섭 방지](./optimization-design/implementation-level/pitch-class-interference-prevention.md)
- [배치 샘플 로딩](./optimization-design/implementation-level/batch-sample-loading.md)

#### UI 최적화
- [MIDI 에디터 스크롤 동기화](./optimization-design/implementation-level/scroll-synchronization.md)

#### 데이터 접근 최적화
- [데이터 인덱싱](./optimization-design/data-access/indexing.md)
- [시간 변환 캐싱](./optimization-design/data-access/timing-cache.md)

---

## 관련 문서

### 기타
- [`../reference/audio-buffer-size-specification.ko.md`](../reference/audio-buffer-size-specification.ko.md) - 버퍼 사이즈 스펙 (한국어)
- [`../reference/audio-buffer-size-specification.en.md`](../reference/audio-buffer-size-specification.en.md) - 버퍼 사이즈 스펙 (English)

---

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14


