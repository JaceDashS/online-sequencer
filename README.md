# Online DAW

A web-based Digital Audio Workstation (DAW) built with React, TypeScript, and Vite. Online DAW provides MIDI editing capabilities with real-time collaboration support.

## Features

- **MIDI Editing**: Create and edit MIDI notes with a visual piano roll interface
- **Standard MIDI File (SMF) Support**: Import and export MIDI files compliant with MIDI 1.0 specification
- **Real-time Collaboration**: Collaborate with others using WebRTC P2P communication
- **Multi-track Support**: Work with multiple tracks, each with independent volume, panning, and effects
- **Audio Effects**: Apply effects such as EQ, Delay, and Reverb to tracks and master channel
- **Project Management**: Save and load projects in JSON and MIDI formats

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Electron (optional)
- **Audio**: Web Audio API
- **Collaboration**: WebRTC, WebSocket

## Getting Started

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
├── src/              # Source code
│   ├── components/   # React components
│   ├── core/         # Core logic (MIDI, audio, sync)
│   ├── store/        # State management
│   ├── hooks/        # Custom React hooks
│   └── utils/        # Utility functions
├── docs/             # Documentation
│   ├── specs/        # Technical specifications
│   └── architecture/ # Architecture documentation
├── server/           # Signaling server for collaboration
└── public/           # Static assets
```

## Documentation

See [docs/README.md](docs/README.md) for detailed documentation including:
- MIDI standard compliance specifications
- Collaboration feature specifications
- Architecture documentation
- Project save/load specifications

## License

See [LICENSE](LICENSE) file for details.
