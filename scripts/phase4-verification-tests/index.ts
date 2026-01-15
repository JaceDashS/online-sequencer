#!/usr/bin/env tsx
/**
 * Phase 4 리팩토링 검증 테스트
 * 
 * 테스트 항목:
 * 1. projectState - getProject, setProject, snapshots
 * 2. projectEvents - subscribe/notify
 * 3. projectActions - BPM, time signature, tracks, master
 * 4. projectMigration - migrateProjectAtLoad
 * 5. projectHelpers - cloneProject, updateProject
 */

import assert from 'node:assert/strict';

// Phase 4 새 모듈들 import
import { getProject, setProject, createProjectSnapshot, restoreProjectFromSnapshot } from '../../src/store/projectState';
import { 
  subscribeToProjectChanges, 
  subscribeToTrackChanges,
  notifyProjectChange,
  notifyTrackChange 
} from '../../src/store/projectEvents';
import { 
  updateBpm, 
  updateTimeSignature, 
  addTrack, 
  findTrack,
  updateMasterVolume,
  updateMasterPan 
} from '../../src/store/projectActions';
import { migrateProjectAtLoad } from '../../src/store/projectMigration';
import { cloneProject, updateProject } from '../../src/store/projectHelpers';
import type { Project, Track } from '../../src/types/project';

type TestFn = () => void | Promise<void>;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: TestFn) {
  testCount++;
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      throw new Error('Async tests are not supported in this runner.');
    }
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    if ((err as Error).stack) {
      console.error(`  ${(err as Error).stack?.split('\n')[1]}`);
    }
  }
}

console.log('Phase 4 Refactoring Verification Tests\n');
console.log('='.repeat(60));

// ============================================================================
// 1. projectState 테스트
// ============================================================================

test('projectState: getProject returns initial project', () => {
  const project = getProject();
  assert.ok(project, 'Project should exist');
  assert.equal(project.version, 2, 'Project version should be 2');
  assert.ok(project.timing, 'Project should have timing');
  assert.ok(project.tracks.length > 0, 'Project should have at least one track');
});

