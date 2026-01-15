# Architecture

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Overall Structure (Star Topology)

```mermaid
graph TB
    Server[Signaling Server<br/>Port 3000]
    
    Host[Host<br/>Host]
    Guest1[Guest1<br/>Guest1]
    Guest2[Guest2<br/>Guest2]
    
    Server -->|Initial Signaling<br/>For 60 seconds only| Host
    Server -->|Initial Signaling<br/>For 60 seconds only| Guest1
    Server -->|Initial Signaling<br/>For 60 seconds only| Guest2
    
    Guest1 -->|WebRTC P2P<br/>Guests via Host| Host
    Guest2 -->|WebRTC P2P<br/>Guests via Host| Host
    Guest1 -.->|Indirect Communication| Guest2
    
    style Server fill:#e1f5ff
    style Host fill:#c8e6c9
    style Guest1 fill:#fff9c4
    style Guest2 fill:#fff9c4
```

**Communication Structure:**
- Initial Connection: Signaling through server (for 60 seconds only)
- Subsequent Communication: Star topology P2P (Guest → Host → other guests)
- Server Role: Handles initial signaling only, unnecessary after P2P connection is established

## Component Structure

```mermaid
graph TB
    A[Client Application] --> B[SignalingClient]
    A --> C[WebRTCManager]
    A --> D[SyncManager]
    A --> E[ConflictResolver]
    
    B --> B1[WebSocket Communication<br/>with Server]
    C --> C1[WebRTC<br/>PeerConnection Management]
    D --> D1[Project State<br/>Synchronization]
    E --> E1[Concurrent Editing<br/>Conflict Resolution]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#ffebee
    style E fill:#f3e5f5
```

---

