# Online DAW

[한국어](README.ko.md)

[![Download Installer](https://img.shields.io/badge/Windows-Download%20Installer-blue?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online.Sequencer.Setup.0.1.0.exe)
[![Download Portable](https://img.shields.io/badge/Windows-Download%20Portable-green?style=for-the-badge&logo=windows)](https://github.com/JaceDashS/online-sequencer/releases/download/v0.1.0/Online-Sequencer-0.1.0-Windows-Portable.zip)

A web-based Digital Audio Workstation (DAW) built with React, TypeScript, and Vite. Online DAW provides MIDI editing capabilities with real-time collaboration support.

## Features

- **MIDI Editing**: Create and edit MIDI notes with a visual piano roll interface
- **Standard MIDI File (SMF) Support**: Import and export MIDI files compliant with MIDI 1.0 specification
- **Real-time Collaboration**: Collaborate with others using WebRTC P2P communication (Star Topology)
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

### Backend (Signaling Server)
- **Runtime**: Node.js, Express
- **Real-time**: WebSocket (ws), WebRTC Signaling
- **Topology**: Star Topology for scalable collaboration

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
├── server/           # Signaling server for collaboration
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

```bash
# Run unit tests
npm run test:unit

# Run MIDI-related tests
npm run test:midi-all

# Run case tests
npm run test
```

## Project Structure

```
online-daw/
├── src/
│   ├── components/   # React UI components
│   ├── constants/    # App constants (MIDI, UI)
│   ├── core/         # Core logic (Audio engine, MIDI parser, Sync)
│   ├── domain/       # Domain models (Project, Timing)
│   ├── hooks/        # Custom React hooks
│   ├── pages/        # Route pages
│   ├── store/        # State management & Actions
│   ├── transport/    # Transport layer (Web/Electron abstraction)
│   ├── utils/        # Utilities (Logger, Math, Time)
│   └── workers/      # Web Workers (Clock, Logger)
├── docs/             # Documentation (Architecture, Specs, Manuals)
├── server/           # Signaling server for collaboration
└── public/           # Static assets (Samples, Icons)
```

## Documentation

See [docs/README.en.md](docs/README.en.md) for detailed documentation including:
- MIDI standard compliance specifications
- Collaboration feature specifications
- Architecture documentation
- Project save/load specifications

## License

See [LICENSE](LICENSE) file for details.
