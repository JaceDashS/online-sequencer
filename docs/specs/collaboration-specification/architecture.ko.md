# 아키텍처

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 전체 구조 (Star 토폴로지)

```mermaid
graph TB
    Server[Signaling Server<br/>포트 3000]
    
    Host[호스트<br/>Host]
    Guest1[게스트1<br/>Guest1]
    Guest2[게스트2<br/>Guest2]
    
    Server -->|초기 시그널링<br/>60초 동안만| Host
    Server -->|초기 시그널링<br/>60초 동안만| Guest1
    Server -->|초기 시그널링<br/>60초 동안만| Guest2
    
    Guest1 -->|WebRTC P2P<br/>게스트는 호스트 경유| Host
    Guest2 -->|WebRTC P2P<br/>게스트는 호스트 경유| Host
    Guest1 -.->|간접 통신| Guest2
    
    style Server fill:#e1f5ff
    style Host fill:#c8e6c9
    style Guest1 fill:#fff9c4
    style Guest2 fill:#fff9c4
```

**통신 구조:**
- 초기 연결: 서버를 통한 시그널링 (60초 동안만)
- 이후 통신: Star 토폴로지 P2P (게스트 → Host → 다른 게스트)
- 서버 역할: 초기 시그널링만 담당, P2P 연결 수립 후 불필요

## 컴포넌트 구조

```mermaid
graph TB
    A[Client Application] --> B[SignalingClient]
    A --> C[WebRTCManager]
    A --> D[SyncManager]
    A --> E[ConflictResolver]
    
    B --> B1[서버와의<br/>WebSocket 통신]
    C --> C1[WebRTC<br/>PeerConnection 관리]
    D --> D1[프로젝트 상태<br/>동기화]
    E --> E1[동시 편집<br/>충돌 해결]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#ffebee
    style E fill:#f3e5f5
```

---
