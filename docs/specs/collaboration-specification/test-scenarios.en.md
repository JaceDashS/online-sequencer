# Test Scenarios

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 1. Normal Flow

- Host clicks "Host" → Server creates and returns room code (maintained for 6 hours)
- Host clicks "Allow Join" → Allows joining for 60 seconds
- Participant joins → Check join permission → Establish P2P connection
- Host sends initial project state → Participant receives and applies state
- After 60 seconds, join window expires → New participants cannot join, existing P2P connections remain
- After 6 hours, session expires → Confirm server room expires and event is delivered

## 2. Star Topology Communication

- Guest1 changes → Host → Broadcast to Guest2, Guest3 confirmed

## 3. Network Failure

- Connection lost → Automatic reconnection
- After server room expiration, attempt P2P reconnection

## 4. Multiple Participants

- Host + 3 participants connected simultaneously
- Confirm all guests connect directly only to Host

## 5. Concurrent Editing

- Multiple guests editing simultaneously → Host resolves conflicts

## 6. Host Restart

- Host clicks "Host" while already hosting → Confirm re-host is blocked
- Stop hosting → Start new room → Confirm new room code issued

---

