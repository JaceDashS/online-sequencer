# 관리자 인증 및 룸 관리 보안 설계

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03

> **상태: 폐기 (2026-11-03)**
> - jace-s API 이전(`api.jace-s.com`, 커밋 `9416e01` 이후)으로 방 목록 `GET /online-sequencer/rooms`가 없어졌고, `/api/auth/verify-password`는 계약에 없습니다.
> - 이에 따라 개발자 패널의 관리자 기능(비밀번호 확인·방 목록·강제 삭제)을 클라이언트에서 제거했습니다.
> - 일반 호스트 권한은 이 문서의 5장 대신 jace-s 계약의 `hostToken`(Bearer) 방식을 따릅니다. [서버 API](./collaboration-specification/server-api.md) 참고.
> - 이 문서는 설계 이력으로만 남깁니다.

## 1. 목적

Developer Panel에서 관리자 비밀번호를 입력한 뒤 룸 목록을 조회하거나 룸을 강제로 삭제하는 기능을 안전하게 제공한다.

클라이언트의 UI 상태는 보안 경계가 될 수 없다. 실제 관리자 권한은 서버 세션으로 관리하고, 서버가 모든 관리자 요청을 인증·인가해야 한다.

## 2. 현재 구현과 문제점

현재 클라이언트는 다음 방식으로 동작한다.

1. `POST /api/auth/verify-password`로 비밀번호를 전송한다.
2. `{ "valid": true }`를 받으면 React의 로컬 `isAdminMode` 상태를 활성화한다.
3. 관리자 UI에서 기존 룸 API를 인증 정보 없이 호출한다.

이 구조에는 다음 문제가 있다.

- `isAdminMode`는 개발자 도구 등으로 조작할 수 있다.
- UI 버튼을 숨겨도 사용자가 서버 API를 직접 호출할 수 있다.
- 비밀번호 확인 결과가 이후 관리자 API 요청과 연결되지 않는다.
- 룸 목록 조회와 강제 삭제 요청에 관리자 자격 증명이 없다.
- `X-Client-Id`와 `X-Host-Id`는 클라이언트가 위조할 수 있으므로 권한 증명이 될 수 없다.

## 3. 보안 원칙

- 클라이언트 상태는 화면 표시 목적으로만 사용한다.
- 서버 세션만 실제 관리자 권한의 근거로 사용한다.
- 모든 관리자 API는 요청마다 서버에서 세션을 검증한다.
- 관리자 비밀번호와 해시는 서버에만 보관한다.
- 비밀번호, 세션 ID, 호스트 토큰을 클라이언트 로그에 기록하지 않는다.
- 운영 환경에서는 HTTPS를 사용한다.

## 4. 서버 구현 요구사항

### 4.1 관리자 로그인

```http
POST /api/online-sequencer/auth/admin/login
Content-Type: application/json

{
  "password": "사용자가 입력한 비밀번호"
}
```

성공 시 서버는 추측 불가능한 세션 ID를 발급하고 `HttpOnly` 쿠키로 전달한다.

```http
HTTP/1.1 204 No Content
Set-Cookie: admin_session=<opaque-session-id>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800
```

