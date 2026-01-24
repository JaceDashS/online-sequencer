# Online DAW

[English](README.md)

[![Windows 설치 파일 다운로드](https://img.shields.io/badge/Windows-설치%20파일%20다운로드-blue?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online.Sequencer.Setup.0.1.0.exe)
[![Windows 포터블 버전 다운로드](https://img.shields.io/badge/Windows-포터블%20버전%20다운로드-green?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online-Sequencer-0.1.0-Windows-Portable.zip)

Online DAW는 React, TypeScript, Vite 기반으로 구현된 **웹 기반 디지털 오디오 워크스테이션(DAW)**입니다.  
MIDI 편집 기능과 WebRTC 기반 실시간 협업 기능을 제공합니다.

## 주요 기능

- **MIDI 편집**: 피아노 롤 기반 UI를 통한 MIDI 노트 생성 및 편집
- **표준 MIDI 파일(SMF) 지원**: MIDI 1.0 규격을 준수하는 MIDI 파일 불러오기 및 내보내기
- **실시간 협업**: WebRTC P2P 통신 기반 실시간 공동 작업 (Star Topology)
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

### 백엔드 (시그널링 서버)
- **런타임**: Node.js, Express
- **실시간 통신**: WebSocket(ws), WebRTC 시그널링
- **토폴로지**: 확장성을 고려한 Star Topology

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
│   ├── domain/       # 도메인 모델 (Project, Timing)
│   ├── hooks/        # UI 로직용 커스텀 React 훅
│   ├── pages/        # 라우트 페이지
│   ├── store/        # 상태 관리 (Actions, History, Stores)
│   ├── transport/    # 플랫폼 추상화 계층 (Web/Electron I/O 어댑터)
│   ├── utils/        # 유틸리티 (Logger, 수학, 시간 계산)
│   └── workers/      # Web Worker (재생 클럭, 디버그 로거)
├── docs/             # 문서 (아키텍처, 사양, 매뉴얼)
├── server/           # 협업용 시그널링 서버
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

```bash
# 유닛 테스트 실행
npm run test:unit

# MIDI 관련 전체 테스트
npm run test:midi-all

# 전체 테스트
npm run test
```

## 문서

다음 문서는 `docs/README.ko.md`를 참고하십시오.

- MIDI 표준 준수 사양
- 실시간 협업 기능 사양
- 전체 아키텍처 문서
- 프로젝트 저장/불러오기 포맷 정의

## 라이선스

자세한 내용은 [LICENSE](LICENSE) 파일을 참고하십시오.
