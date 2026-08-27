# Online DAW Documentation

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-08-28

---

This folder contains all documentation for the Online DAW project.

See [`testing.en.md`](testing.en.md) for the testing workflow.

## Folder Structure

### `/specs`
Project implementation specifications and standards compliance documents

#### MIDI Related
- `midi-standard-compliance.ko.md` - MIDI Standard Compliance Specification (Korean)
- `midi-standard-compliance.en.md` - MIDI Standard Compliance Specification (English)

#### Feature Specifications
- `collaboration-specification.ko.md` - Collaboration Feature Specification (Korean)
- `collaboration-specification.en.md` - Collaboration Feature Specification (English) - Server API, P2P communication, exception handling
- `project-save-load-specification.ko.md` - Project Save/Load Specification (Korean)
- `project-save-load-specification.en.md` - Project Save/Load Specification (English)

### `/architecture`
System architecture and design documents

#### Main Documents
- [`README.ko.md`](./architecture/README.ko.md) - Architecture Documentation Overview (Korean)
- [`README.en.md`](./architecture/README.en.md) - Architecture Documentation Overview (English)

#### Optimization Design
- [`optimization-design/index.ko.md`](./architecture/optimization-design/index.ko.md) - Performance Optimization Techniques by Category (Korean)
- [`optimization-design/index.en.md`](./architecture/optimization-design/index.en.md) - Performance Optimization Techniques by Category (English)
  - **Architecture Level**: Rendering architecture, resource management
  - **Implementation Level**: Audio playback, UI, data access optimization

### `/manual`
User manual and guide documents

#### User Manual
- [`README.ko.md`](./manual/README.ko.md) - User Manual (Korean)
  - Getting started, basic operations, keyboard shortcuts
  - MIDI editing, track management, playback and recording
  - Project save/load, collaboration, troubleshooting
- [`README.en.md`](./manual/README.en.md) - User Manual (English)

---

## Documentation Rules

1. **Language**: Both Korean and English versions are provided (when possible)
2. **Format**: Markdown (.md)
3. **Version Control**: Version information is specified at the top of each document
4. **Links**: Use relative paths

---

## Document Categories

### Specifications
Documents that clearly define how features work, APIs, protocols, etc.
- MIDI standard compliance
- File format definitions
- API specifications
- Protocol definitions

### Architecture Documents
Documents that explain system structure, design decisions, optimization techniques, etc.
- Module boundaries and dependencies
- Optimization techniques
- Resource management

---

## Related Documents

### Project Root
- `README.md` - Project Overview (English)
- `README.ko.md` - Project Overview (Korean)

---

## Testing

### Script Integration Tests
- `npm test`: Runs the unit, store, history, sync, and MIDI groups in sequence
- `npm run test:unit`: Core compliance tests that import production source
- `npm run test:midi-all`: Production MIDI conversion, migration, and edge regression tests
- `npm run test:history`: History undo/redo regression tests
- `npm run test:store`: Store module verification tests
- `npm run test:sync`: Collaboration state synchronization module tests

### Browser and User Integration Tests
- `npm run qa`: Starts the development server and opens the `/qa` integration console
- Codex browser baseline: Chromium at 1280×720
- Direct user scope: listening, devices, external networks, Electron, and Firefox
- Detailed policy: [`testing.en.md`](testing.en.md)

---

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-08-28