test('projectState: setProject updates current project', () => {
  const newProject: Project = {
    version: 2,
    timing: {
      ppqn: 480,
      tempoMap: [{ tick: 0, mpqn: 500000 }],
      timeSigMap: [{ tick: 0, num: 4, den: 4 }],
    },
    tracks: [
      {
        id: 'test-track',
        name: 'Test Track',
        instrument: 'piano',
        volume: 1.0,
        pan: 0.0,
        effects: [],
        solo: false,
        mute: false,
        mutedBySolo: false,
      },
    ],
    midiParts: [],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
  
  setProject(newProject, true); // skipMigration for test
  const loaded = getProject();
  assert.equal(loaded.tracks.length, 1, 'Project should have 1 track');
  assert.equal(loaded.tracks[0].id, 'test-track', 'Track ID should match');
});

test('projectState: createProjectSnapshot creates deep clone', () => {
  const project = getProject();
  const snapshot = createProjectSnapshot();
  
  assert.notEqual(snapshot, project, 'Snapshot should be different object');
  assert.equal(snapshot.version, project.version, 'Snapshot should have same version');
  
  // Modify snapshot and verify original is unchanged
  snapshot.tracks.push({
    id: 'snapshot-track',
    name: 'Snapshot Track',
    instrument: 'piano',
    volume: 1.0,
    pan: 0.0,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  });
  
  const original = getProject();
  assert.notEqual(original.tracks.length, snapshot.tracks.length, 'Original should not be modified');
});

test('projectState: restoreProjectFromSnapshot restores state', () => {
  const original = getProject();
  const snapshot = createProjectSnapshot();
  
  // Modify current project
  const modifiedProject: Project = {
    ...snapshot,
    tracks: [...snapshot.tracks, {
      id: 'modified-track',
      name: 'Modified Track',
      instrument: 'piano',
      volume: 1.0,
      pan: 0.0,
      effects: [],
      solo: false,
      mute: false,
      mutedBySolo: false,
    }],
  };
  setProject(modifiedProject, true);
  
  // Restore from snapshot
  restoreProjectFromSnapshot(snapshot);
  const restored = getProject();
  
  assert.equal(restored.tracks.length, snapshot.tracks.length, 'Restored project should match snapshot');
});

// ============================================================================
// 2. projectEvents 테스트
// ============================================================================

test('projectEvents: subscribeToProjectChanges receives events', () => {
  let receivedEvent: any = null;
  
  const unsubscribe = subscribeToProjectChanges((event) => {
    receivedEvent = event;
  });
  
  notifyProjectChange({ type: 'bpm', bpm: 140 });
  assert.ok(receivedEvent, 'Event should be received');
  assert.equal(receivedEvent.type, 'bpm', 'Event type should be bpm');
  assert.equal(receivedEvent.bpm, 140, 'BPM should be 140');
  
  unsubscribe();
  
  // Verify unsubscribe works
  receivedEvent = null;
  notifyProjectChange({ type: 'bpm', bpm: 150 });
  assert.equal(receivedEvent, null, 'Event should not be received after unsubscribe');
});

test('projectEvents: subscribeToTrackChanges receives events', () => {
  let receivedEvent: any = null;
  
  const unsubscribe = subscribeToTrackChanges((event) => {
    receivedEvent = event;
  });
  
  notifyTrackChange('test-track-id', { volume: 0.8 }, 'update');
  assert.ok(receivedEvent, 'Event should be received');
  assert.equal(receivedEvent.trackId, 'test-track-id', 'Track ID should match');
  assert.equal(receivedEvent.type, 'update', 'Event type should be update');
  
  unsubscribe();
});

// ============================================================================
// 3. projectActions 테스트
// ============================================================================

test('projectActions: updateBpm updates timing', () => {
  const project = getProject();
  const initialBpm = project.timing?.tempoMap[0]?.mpqn ? 60000000 / project.timing.tempoMap[0].mpqn : 120;
  
  updateBpm(140);
  const updated = getProject();
  assert.ok(updated.timing, 'Timing should exist');
  assert.ok(updated.timing.tempoMap.length > 0, 'Tempo map should have entries');
  
  const newBpm = 60000000 / updated.timing.tempoMap[0].mpqn;
  assert.equal(newBpm, 140, 'BPM should be updated to 140');
});

test('projectActions: updateTimeSignature updates timing', () => {
  updateTimeSignature([3, 4]);
  const project = getProject();
  assert.ok(project.timing, 'Timing should exist');
  assert.ok(project.timing.timeSigMap.length > 0, 'Time signature map should have entries');
  assert.equal(project.timing.timeSigMap[0].num, 3, 'Time signature numerator should be 3');
  assert.equal(project.timing.timeSigMap[0].den, 4, 'Time signature denominator should be 4');
});

test('projectActions: addTrack adds track to project', () => {
  const project = getProject();
  const initialTrackCount = project.tracks.length;
  
  const newTrack: Track = {
    id: 'test-track-2',
    name: 'Test Track 2',
    instrument: 'guitar',
    volume: 0.9,
    pan: 0.5,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  };
  
  addTrack(newTrack);
  const updated = getProject();
  assert.equal(updated.tracks.length, initialTrackCount + 1, 'Track count should increase');
  assert.ok(findTrack('test-track-2'), 'New track should be findable');
});

test('projectActions: updateMasterVolume updates master volume', () => {
  updateMasterVolume(0.75);
  const project = getProject();
  assert.equal(project.masterVolume, 0.75, 'Master volume should be 0.75');
});

test('projectActions: updateMasterPan updates master pan', () => {
  updateMasterPan(-0.5);
  const project = getProject();
  assert.equal(project.masterPan, -0.5, 'Master pan should be -0.5');
});

// ============================================================================
// 4. projectMigration 테스트
// ============================================================================

test('projectMigration: migrateProjectAtLoad migrates legacy project', () => {
  const legacyProject = {
    version: 1,
    bpm: 120,
    timeSignature: [4, 4] as [number, number],
    tracks: [],
    midiParts: [],
  } as any;
  
  const migrated = migrateProjectAtLoad(legacyProject);
  assert.equal(migrated.version, 2, 'Migrated project should have version 2');
  assert.ok(migrated.timing, 'Migrated project should have timing');
  assert.ok(migrated.timing.tempoMap.length > 0, 'Timing should have tempo map');
  assert.ok(migrated.timing.timeSigMap.length > 0, 'Timing should have time signature map');
});

test('projectMigration: migrateProjectAtLoad does not migrate version 2 project', () => {
  const v2Project: Project = {
    version: 2,
    timing: {
      ppqn: 480,
      tempoMap: [{ tick: 0, mpqn: 500000 }],
      timeSigMap: [{ tick: 0, num: 4, den: 4 }],
    },
    tracks: [],
    midiParts: [],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
  
  const result = migrateProjectAtLoad(v2Project);
  assert.equal(result.version, 2, 'Version 2 project should remain version 2');
  assert.ok(result.timing, 'Timing should be preserved');
});

// ============================================================================
// 5. projectHelpers 테스트
// ============================================================================

test('projectHelpers: cloneProject creates deep clone', () => {
  const project = getProject();
  const cloned = cloneProject(project);
  
  assert.notEqual(cloned, project, 'Cloned project should be different object');
  assert.equal(cloned.version, project.version, 'Cloned version should match');
  
  // Modify clone and verify original is unchanged
  cloned.tracks.push({
    id: 'clone-track',
    name: 'Clone Track',
    instrument: 'piano',
    volume: 1.0,
    pan: 0.0,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  });
  
  const original = getProject();
  assert.notEqual(original.tracks.length, cloned.tracks.length, 'Original should not be modified');
});

test('projectHelpers: updateProject creates updated copy', () => {
  const project = getProject();
  const updated = updateProject(project, { masterVolume: 0.9 });
  
  assert.notEqual(updated, project, 'Updated project should be different object');
  assert.equal(updated.masterVolume, 0.9, 'Updated master volume should be 0.9');
  assert.equal(project.masterVolume, getProject().masterVolume, 'Original should not be modified');
});

// ============================================================================
// 통합 테스트
// ============================================================================

test('Integration: BPM change triggers event', () => {
  let eventReceived = false;
  let eventBpm = 0;
  
  const unsubscribe = subscribeToProjectChanges((event) => {
    if (event.type === 'bpm') {
      eventReceived = true;
      eventBpm = event.bpm;
    }
  });
  
  updateBpm(160);
  
  assert.ok(eventReceived, 'BPM change should trigger event');
  assert.equal(eventBpm, 160, 'Event should contain new BPM');
  
  unsubscribe();
});

test('Integration: setProject triggers multiple events', () => {
  const events: string[] = [];
  
  const unsubscribe = subscribeToProjectChanges((event) => {
    events.push(event.type);
  });
  
  const testProject: Project = {
    version: 2,
    timing: {
      ppqn: 480,
      tempoMap: [{ tick: 0, mpqn: 500000 }],
      timeSigMap: [{ tick: 0, num: 4, den: 4 }],
    },
    tracks: [
      {
        id: 'integration-track',
        name: 'Integration Track',
        instrument: 'piano',
        volume: 1.0,
        pan: 0.0,
        effects: [],
        solo: false,
        mute: false,
        mutedBySolo: false,
      },
    ],
    midiParts: [],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
  
  setProject(testProject, true);
  
  assert.ok(events.includes('bpm'), 'Should receive bpm event');
  assert.ok(events.includes('timeSignature'), 'Should receive timeSignature event');
  
  unsubscribe();
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);
if (failCount > 0) {
  console.error(`\n${failCount} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ All Phase 4 verification tests passed!');
}

