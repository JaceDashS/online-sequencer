# jace-s 연동: 서비스 공지 토스트와 로그인 명세

**Document Version**: 2.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03

---

## 개요

Online Sequencer는 jace-s에 앱 ID **41**로 등록되어 있습니다. 이 문서는 jace-s가 제공하는 서비스 상태·공지 표시와 로그인 세션 사용 방식을 정의합니다.

- 계약 원문: jace-s 저장소 `docs/api/apps/online-sequencer/` (`10-client-contract.md`, `20-health.md`, `30-app-contract.md`)
- 기준: jace-s 커밋 `9416e01` 이후 (2026-11-03 운영 반영). 예전 핸드오프(2026-11-01, 공지 토스트)를 대체
- 주소: API `https://api.jace-s.com`(경로에 `/api` 없음), 화면 `https://jace-s.com`. 상세는 [API 설정](../architecture/api-configuration.ko.md)
- 구현:
  - `src/core/notices/serviceNotices.ts`: 조회·판정 로직
  - `src/components/Floating/ServiceNoticeToasts.tsx`: 상단 토스트
  - `src/core/auth/jaceSession.ts`: 로그인 세션·CSRF
  - `src/components/Toolbar/AccountButton.tsx`: 로그인 버튼
  - `src/utils/apiConfig.ts`: 주소·앱 ID·로그인 허용 호스트
  - `src/core/sync/SignalingClient.ts`: 방 요청의 hostToken·CSRF

---

## 1. 서비스 상태와 공지 조회

앱 진입 때 두 요청을 동시에 **한 번씩** 보냅니다. 둘 다 쿠키 없이(`credentials: 'omit'`), 타임아웃 10초입니다.

| 요청 | 판정 |
|---|---|
| `GET {API}/health` | 200이면 연결됨. 다른 상태 코드, 네트워크 실패, 시간 초과는 연결 불가. 본문은 읽지 않음 |
| `GET {API}/notices?app=41` | 200이고 `schemaVersion === 1`, `announcements` 배열이면 공지 목록. 그 외는 공지 없음. 연결 상태에는 영향 없음 |

- `/notices` 응답: `{"schemaVersion":1,"announcements":[{"id","title"}],"noticeRevision","timestamp"}`
- 각 공지에서 `id`, `title`만 사용합니다. 예전 형식의 `content` 등 추가 필드는 무시합니다. `id` 또는 `title`이 없거나 `id`가 중복된 항목은 버립니다.
- 공지 게시·종료가 `/notices`에 반영되기까지 1분 정도 걸릴 수 있습니다 (서버 측 동작).
- 방에 있는 동안 `/health`와 `/notices`를 주기적으로 다시 부르지 않습니다.
- 장애 문구는 앱이 고정값 `"Unable to connect to the server."`로 가집니다.

## 2. 표시 규칙

| 상태 | 표시 |
|---|---|
| 연결됨 + 공지 있음 | 공지 제목 토스트를 순서대로 쌓음. 각각 8초 뒤 자동으로 닫힘. `role="status"` |
| 연결됨 + 공지 없음 | 표시 없음 |
| 연결 불가 + 공지 있음 | 공지 제목 토스트만, 닫을 때까지 유지. 장애 문구 없음 |
| 연결 불가 + 공지 없음 | 장애 문구 토스트 하나, 닫을 때까지 유지. `role="alert"` |

### 모양

- 화면 위 가운데, 위 여백 12px, 폭 `min(512px, 100vw - 24px)`
- 토스트 밖 영역은 클릭이 아래로 통과 (`pointer-events: none`)
- 테마 변수 사용: 배경 `--bg-primary`, 글자 `--text-primary`, 테두리 `--border-color`. 장애 토스트는 `--color-warning` 테두리. 흰색 고정 금지
- 둥근 모서리 8px, 그림자, 0.3초 동안 위에서 내려옴 (`prefers-reduced-motion`이면 애니메이션 없음), 닫기 버튼 ×
- 제목과 문구는 텍스트로만 렌더링 (HTML 해석 금지)
- `document.body`에 포털로 그림. 모바일 안내 화면(폭 1120px 이하)에서도 표시

## 3. 로그인 세션

로그인 쿠키는 `https://api.jace-s.com`에만 있습니다. `jace-s.com/login`에서 로그인하면 이 주소에 쿠키가 생깁니다. 서버는 `https://online-sequencer.jace-s.com`만 credentials 포함 CORS로 허용합니다.

