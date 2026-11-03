# 보안 고려사항

**Document Version**: 2.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03

> 기준: jace-s 계약 `docs/api/apps/online-sequencer/` (커밋 `9416e01`)와 현재 클라이언트 코드. 서버 내부 구현과 운영 설정(허용 Origin, 환경 변수, DB 계정)은 확인하지 않았습니다.

---

## 1. 자격 증명 구분

| 자격 증명 | 용도 | 보관 | 규칙 |
|---|---|---|---|
| 로그인 세션 쿠키 | jace-s 계정 로그인 (6시간 방, 어드민 화면) | `api.jace-s.com` 쿠키. 이 페이지에서 읽을 수 없음 | 허용 Origin에서 로그인 상태일 때만 `credentials: 'include'` |
| `csrfToken` | 로그인 상태의 변경 요청 보호 | 메모리 (세션 응답 본문) | 변경 요청에 `x-csrf-token`. null이면 쿠키·CSRF 없이 요청 |
| `hostToken` | 방 호스트 소유권 증명 (로그인과 별개) | 메모리 + 같은 탭 `sessionStorage` | REST `Authorization: Bearer`, WS `register`의 `data.hostToken` |
| `clientId` / `hostId` | 연결·참가자 식별 | `localStorage` | 권한 증명이 아님. UUID만으로 호스트 API를 호출할 수 없음 |

공통: 비밀번호, 쿠키, csrf, `hostToken`을 URL·로그·오류 분석 도구에 남기지 않습니다. `SignalingClient`의 상세 로그는 `hostToken`을 `[redacted]`로 바꿉니다.

## 2. 룸 코드

- 4자리 숫자(10,000개)라 추측이 가능합니다. 참가는 호스트가 `allow-join`으로 연 기간(기본 60초, 최대 3600초)에만 됩니다.
- 정원은 4명이며, 강퇴된 참가자는 `x-client-id` 기준으로 같은 방 재참가가 막힙니다(403 `KICKED`).
- 더 긴 코드나 비밀번호는 서버 계약 변경이 필요합니다.

## 3. 호스트 인증

- 방 생성 응답의 `hostToken`으로만 호스트 동작(삭제·조인 허용·강퇴·재등록·WS 등록)을 합니다.
- 토큰은 새 방 생성 때 한 번만 받습니다. 같은 탭 새로고침 대비로 `sessionStorage`에 보관하며, 같은 페이지의 스크립트는 읽을 수 있습니다(XSS 시 노출 위험). 방 삭제·종료·만료·거절 때 지웁니다.
- 서버 측 토큰 복구 기능은 없습니다. 탭을 닫으면 토큰도 사라집니다.

## 4. 로그인과 CSRF

- 로그인은 서버 허용 Origin(`https://online-sequencer.jace-s.com`)에서만 씁니다. 그 밖의 주소(vercel.app, localhost, Electron)에서는 로그인 UI를 숨기고 쿠키를 보내지 않습니다.
- 로그인 상태로 새 방을 만들 때 CSRF가 없거나 틀리면 403 `CSRF_VALIDATION_FAILED`이며 방이 만들어지지 않습니다. 클라이언트는 세션을 다시 확인하고 한 번만 재시도합니다.
- 상세: [서비스 공지와 로그인 명세](../service-notices-and-login.md)

## 5. 어드민 화면

- 개발자 패널과 어드민 미리보기는 세션 응답의 `isAdmin`·`adminAccess`로 표시를 정하고, 동작마다 `/auth/session`을 다시 확인합니다.
- 이 값은 화면 표시용입니다. 패널 동작은 브라우저 안의 설정이므로 클라이언트를 조작하면 우회할 수 있습니다. 서버 자원을 바꾸는 관리 기능은 서버가 권한을 판정해야 합니다(현재 Sequencer에는 서버 관리 기능 없음).

## 6. 전송 구간

- REST·WebSocket은 HTTPS/WSS를 씁니다(개발에서만 ws 허용).
- WebRTC DataChannel은 DTLS로 암호화됩니다. 시그널링 서버는 P2P 데이터를 중계하지 않습니다.
- TURN 서버는 계약에 없습니다. 클라이언트 ICE 설정은 `src/core/sync/config/iceServers.ts`입니다.

## 7. 서버 측 보호 (계약 기준)

- CORS: 허용 Origin만 응답하고, 허용되지 않은 Origin은 403. WebSocket도 같은 Origin 규칙(위반 시 close 1008).
- 생성 제한: 성공 생성 비로그인 IP당 1회·회원 5회/시간, 신원당 활성 방 1개, 실패 생성 비로그인 3회·회원 10회/15분.
- 방과 소켓은 서버 메모리에만 있으며 재시작 시 사라집니다.
