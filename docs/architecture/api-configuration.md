# API 설정

**Document Version**: 2.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03

**카테고리**: 설정 관리

---

## 개요

jace-s API, 협업 WebSocket, 로그인 화면 주소를 설정값으로 관리합니다. 주소는 `src/utils/apiConfig.ts`에서만 만들며 코드 곳곳에 직접 쓰지 않습니다.

- 계약 원문: jace-s 저장소 `docs/api/apps/online-sequencer/` (`10-client-contract.md`, `20-health.md`, `30-app-contract.md`)
- 기준: jace-s 커밋 `9416e01` 이후 (2026-11-03 운영 반영)

```mermaid
flowchart LR
  S["online-sequencer.jace-s.com"] -->|"방, 로그인 확인, 공지"| A["api.jace-s.com"]
  S -->|"WebSocket"| W["wss://api.jace-s.com/online-sequencer/signaling"]
  S -->|"로그인·계정 화면 (새 창)"| L["jace-s.com/login, /account"]
```

---

## 환경 변수

전체 예시: 저장소 루트 `.env.example`

코드 기본값은 없습니다. 모든 값은 배포 환경 변수로 정합니다.

| 변수 | 운영(Vercel Production) 값 | 없을 때 |
|---|---|---|
| `VITE_API_URL` | `https://api.jace-s.com` (경로에 `/api` 없음, origin만 사용) | 협업 요청 시 "VITE_API_URL is not configured" 오류. 공지·서버 상태 조회와 로그인도 꺼짐 |
| `VITE_SITE_URL` | `https://jace-s.com` | 로그인·계정 화면을 열 수 없어 로그인 꺼짐 |
| `VITE_NOTICE_APP_ID` | `4` | 공지를 조회하지 않음(서버 생존 확인만). 피드백 출처 ID는 기본값 `4` 사용 |
| `VITE_LOGIN_HOSTS` | `online-sequencer.jace-s.com` | 로그인 UI·세션 확인 꺼짐. 운영 개발자 패널도 안 보임. 로컬 개발에서는 비우는 것이 정상 |
| `VITE_TURN_SERVER_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | 필요할 때만 | 공개 STUN만 사용 |
| `ENABLE_DEVTOOLS` | (Electron main 전용) | 개발자 도구 끔 |

- 빠진 필수 값은 프로덕션 빌드(`vite build`)에서 경고합니다(`vite.config.ts`의 `check-required-env`, 빌드는 계속). 실행 중에는 빠진 값마다 콘솔에 한 번 `[apiConfig] … is not configured` 오류를 남깁니다.
- `VITE_LOGIN_HOSTS`는 jace-s 서버의 허용 Origin(운영자가 서버 환경 변수로 관리)과 같은 호스트만 넣습니다. 설정하지 않으면 어느 주소에서도 로그인 UI가 숨겨지고 세션 확인 요청도 보내지 않습니다. 이 경우 개발자 패널도 운영에서는 보이지 않습니다.
- `VITE_` 변수는 빌드 시점에 번들에 들어가 누구나 볼 수 있습니다. 비밀값을 넣지 않습니다. 값을 바꾸면 다시 배포해야 반영됩니다.
- 값은 Vite의 `import.meta.env`에서 먼저 읽고, 없으면 Node `process.env`에서 읽습니다 (스크립트 테스트용).
- 예전 변수 `VITE_API_BASE_URL`, `VITE_BASE_URL`, `VITE_API_PATH`는 더 이상 읽지 않습니다. 남아 있으면 혼동을 막기 위해 삭제합니다.
- Electron은 실행 파일 폴더 등에서 `.env.production`(패키징) / `.env.development`(개발)를 읽습니다(`electron/main.ts`). 웹 번들 값은 빌드 시점에 정해집니다.

---

## 주소 생성

| 함수 | 결과 |
|---|---|
| `getApiUrl()` | `VITE_API_URL`의 origin, 없으면 `null` |
| `buildApiUrl('/rooms')` | `https://api.jace-s.com/online-sequencer/rooms` (API 주소 없으면 `ApiConfigError`) |
| `buildWebSocketUrl('/signaling', { clientId })` | `wss://api.jace-s.com/online-sequencer/signaling?clientId=...` |
| `getSiteUrl()` | `VITE_SITE_URL`의 origin, 없으면 `null` |
| `getNoticeAppId()` | `VITE_NOTICE_APP_ID`(양의 정수), 없으면 `null` |
| `getFeedbackAppId()` | `VITE_NOTICE_APP_ID`(양의 정수), 없으면 정식 ID `4` |
| `isLoginAvailable()` | 브라우저(Electron 제외)이고 호스트가 `VITE_LOGIN_HOSTS`에 있으며 API·화면 주소가 모두 있으면 true |

- `http://` → `ws://`, `https://` → `wss://`로 변환합니다.
- 엔드포인트 앞의 `/`가 없으면 붙입니다.

### 사용처

| 요청 | 주소 | 위치 |
|---|---|---|
| 서버 생존 | `{API}/health` | `src/core/notices/serviceNotices.ts` |
| 공지 | `{API}/notices?app=41` | `src/core/notices/serviceNotices.ts` |
| 로그인 확인 | `{API}/auth/session` | `src/core/auth/jaceSession.ts` |
| 협업 REST | `{API}/online-sequencer/rooms...` | `src/core/sync/SignalingClient.ts` |
| 협업 WebSocket | `wss://{API host}/online-sequencer/signaling` | `src/core/sync/SignalingClient.ts` |
| QA 서버 확인 (개발 전용) | `{API}/health` | `src/pages/QaPage.tsx` |

---

## 예전 주소 (사용 금지)

| 예전 | 현재 |
|---|---|
| `https://jace-s.com/api/online-sequencer/...` | `https://api.jace-s.com/online-sequencer/...` |
| `https://api.jace-s.com/api/online-sequencer/...` | `https://api.jace-s.com/online-sequencer/...` |
| `wss://jace-s.com/api/online-sequencer/signaling` | `wss://api.jace-s.com/online-sequencer/signaling` |
| `https://jace-s.com/api/auth/session` | `https://api.jace-s.com/auth/session` |
| `https://jace-s.com/health` (공지 포함) | `https://api.jace-s.com/health` + `/notices?app=41` |
| `/external/health/...` (prewarm) | 부르지 않음 |
| `/api/auth/verify-password`, `GET /online-sequencer/rooms` (관리자) | 기능 제거 |

예전 주소는 전환 기간에만 동작하며, jace-s 운영자가 요청이 없어진 것을 확인한 뒤 닫습니다(이후 404).

---

**Last Updated**: 2026-11-03
