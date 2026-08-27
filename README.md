# Online DAW

[한국어](README.ko.md)

[![Download Installer](https://img.shields.io/badge/Windows-Download%20Installer-blue?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online.Sequencer.Setup.0.1.0.exe)
[![Download Portable](https://img.shields.io/badge/Windows-Download%20Portable-green?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online-Sequencer-0.1.0-Windows-Portable.zip)

A web-based Digital Audio Workstation (DAW) built with React, TypeScript, and Vite. Online DAW provides MIDI editing capabilities and client-side real-time collaboration features.

## Features

- **MIDI Editing**: Create and edit MIDI notes with a visual piano roll interface
- **Standard MIDI File (SMF) Support**: Import and export MIDI files compliant with MIDI 1.0 specification
- **Real-time Collaboration**: Client-side WebRTC P2P collaboration with WebSocket signaling integration
- **Multi-track Support**: Work with multiple tracks, each with independent volume, panning, and effects
- **Audio Engine**: Sample-based playback (SFZ support for Piano, GM Drums), custom effect chain architecture
- **Audio Effects**: Apply effects such as EQ, Delay, Compressor, and Reverb to tracks and master channel
- **Project Management**: Save and load projects in JSON and MIDI formats
- **History System**: Undo/Redo support for project changes (Note level & Part level)
- **Responsive UI**: Zoomable timeline, resizable tracks, and mobile support check

## Tech Stack

### Frontend
- **Framework**: React 19, TypeScript, Vite
- **State Management**: React Context + Custom Store Pattern
- **Audio**: Web Audio API (Schedule Lookahead), SFZ Parser
- **Styling**: CSS Modules

### Desktop (Electron)
- **Engine**: Electron 39+ (Chromium + Node.js)
- **IPC**: Context Isolation, Preload Scripts
- **Build**: electron-builder (Windows NSIS/Portable, macOS DMG, Linux AppImage)

### Collaboration Networking
- **Signaling Client**: HTTP and WebSocket APIs configured through `VITE_API_BASE_URL`
- **P2P Transport**: WebRTC DataChannel
- **Topology**: Star Topology for host-centered collaboration

## Project Structure

```
online-daw/
├── src/
│   ├── components/   # React UI components (EventDisplay, MidiEditor, Mixer, etc.)
│   ├── constants/    # App constants (MIDI, UI settings)
│   ├── core/         # Core business logic
│   │   ├── audio/    # Audio engine, Playback controller
│   │   ├── effects/  # Audio effects implementation (EQ, Reverb, etc.)
│   │   ├── midi/     # MIDI parser/exporter, SMF types
│   │   └── sync/     # Collaboration logic (WebRTC, Conflict resolution)
│   ├── domain/       # Domain models (Project, Timing)
│   ├── hooks/        # Custom React hooks for UI logic
│   ├── pages/        # Route pages
│   ├── store/        # State management (Actions, History, Stores)
│   ├── transport/    # Platform abstraction layer (Web/Electron I/O adapter)
│   ├── utils/        # Utilities (Logger, Math, Time calculation)
│   └── workers/      # Web Workers (Playback Clock, Debug Logger)
├── docs/             # Documentation (Architecture, Specs, Manuals)
├── electron/         # Electron main and preload processes
├── scripts/          # Test and verification scripts
├── case-tests/       # QA fixtures and detailed case references
└── public/           # Static assets (Samples, Icons)
```

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
# Start development server
npm run dev

# Run with Electron
npm run electron:dev
```

### Build

```bash
# Build for production
npm run build

# Build Electron app
npm run electron:build
```

## Testing

### 1. Script integration tests

```bash
# Run the complete integration test suite
npm test

# Run an individual group when needed
npm run test:unit
npm run test:store
npm run test:history
npm run test:sync
npm run test:midi-all
```

### 2. Browser and user integration tests

```bash
# Start the development server and open the QA console
npm run qa
```

The QA console is available only at `/qa` in development. Codex browser checks use a 1280×720 baseline. If the server is unavailable, only server-dependent collaboration scenarios become `BLOCKED`; offline scenarios continue. See the [integration testing strategy](docs/testing.en.md) for details.

## Documentation

See [docs/README.en.md](docs/README.en.md) for detailed documentation including:
- MIDI standard compliance specifications
- Collaboration feature specifications
- Architecture documentation
- Project save/load specifications

## License

See [LICENSE](LICENSE) file for details.