실패 응답:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "INVALID_CREDENTIALS"
}
```

서버 요구사항:

- 비밀번호는 Argon2id 또는 bcrypt 해시와 비교한다.
- 해시는 서버의 `ADMIN_PASSWORD_HASH` 환경변수 또는 Secret Manager에 저장한다.
- 비밀번호 원문이나 해시를 응답 또는 로그에 포함하지 않는다.
- 성공 시 기존 세션을 재사용하지 않고 새 세션 ID를 생성한다.
- 세션은 서버 저장소에서 관리하고 기본 30분 이내로 만료한다.
- 로그인 실패에 IP 기반 rate limit과 점진적 지연을 적용한다.
- 로그인 실패 사유가 외부에 구체적으로 드러나지 않게 응답을 통일한다.

### 4.2 관리자 세션 확인

```http
GET /api/online-sequencer/auth/admin/session
```

인증 성공 응답:

```json
{
  "authenticated": true,
  "expiresAt": 1780000000000
}
```

세션이 없거나 만료된 경우 `401 Unauthorized`를 반환한다.

### 4.3 관리자 로그아웃

```http
POST /api/online-sequencer/auth/admin/logout
```

서버는 세션 저장소의 세션을 폐기하고 `admin_session` 쿠키를 만료시킨다. 이미 만료된 세션으로 여러 번 요청해도 안전하게 처리한다.

### 4.4 관리자 전용 룸 API

다음 경로를 일반 협업용 룸 API와 분리한다.

```http
GET    /api/online-sequencer/admin/rooms
GET    /api/online-sequencer/admin/rooms/:roomCode
DELETE /api/online-sequencer/admin/rooms/:roomCode
```

모든 요청에 관리자 인증 미들웨어를 적용한다.

- 세션 없음 또는 만료: `401 Unauthorized`
- 인증됐지만 권한 없음: `403 Forbidden`
- 잘못된 룸 코드: `400 Bad Request`
- 존재하지 않는 룸: `404 Not Found`
- 관리자 강제 삭제: 작업자, 대상 룸, 시각, 결과를 감사 로그에 기록

룸 목록 응답 예시:

```json
{
  "success": true,
  "data": {
    "totalRooms": 1,
    "rooms": [
      {
        "roomCode": "ABCD12",
        "hostId": "host-id",
        "createdAt": 1780000000000,
        "expiresAt": 1780003600000,
        "participantCount": 2,
        "status": "active"
      }
    ],
    "timestamp": 1780000000000
  }
}
```

관리자 응답에는 운영에 불필요한 개인정보와 연결 내부정보를 포함하지 않는다.

## 5. 일반 호스트 권한

기존 일반 협업 API는 관리자 API와 분리해서 유지한다.

```http
POST   /api/online-sequencer/rooms
GET    /api/online-sequencer/rooms/:roomCode
POST   /api/online-sequencer/rooms/:roomCode/allow-join
POST   /api/online-sequencer/rooms/:roomCode/kick
DELETE /api/online-sequencer/rooms/:roomCode
```

`allow-join`, `kick`, 일반 룸 삭제는 룸을 생성한 호스트만 실행할 수 있어야 한다. 서버는 룸 생성 시 암호학적으로 안전한 호스트 토큰을 발급한다.

```json
{
  "roomCode": "ABCD12",
  "hostToken": "<cryptographically-random-token>"
}
```

호스트 전용 요청은 다음 헤더로 토큰을 전달한다.

```http
Authorization: Bearer <hostToken>
```

서버에는 호스트 토큰 원문 대신 해시를 저장하고 룸 종료 또는 만료 시 폐기한다. `X-Client-Id`와 `X-Host-Id`는 식별 보조값으로만 사용하며 권한 증명으로 사용하지 않는다.

## 6. 클라이언트 구현 요구사항

### 6.1 로그인 처리

`PasswordModal`은 기존 비밀번호 확인 API 대신 관리자 로그인 API를 호출한다.

```ts
await fetch(buildApiUrl('/auth/admin/login'), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({ password }),
});
```

- 비밀번호에 `trim()`을 적용하지 않고 입력 원문을 전송한다.
- 비밀번호를 `localStorage`, `sessionStorage` 또는 전역 상태에 저장하지 않는다.
- 로그인 성공 후 비밀번호 입력 상태를 즉시 비운다.
- 실패 메시지에는 서버 내부 상태나 구체적인 인증 실패 사유를 노출하지 않는다.

### 6.2 관리자 상태 관리

로컬 `isAdminMode`는 서버 인증 상태를 화면에 반영하는 값으로만 사용한다.

- 관리자 기능을 열 때 `GET /auth/admin/session`으로 세션을 확인한다.
- 세션 확인 성공 시에만 관리자 UI를 표시한다.
- 관리자 API가 `401`을 반환하면 `isAdminMode`를 즉시 해제한다.
- 로그인 성공 후 세션 상태를 다시 확인한다.
- 로그아웃 시 서버 로그아웃 API를 호출한 뒤 로컬 상태를 해제한다.

### 6.3 관리자 룸 요청

`RoomsListModal`은 관리자 전용 경로를 사용하고 모든 요청에 `credentials: 'include'`를 포함한다.

```ts
await fetch(buildApiUrl('/admin/rooms'), {
  credentials: 'include',
});
```

상세 조회와 강제 삭제에도 동일한 정책을 적용한다.

### 6.4 API URL 구성

인증 API도 `/api/online-sequencer` 아래에 배치해 기존 `buildApiUrl()`을 그대로 사용한다. URL 문자열에서 `/api/online-sequencer`를 `replace()`로 제거하는 방식은 사용하지 않는다.

권장 경로:

```text
/api/online-sequencer/auth/admin/login
/api/online-sequencer/auth/admin/session
/api/online-sequencer/auth/admin/logout
/api/online-sequencer/admin/rooms
```

### 6.5 호스트 토큰

서버가 호스트 토큰을 도입하면 `SignalingClient`는 룸 생성 응답에서 토큰을 받고 다음 요청에 `Authorization` 헤더를 추가한다.

- 조인 허용
- 참가자 강퇴
- 일반 호스트의 룸 삭제

토큰은 가능한 한 메모리에만 유지한다. 애플리케이션 재시작 또는 룸 복구를 위해 영구 저장이 필요하다면 별도의 위협 분석 후 저장 정책을 결정한다.

## 7. 쿠키, CORS 및 CSRF

클라이언트와 API가 서로 다른 Origin이면 다음을 적용한다.

- 서버는 허용할 Origin을 명시적으로 제한한다.
- `Access-Control-Allow-Credentials: true`를 설정한다.
- 자격 증명 요청에 `Access-Control-Allow-Origin: *`를 사용하지 않는다.
- 클라이언트는 인증 관련 요청에 `credentials: 'include'`를 설정한다.
- cross-site 쿠키가 반드시 필요하면 `SameSite=None; Secure`와 CSRF 토큰 검증을 함께 적용한다.
- 가능하면 같은 사이트 구성에서 `SameSite=Strict` 또는 `SameSite=Lax`를 사용한다.

## 8. 기존 API 전환

기존 엔드포인트는 새 로그인 API로 전환한 뒤 제거한다.

```http
POST /api/auth/verify-password
```

점진적 배포가 필요하면 새 로그인 처리로 임시 위임하고 deprecated 상태로 운영할 수 있다. 최종 구조에는 `{ "valid": true }`만 반환하는 동작을 남기지 않는다.

권장 적용 순서:

1. 서버에 새 관리자 인증 및 관리자 룸 API를 추가한다.
2. 클라이언트를 새 API 계약으로 전환한다.
3. 운영 환경에서 새 인증 흐름을 검증한다.
4. 기존 비밀번호 확인 API를 제거한다.
5. 호스트 토큰은 관리자 인증 전환과 별도의 변경 단위로 적용한다.

## 9. 테스트 요구사항

### 서버

- 올바른 비밀번호로 세션이 발급된다.
- 잘못된 비밀번호로 세션이 발급되지 않는다.
- 세션 없이 관리자 API를 호출하면 `401`을 반환한다.
- 만료되거나 로그아웃한 세션은 재사용할 수 없다.
- 관리자 세션으로 목록 조회, 상세 조회, 강제 삭제가 가능하다.
- 로그인 rate limit이 동작한다.
- 잘못된 룸 코드와 존재하지 않는 룸을 구분해 처리한다.
- 관리자 강제 삭제 감사 로그에 비밀정보가 포함되지 않는다.
- ID 헤더를 조작해 관리자 또는 호스트 작업을 수행할 수 없다.

### 클라이언트

- 로그인 성공 후 관리자 UI가 표시된다.
- 로그인 실패 시 관리자 UI가 표시되지 않는다.
- 세션 확인이 `401`을 반환하면 관리자 모드가 해제된다.
- 관리자 룸 요청에 쿠키 자격 증명이 포함된다.
- 관리자 API 오류가 사용자에게 안전한 메시지로 표시된다.
- 비밀번호와 세션 정보가 브라우저 저장소 및 로그에 남지 않는다.
- 기존 일반 룸 생성 및 참여 흐름이 계속 동작한다.

## 10. 완료 조건

- 실제 관리자 권한이 서버 세션으로 관리된다.
- 모든 관리자 API가 서버 인증 미들웨어로 보호된다.
- 클라이언트의 로컬 상태를 조작해도 관리자 API를 사용할 수 없다.
- 관리자 API와 일반 호스트 API의 권한 모델이 분리되어 있다.
- 비밀번호, 세션 ID, 호스트 토큰이 코드, 로그, 응답에 노출되지 않는다.
- 세션 만료, 로그아웃, 권한 없음, rate limit에 대한 테스트가 존재한다.
- 기존 일반 협업 흐름에 회귀가 없다.

## 11. 구현 시 결정할 사항

- 서버 프레임워크와 세션 미들웨어
- 단일 서버 메모리 또는 Redis 기반 세션 저장소
- 정확한 세션 만료시간과 활동 기반 연장 여부
- 프론트엔드와 API의 실제 Origin 구성
- CSRF 방어 방식
- 관리자 계정을 단일 비밀번호로 유지할지 사용자별 계정으로 확장할지 여부
- 호스트 토큰의 재시작 및 룸 복구 정책
