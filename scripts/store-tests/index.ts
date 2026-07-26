#!/usr/bin/env tsx
/**
 * Store module verification tests.
 *
 * Covered modules:
 * - projectState: get/set, snapshots, immutable updates, indexes
 * - projectEvents: project and track subscriptions
 * - projectActions: BPM, time signature, master controls
 * - trackActions: track add/find
 * - projectMigration: legacy project migration
 */

import assert from 'node:assert/strict';

import {
  createProjectSnapshot,
  getProject,
  restoreProjectFromSnapshot,
  setProject,
  updateProjectImmutable,
} from '../../src/store/projectState';
import {
  notifyProjectChange,
  notifyTrackChange,
  subscribeToProjectChanges,
  subscribeToTrackChanges,
} from '../../src/store/projectEvents';
import {
  updateBpm,
  updateMasterPan,
  updateMasterVolume,
  updateTimeSignature,
} from '../../src/store/projectActions';
import { addTrack, findTrack } from '../../src/store/actions/trackActions';
import { migrateProjectAtLoad } from '../../src/store/projectMigration';
import type { Project, Track } from '../../src/types/project';

type TestFn = () => void;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function createTrack(id: string, name = 'Test Track'): Track {
  return {
    id,
    name,
    instrument: 'piano',
    volume: 1.0,
    pan: 0.0,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  };
}

function createTestProject(): Project {
  return {
    version: 2,
    timing: {
      ppqn: 480,
      tempoMap: [{ tick: 0, mpqn: 500000 }],
      timeSigMap: [{ tick: 0, num: 4, den: 4 }],
    },
    tracks: [createTrack('track-1', 'Track 1')],
    midiParts: [],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
}

function resetProject(): void {
  setProject(createTestProject(), true);
}

function test(name: string, fn: TestFn): void {
  testCount += 1;
  try {
    fn();
    passCount += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failCount += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${(err as Error).message}`);
    const stackLine = (err as Error).stack?.split('\n')[1];
    if (stackLine) {
      console.error(`  ${stackLine}`);
    }
  }
}

console.log('Store module verification tests\n');
console.log('='.repeat(60));

test('projectState: getProject returns a valid project', () => {
  resetProject();

  const project = getProject();
  assert.equal(project.version, 2);
  assert.ok(project.timing);
  assert.equal(project.tracks.length, 1);
  assert.equal(project.tracks[0].id, 'track-1');
});

test('projectState: setProject updates current project and rebuilds indexes', () => {
  const project = createTestProject();
  project.tracks = [createTrack('indexed-track', 'Indexed Track')];

  setProject(project, true);

  assert.equal(getProject().tracks[0].id, 'indexed-track');
  assert.equal(findTrack('indexed-track')?.name, 'Indexed Track');
});

test('projectState: createProjectSnapshot creates a deep clone', () => {
  resetProject();

  const project = getProject();
  const snapshot = createProjectSnapshot();

  assert.notEqual(snapshot, project);
  assert.equal(snapshot.version, project.version);

  snapshot.tracks.push(createTrack('snapshot-track', 'Snapshot Track'));

  assert.notEqual(getProject().tracks.length, snapshot.tracks.length);
});

test('projectState: restoreProjectFromSnapshot restores state and indexes', () => {
  resetProject();

  const snapshot = createProjectSnapshot();
  addTrack(createTrack('temporary-track', 'Temporary Track'));

  assert.ok(findTrack('temporary-track'));

  restoreProjectFromSnapshot(snapshot);

  assert.equal(getProject().tracks.length, snapshot.tracks.length);
  assert.equal(findTrack('temporary-track'), undefined);
  assert.ok(findTrack('track-1'));
});

test('projectState: updateProjectImmutable applies updates without mutating the snapshot input', () => {
  resetProject();

  updateProjectImmutable((project) => ({
    ...project,
    masterVolume: 0.9,
    tracks: [...project.tracks, createTrack('immutable-track', 'Immutable Track')],
  }));

  const updated = getProject();
  assert.equal(updated.masterVolume, 0.9);
  assert.ok(findTrack('immutable-track'));
});

test('projectEvents: subscribeToProjectChanges receives and unsubscribes events', () => {
  resetProject();
  let receivedBpm = 0;

  const unsubscribe = subscribeToProjectChanges((event) => {
    if (event.type === 'bpm') {
      receivedBpm = event.bpm;
    }
  });

  notifyProjectChange({ type: 'bpm', bpm: 140 });
  assert.equal(receivedBpm, 140);

  unsubscribe();
  notifyProjectChange({ type: 'bpm', bpm: 150 });
  assert.equal(receivedBpm, 140);
});

test('projectEvents: subscribeToTrackChanges receives and unsubscribes events', () => {
  resetProject();
  let receivedTrackId: string | null = null;

  const unsubscribe = subscribeToTrackChanges((event) => {
    receivedTrackId = event.trackId;
  });

  notifyTrackChange('track-1', { volume: 0.8 }, 'update');
  assert.equal(receivedTrackId, 'track-1');

  unsubscribe();
  notifyTrackChange('track-2', { volume: 0.6 }, 'update');
  assert.equal(receivedTrackId, 'track-1');
});

test('projectActions: updateBpm updates timing and emits a bpm event', () => {
  resetProject();
  let eventBpm = 0;

  const unsubscribe = subscribeToProjectChanges((event) => {
    if (event.type === 'bpm') {
      eventBpm = event.bpm;
    }
  });

  updateBpm(140);

  const tempo = getProject().timing?.tempoMap[0];
  assert.ok(tempo);
  assert.equal(60000000 / tempo.mpqn, 140);
  assert.equal(eventBpm, 140);

  unsubscribe();
});

test('projectActions: updateTimeSignature updates timing', () => {
  resetProject();

  updateTimeSignature([3, 4]);

  const timeSignature = getProject().timing?.timeSigMap[0];
  assert.ok(timeSignature);
  assert.equal(timeSignature.num, 3);
  assert.equal(timeSignature.den, 4);
});

test('projectActions: master controls update project state', () => {
  resetProject();

  updateMasterVolume(0.75);
  updateMasterPan(-0.5);

  const project = getProject();
  assert.equal(project.masterVolume, 0.75);
  assert.equal(project.masterPan, -0.5);
});

test('trackActions: addTrack adds a track and updates the index', () => {
  resetProject();

  addTrack(createTrack('added-track', 'Added Track'));

  assert.equal(getProject().tracks.length, 2);
  assert.equal(findTrack('added-track')?.name, 'Added Track');
});

test('projectMigration: migrateProjectAtLoad migrates legacy project timing', () => {
  const legacyProject = {
    version: 1,
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    midiParts: [],
  } as unknown as Project;

  const migrated = migrateProjectAtLoad(legacyProject);

  assert.equal(migrated.version, 2);
  assert.ok(migrated.timing);
  assert.ok(migrated.timing.tempoMap.length > 0);
  assert.ok(migrated.timing.timeSigMap.length > 0);
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);

if (failCount > 0) {
  console.error(`\n${failCount} test(s) failed`);
  process.exit(1);
}

console.log('\nAll store module verification tests passed.');
