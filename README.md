# Online DAW


[![Windows 설치 파일 다운로드](https://img.shields.io/badge/Windows-설치%20파일%20다운로드-blue?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online.Sequencer.Setup.0.1.0.exe)
[![Windows 포터블 버전 다운로드](https://img.shields.io/badge/Windows-포터블%20버전%20다운로드-green?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online-Sequencer-0.1.0-Windows-Portable.zip)

Online DAW는 React, TypeScript, Vite 기반으로 구현된 **웹 기반 디지털 오디오 워크스테이션(DAW)**입니다.  
MIDI 편집 기능과 클라이언트 측 실시간 협업 기능을 제공합니다.

## 주요 기능

- **MIDI 편집**: 피아노 롤 기반 UI를 통한 MIDI 노트 생성 및 편집
- **표준 MIDI 파일(SMF) 지원**: MIDI 1.0 규격을 준수하는 MIDI 파일 불러오기 및 내보내기
- **실시간 협업**: WebSocket 시그널링 연동과 WebRTC P2P 기반 클라이언트 협업
- **멀티 트랙 지원**: 각 트랙별 볼륨, 패닝, 이펙트 개별 제어
- **오디오 엔진**: 샘플 기반 재생 구조 (SFZ 지원: 피아노, GM 드럼), 커스텀 이펙트 체인 아키텍처
- **오디오 이펙트**: EQ, 딜레이, 컴프레서, 리버브 등 트랙/마스터 채널 이펙트 적용
- **프로젝트 관리**: JSON 및 MIDI 형식으로 프로젝트 저장 및 불러오기
- **히스토리 시스템**: Undo / Redo 지원 (노트 단위 및 파트 단위)
- **반응형 UI**: 타임라인 줌, 트랙 크기 조절, 모바일 환경 대응 여부 검증

## 기술 스택

### 프론트엔드
- **프레임워크**: React 19, TypeScript, Vite
- **상태 관리**: React Context + Custom Store 패턴
- **오디오 처리**: Web Audio API (Schedule Lookahead), SFZ 파서
- **스타일링**: CSS Modules

### 데스크톱 (Electron)
- **엔진**: Electron 39+ (Chromium + Node.js)
- **IPC**: Context Isolation, Preload Script
- **빌드**: electron-builder (Windows NSIS / Portable, macOS DMG, Linux AppImage)

### 협업 네트워킹
- **시그널링 클라이언트**: `https://api.jace-s.com/online-sequencer` REST와 `wss://api.jace-s.com/online-sequencer/signaling` WebSocket 연동 (`VITE_API_URL`, [API 설정](docs/architecture/api-configuration.ko.md))
- **P2P 전송**: WebRTC DataChannel
- **토폴로지**: 호스트 중심 Star Topology
- **jace-s 연동**: 서비스 공지 토스트(`/health`, `/notices?app=41`), `online-sequencer.jace-s.com`에서 jace-s 로그인 ([명세](docs/specs/service-notices-and-login.ko.md))

## 프로젝트 구조

```
online-daw/
├── src/
│   ├── components/   # React UI 컴포넌트 (EventDisplay, MidiEditor, Mixer 등)
│   ├── constants/    # 애플리케이션 상수 (MIDI, UI 설정)
│   ├── core/         # 핵심 비즈니스 로직
│   │   ├── audio/    # 오디오 엔진, 재생 컨트롤러
│   │   ├── effects/  # 오디오 이펙트 구현 (EQ, Reverb 등)
│   │   ├── midi/     # MIDI 파서/익스포터, SMF 타입
│   │   └── sync/     # 협업 로직 (WebRTC, 충돌 해결)
│   ├── domain/       # 도메인 로직 (timing 변환·캐시)
│   ├── hooks/        # UI 로직용 커스텀 React 훅
│   ├── pages/        # 라우트 페이지 (DAW, 개발 전용 QA)
│   ├── qa/           # QA 시나리오 정의
│   ├── store/        # 상태 관리 (Actions, History, Stores)
│   ├── transport/    # 플랫폼 추상화 계층 (Web/Electron I/O 어댑터)
│   ├── types/        # 프로젝트·Electron 타입 정의
│   ├── utils/        # 유틸리티 (Logger, 수학, 시간 계산)
│   └── workers/      # Web Worker (재생 클럭, 디버그 로거)
├── docs/             # 문서 (명세, 아키텍처, 매뉴얼, 작업 기록)
├── electron/         # Electron main/preload 프로세스
├── scripts/          # 테스트 및 검증 스크립트
├── case-tests/       # QA 테스트 데이터와 상세 케이스 참고 자료
└── public/           # 정적 에셋 (샘플, 아이콘)
```

## 사전 요구 사항

- Node.js 20.19 이상 또는 22.12 이상
- npm 또는 yarn

## 설치

```bash
npm install
```

## 개발

```bash
# 개발 서버 실행
npm run dev

# Electron 환경 실행
npm run electron:dev
```

## 빌드

```bash
# 프로덕션 빌드
npm run build

# Electron 앱 빌드
npm run electron:build
```

## 테스트

### 1. 스크립트 통합 테스트

```bash
# 전체 통합 테스트 실행
npm test

# 필요한 묶음만 실행
npm run test:unit
npm run test:store
npm run test:history
npm run test:sync
npm run test:midi-all
```

### 2. 브라우저 및 사용자 통합 테스트

```bash
# 개발 서버를 시작하고 QA 화면 열기
npm run qa
```

QA 화면은 개발 환경의 `/qa`에서만 제공됩니다. Codex 브라우저 테스트는 1280×720을 기준으로 하며, 서버가 응답하지 않으면 협업 시나리오만 `BLOCKED`로 처리하고 오프라인 시나리오는 계속 진행합니다. 상세한 운영 원칙은 [통합 테스트 전략](docs/testing.ko.md)을 참고하십시오.

## 문서

문서 목록과 분류 기준은 [`docs/README.ko.md`](docs/README.ko.md)를 참고하십시오.

- [MIDI 표준 준수 사양](docs/specs/midi-standard-compliance.ko.md)
- [프로젝트 저장/불러오기 포맷](docs/specs/project-save-load-specification.ko.md)
- [실시간 협업 명세](docs/specs/collaboration-specification/README.ko.md)
- [아키텍처 문서](docs/architecture/README.ko.md)
- [사용자 매뉴얼](docs/manual/README.ko.md)

## 라이선스

자세한 내용은 [LICENSE](LICENSE) 파일을 참고하십시오.
