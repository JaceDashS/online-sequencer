# Online DAW

[![Download Windows installer](https://img.shields.io/badge/Windows-Download%20Installer-blue?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online.Sequencer.Setup.0.1.0.exe)
[![Download Windows portable](https://img.shields.io/badge/Windows-Download%20Portable-green?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online-Sequencer-0.1.0-Windows-Portable.zip)

Online DAW is a **web-based digital audio workstation (DAW)** built with React, TypeScript and Vite.
It provides MIDI editing and client-side real-time collaboration.

## Features

- **MIDI editing**: create and edit MIDI notes in a piano-roll UI
- **Standard MIDI File (SMF) support**: import and export MIDI files following the MIDI 1.0 specification
- **Real-time collaboration**: WebSocket signaling and WebRTC peer-to-peer collaboration
- **Multi-track**: per-track volume, pan and effects
- **Audio engine**: sample-based playback (SFZ: piano, GM drums) with a custom effect chain
- **Audio effects**: EQ, delay, compressor, reverb and more on tracks and the master channel
- **Project files**: save and load projects as JSON and MIDI
- **History**: undo / redo for notes and parts
- **Service notices and sign-in**: jace-s service notice toasts and optional jace-s sign-in on `online-sequencer.jace-s.com`
- **Desktop-first UI**: timeline zoom and resizable tracks; screens 1120px wide or narrower show a not-supported notice

## Tech Stack

### Frontend
- **Framework**: React 19, TypeScript, Vite
- **State**: React Context + custom store pattern
- **Audio**: Web Audio API (lookahead scheduling with a fixed `AudioContext` anchor), SFZ parser
- **Styling**: CSS Modules

### Desktop (Electron)
- **Runtime**: Electron 39+ (Chromium + Node.js)
- **IPC**: context isolation, preload script
- **Packaging**: electron-builder (Windows NSIS / Portable, macOS DMG, Linux AppImage)

### Collaboration and jace-s integration
- **Signaling**: REST at `https://api.jace-s.com/online-sequencer` and WebSocket at `wss://api.jace-s.com/online-sequencer/signaling`
- **P2P transport**: WebRTC DataChannel, host-centered star topology
- **Host authorization**: per-room `hostToken` (Bearer for REST, `data.hostToken` for WebSocket `register`)
- **Service status**: `GET /health` and `GET /notices?app=41` once on app entry

## Project Structure

```
online-daw/
├── src/
│   ├── components/   # React UI components (EventDisplay, MidiEditor, Mixer, ...)
│   ├── constants/    # App constants (MIDI, UI)
│   ├── core/
│   │   ├── audio/    # Audio engine and playback controller
│   │   ├── auth/     # jace-s sign-in session and admin approval
│   │   ├── effects/  # Audio effects (EQ, reverb, ...)
│   │   ├── midi/     # MIDI parser/exporter, SMF types
│   │   ├── notices/  # jace-s health and notice checks
│   │   └── sync/     # Collaboration (signaling, WebRTC, sync)
│   ├── domain/       # Domain logic (timing conversion and cache)
│   ├── hooks/        # Custom React hooks
│   ├── pages/        # Routes (DAW, dev-only QA)
│   ├── qa/           # QA scenario definitions
│   ├── store/        # State (actions, history, stores)
│   ├── transport/    # Platform I/O adapters (web / Electron)
│   ├── types/        # Project and Electron types
│   ├── utils/        # Utilities (config, logger, timing, theme, ...)
│   └── workers/      # Web Workers (playback clock, debug logger)
├── docs/             # Documentation in Korean (specs, architecture, manual, work log)
├── electron/         # Electron main / preload
├── scripts/          # Test and verification scripts
├── case-tests/       # QA fixtures and detailed case references
└── public/           # Static assets (samples, icons)
```

## Requirements

- Node.js 20.19+ or 22.12+
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

There are no built-in defaults for the jace-s settings. Copy `.env.example` and set every value.

| Variable | Production value | When missing |
|---|---|---|
| `VITE_API_URL` | `https://api.jace-s.com` (no `/api` path) | Collaboration, notices and sign-in are disabled |
| `VITE_SITE_URL` | `https://jace-s.com` | Sign-in is disabled |
| `VITE_NOTICE_APP_ID` | `41` | Notices are not fetched (health check only) |
| `VITE_LOGIN_HOSTS` | `online-sequencer.jace-s.com` | Sign-in UI and the production developer panel are hidden |
| `VITE_TURN_SERVER_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | Optional | Public STUN servers only |

- `VITE_` values are embedded in the client bundle at build time. Do not put secrets in them, and redeploy after changing them.
- Production builds print a warning for missing required values. Details (in Korean): [API configuration](docs/architecture/api-configuration.md).

## Development

```bash
# Start the dev server
npm run dev

# Run in Electron
npm run electron:dev
```

## Build

```bash
# Production web build
npm run build

# Electron app
npm run electron:build
```

## Testing

```bash
# Script integration tests
npm test

# Start the dev server and open the QA page (/qa, dev only)
npm run qa
```

See the [integration test strategy](docs/testing.md) (Korean) for order, verdicts and the server outage policy.

## Documentation

Project documentation is primarily written in Korean. Start from the [documentation index](docs/00-index.md).

- [MIDI standard compliance](docs/specs/midi-standard-compliance.md)
- [Project save/load format](docs/specs/project-save-load-specification.md)
- [Real-time collaboration spec](docs/specs/collaboration-specification/README.md)
- [jace-s notices and sign-in](docs/specs/service-notices-and-login.md)
- [Architecture](docs/architecture/README.md)
- [User manual](docs/manual/README.md)

## License

See [LICENSE](LICENSE).
