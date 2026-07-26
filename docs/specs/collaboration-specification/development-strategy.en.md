# Development Strategy

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Current Implementation Boundary

This repository maintains the collaboration client. It does not currently contain a server runtime, route handlers, or a temporary server package.

**Client-side implementation:**
- `src/core/sync/SignalingClient.ts`: HTTP room APIs and WebSocket signaling
- `src/core/sync/WebRTCManager.ts`: WebRTC PeerConnection and DataChannel handling
- `src/core/sync/SyncManager.ts`: project state and transport synchronization
- `src/transport/`: Web and Electron transport abstraction

**Server-side boundary:**
- The signaling server is an external service configured through environment variables.
- This repository documents the server API contract, but does not prescribe the backend framework.
- Do not add `server/` or `temp-server/` to this client repository unless that work is explicitly approved as a separate task.

## Server Integration Approach

The collaboration server should be developed or maintained as a separate backend service that implements the API contract documented in [server-api.en.md](server-api.en.md).

**Required server responsibilities:**
- REST room endpoints under the configured API base URL
- WebSocket signaling endpoint under the same API base URL
- Room creation and lookup
- 6-hour room expiration
- "Allow Join" 60-second join window
- Participant kick handling
- Forwarding WebRTC offer, answer, and ICE candidate messages

**Implementation choices outside this repository:**
- Backend framework
- Persistence layer, such as Redis or a database
- Authentication and authorization integration
- Deployment, logging, monitoring, and rate limiting

## Development Workflow

```
1. Server API Contract
   ├─ Keep server-api documentation aligned with SignalingClient
   ├─ Confirm REST endpoint paths
   ├─ Confirm WebSocket message format
   └─ Confirm room lifetime and join-window behavior

2. Client Feature Development
   ├─ Maintain SignalingClient
   ├─ Maintain WebRTCManager
   ├─ Maintain SyncManager
   └─ Keep Web and Electron transports compatible

3. External Server Integration
   ├─ Configure VITE_API_BASE_URL
   ├─ Verify HTTP room APIs
   ├─ Verify WebSocket signaling
   └─ Verify WebRTC connection establishment

4. Final Testing and Stabilization
   ├─ Run focused client tests
   ├─ Run integration checks against the configured server
   ├─ Verify P2P synchronization behavior
   └─ Update documentation when API behavior changes
```

## Client Configuration

`src/utils/apiConfig.ts` resolves collaboration API URLs in this order:

1. `VITE_API_BASE_URL`
2. `VITE_BASE_URL` + `VITE_API_PATH`

`VITE_API_BASE_URL` should include the full API base path used by the collaboration server, for example:

```env
VITE_API_BASE_URL=https://example.com/api/online-sequencer
```

The client appends endpoint paths such as `/rooms`, `/rooms/:roomCode`, `/rooms/:roomCode/allow-join`, `/rooms/:roomCode/kick`, and `/signaling`.

## Server Compatibility Checklist

**API Contract:**
- [ ] `POST /rooms` returns a room code for the host
- [ ] `GET /rooms/:roomCode` returns host and join-window state
- [ ] `POST /rooms/:roomCode/allow-join` enables the join window
- [ ] `POST /rooms/:roomCode/kick` rejects a participant from the current room instance
- [ ] `DELETE /rooms/:roomCode` closes the room

**WebSocket Signaling:**
- [ ] `/signaling?clientId=...` accepts client connections
- [ ] `register` and `join` messages acknowledge with `registered` and `joined`
- [ ] `signaling` messages forward WebRTC offer, answer, and ICE candidate data
- [ ] Room lifecycle events are sent when rooms expire, close, or participants change

**Client Integration:**
- [ ] `VITE_API_BASE_URL` points to the API base that contains the collaboration endpoints
- [ ] HTTP and WebSocket URLs resolve from the same API base
- [ ] Browser and Electron transports can both connect

**Testing:**
- [ ] Run focused client tests
- [ ] Test room creation, join permission, join, kick, and room deletion
- [ ] Test WebRTC connection establishment after signaling
- [ ] Test project state synchronization over DataChannel

**Documentation:**
- [ ] Update [server-api.en.md](server-api.en.md) when the server contract changes
- [ ] Update client implementation docs when `src/core/sync` behavior changes
- [ ] Keep Korean and English document pairs structurally aligned

## Important Notes

1. **Server Code Is Out of Scope for This Repository**
   - This project owns the client implementation and API contract documentation.
   - Server implementation belongs to the configured backend service.

2. **Maintain API Spec Consistency**
   - Keep documented endpoints aligned with `SignalingClient`.
   - Minimize client changes when server internals change.

3. **Configuration Compatibility**
   - Prefer `VITE_API_BASE_URL` for the full collaboration API base.
   - Use `VITE_BASE_URL` and `VITE_API_PATH` only when the base URL must be assembled from separate values.

4. **Backend Stack Is Not Implied**
   - Do not describe Express, `ws`, Redis, or a database as current repository implementation unless code for that layer is added.

---

