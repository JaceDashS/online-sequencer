# Architecture Documentation

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Document Structure

### Module Boundary Design
- [`module-boundaries.ko.md`](./module-boundaries.ko.md) - Module Boundaries and Dependency Rules (Korean)
- [`module-boundaries.en.md`](./module-boundaries.en.md) - Module Boundaries and Dependency Rules (English)

### Optimization Design
- [`optimization-design/index.ko.md`](./optimization-design/index.ko.md) - Performance Optimization Techniques by Category (Korean)
- [`optimization-design/index.en.md`](./optimization-design/index.en.md) - Performance Optimization Techniques by Category (English)
  - **Architecture Level**: Rendering architecture optimization
  - **Implementation Level**: Audio playback, UI, data access optimization

### Cross-Boundary Imports
- [`cross-boundary-imports.ko.md`](./cross-boundary-imports.ko.md) - Cross-Boundary Import Rules (Korean)
- [`cross-boundary-imports.en.md`](./cross-boundary-imports.en.md) - Cross-Boundary Import Rules (English)

---

## Optimization Design Documents

Optimization design documents are organized by category:

### Architecture Level Optimization
- [rAF-based Playback Head Update](./optimization-design/architecture-level/raf-playback-head.md)
- [Worker-based Playback Clock](./optimization-design/architecture-level/worker-playback-clock.md)

### Implementation Level Optimization

#### Audio Playback Optimization
- [Lookahead Scheduling](./optimization-design/implementation-level/lookahead-scheduling.md)
- [Drift Correction System](./optimization-design/implementation-level/drift-correction.md)
- [Configurable Audio Buffer Size](./optimization-design/implementation-level/audio-buffer-size.md)
- [Pitch Class Interference Prevention](./optimization-design/implementation-level/pitch-class-interference-prevention.md)
- [Batch Sample Loading](./optimization-design/implementation-level/batch-sample-loading.md)

#### UI Optimization
- [MIDI Editor Scroll Synchronization](./optimization-design/implementation-level/scroll-synchronization.md)

#### Data Access Optimization
- [Data Indexing](./optimization-design/data-access/indexing.md)
- [Timing Conversion Caching](./optimization-design/data-access/timing-cache.md)

---

## Related Documents

### Others
- [`../reference/audio-buffer-size-specification.ko.md`](../reference/audio-buffer-size-specification.ko.md) - Buffer Size Specification (Korean)
- [`../reference/audio-buffer-size-specification.en.md`](../reference/audio-buffer-size-specification.en.md) - Buffer Size Specification (English)

---

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