| 항목 | 방식 |
|---|---|
| 로그인 사용 가능 조건 | 브라우저(Electron 제외)이고 호스트가 허용 목록(기본 `online-sequencer.jace-s.com`)에 있음 |
| 로그인 상태 확인 | `GET {API}/auth/session`, `credentials: 'include'`. 200 → `{user, csrfToken, ...}`, 401 → 로그아웃. 그 외는 판단 불가 |
| 로그인 상태의 변경 요청 (POST/DELETE) | `credentials: 'include'` + 헤더 `x-csrf-token: <세션 응답의 csrfToken>`. 없거나 틀리면 403 `CSRF_VALIDATION_FAILED` |
| CSRF 실패 처리 | 방 생성이 403 `CSRF_VALIDATION_FAILED`이면 세션을 다시 확인하고 **한 번만** 재시도. 세션이 만료됐으면 비로그인 요청으로 재시도. 계약상 이 경우 방은 만들어지지 않아 중복 생성이 없음 |
| 로그인 상태의 조회 요청 (GET) | `credentials: 'include'`만 추가 |
| 비로그인 상태 | 쿠키·CSRF 헤더 없이 요청 (허용 호스트에서도 동일) |
| 로그인 화면 | `{SITE}/login`을 새 창으로 열고, 창이 닫히거나 포커스가 돌아오면 세션을 다시 확인 |
| 로그아웃 | 툴바의 사용자 이름을 누르면 `{SITE}/account`를 새 창으로 엶. 돌아오면 세션을 다시 확인 |
| 허용 호스트 밖 (vercel.app, localhost, Electron) | 로그인 UI 숨김, 세션 확인 요청 없음 |

- 적용 대상: `SignalingClient`의 방 생성·조회·조인 허용·강퇴·삭제
- 로그인 상태로 만든 방은 6시간, 비로그인은 1시간 유지됩니다 (서버 정책).
- 방 요청의 호스트 인증은 로그인과 별개로 `hostToken`(Bearer)을 씁니다. [서버 API](./collaboration-specification/server-api.ko.md) 참고.
- WebSocket(`wss://api.jace-s.com/online-sequencer/signaling`)은 브라우저가 같은 사이트 쿠키를 자동으로 보냅니다.

## 4. 확인 시나리오

| 입력 | 기대 결과 | 자동 검증 |
|---|---|---|
| `/health` 실패, `/notices` 공지 2개(두 번째 제목에 HTML 태그) | 공지 토스트 2개만, 9초 뒤에도 유지, 태그는 글자 그대로. 1280px·360px 동일 | 단위 테스트 + 브라우저 확인 |
| `/health` 실패, 공지 `[]` 또는 `/notices` 실패 | `"Unable to connect to the server."` 토스트 하나 유지 | 단위 테스트 + 브라우저 확인 |
| `/health` 200, 공지 1개 | 8초 뒤 닫힘 | 단위 테스트 + 브라우저 확인 |
| 허용 호스트, 비로그인, 방 만들기 | `POST {API}/online-sequencer/rooms`에 쿠키·CSRF 없음, WebSocket `wss://api.jace-s.com/online-sequencer/signaling` | 브라우저 확인 (모의 서버) |
| 허용 호스트, 로그인, 방 만들기 | 세션 200·csrfToken, 방 생성 요청에 `x-csrf-token` | 단위 테스트 + 브라우저 확인 (모의 서버) |
| hostToken | 생성 응답의 토큰을 WebSocket `register`의 `data.hostToken`과 조인 허용·강퇴·삭제·재등록 Bearer에 사용, URL·로그에 없음 | 단위 테스트 |
| 예전 주소 | `jace-s.com/api`, `api.jace-s.com/api/`, `jace-s.com/health` 요청 0건 | 브라우저 확인 (모의 서버) |
| `online-sequencer.vercel.app` 등 | 로그인 UI 없음 | 단위 테스트 + 브라우저 확인 |

실서버(jace-s 운영)로는 확인하지 않았습니다. 방 만료 6시간 여부는 서버 응답 `expiresAt`으로 확인해야 합니다.

단위 테스트: `scripts/unit-tests/service-notice-tests.ts` (`npm run test:unit`에 포함)
