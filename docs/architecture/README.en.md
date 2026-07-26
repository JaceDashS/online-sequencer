# Architecture Documentation

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Document Structure

### Optimization Design
- [`optimization-design/index.ko.md`](./optimization-design/index.ko.md) - Performance Optimization Techniques by Category (Korean)
- [`optimization-design/index.en.md`](./optimization-design/index.en.md) - Performance Optimization Techniques by Category (English)
  - **Architecture Level**: Rendering architecture optimization
  - **Implementation Level**: Audio playback, UI, data access optimization

---

## Optimization Design Documents

Optimization design documents are organized by category:

### Architecture Level Optimization
- [rAF-based Playback Head Update](./optimization-design/architecture-level/raf-playback-head.en.md)
- [Worker-based Playback Clock](./optimization-design/architecture-level/worker-playback-clock.en.md)

### Implementation Level Optimization

#### Audio Playback Optimization
- [Lookahead Scheduling](./optimization-design/implementation-level/lookahead-scheduling.en.md)
- [Drift Correction System](./optimization-design/implementation-level/drift-correction.en.md)
- [Configurable Audio Buffer Size](./optimization-design/implementation-level/audio-buffer-size.en.md)
- [Pitch Class Interference Prevention](./optimization-design/implementation-level/pitch-class-interference-prevention.en.md)
- [Batch Sample Loading](./optimization-design/implementation-level/batch-sample-loading.en.md)

#### UI Optimization
- [MIDI Editor Scroll Synchronization](./optimization-design/implementation-level/scroll-synchronization.en.md)

#### Data Access Optimization
- [Data Indexing](./optimization-design/data-access/indexing.en.md)
- [Timing Conversion Caching](./optimization-design/data-access/timing-cache.en.md)

---

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14
