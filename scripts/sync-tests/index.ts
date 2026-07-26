#!/usr/bin/env tsx
/**
 * Sync module verification tests.
 *
 * Covered modules:
 * - SyncManager: initial project state serialization and deserialization
 */

import assert from 'node:assert/strict';

import { SyncManager } from '../../src/core/sync/SyncManager';
import type { CollaborationManager } from '../../src/core/sync/CollaborationManager';
import type { P2PMessage } from '../../src/core/sync/types/p2p';
import { getProject, setProject } from '../../src/store/projectState';
import type { Project, Track } from '../../src/types/project';

type TestFn = () => void;
type P2PCallback = (message: P2PMessage) => void;

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
    midiParts: [
      {
        id: 'part-1',
        trackId: 'track-1',
        startTick: 0,
        durationTicks: 960,
        notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 480 }],
      },
    ],
    masterVolume: 1.0,
    masterPan: 0.0,
    masterEffects: [],
  };
}

function createMockCollaborationManager(opts: { clientId: string; isHost: boolean }) {
  const p2pCallbacks: P2PCallback[] = [];
  const sentToGuest: Array<{ guestId: string; message: P2PMessage }> = [];
  const sentToHost: P2PMessage[] = [];
  const broadcasts: P2PMessage[] = [];

  const manager = {
    getClientId: () => opts.clientId,
    getIsHost: () => opts.isHost,
    onP2PMessage: (callback: P2PCallback) => {
      p2pCallbacks.push(callback);
    },
    sendToGuest: (guestId: string, message: P2PMessage) => {
      sentToGuest.push({ guestId, message });
    },
    sendToHost: (message: P2PMessage) => {
      sentToHost.push(message);
    },
    broadcastToAll: (message: P2PMessage) => {
      broadcasts.push(message);
    },
    broadcastToOthers: (_senderId: string, message: P2PMessage) => {
      broadcasts.push(message);
    },
  };

  return {
    manager: manager as unknown as CollaborationManager,
    p2pCallbacks,
    sentToGuest,
    sentToHost,
    broadcasts,
  };
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

console.log('Sync module verification tests\n');
console.log('='.repeat(60));

test('SyncManager: applyProjectState migrates legacy timing without echoing changes', () => {
  const mock = createMockCollaborationManager({ clientId: 'guest-1', isHost: false });
  const manager = new SyncManager(mock.manager);

  manager.applyProjectState({
    version: 1,
    bpm: 90,
    timeSignature: [3, 4],
    tracks: [createTrack('legacy-track', 'Legacy Track')],
    midiParts: [],
    masterVolume: 0.9,
    masterPan: -0.1,
    masterEffects: [],
  });

  const project = getProject();

  assert.equal(project.version, 2);
  assert.equal(project.tracks[0].id, 'legacy-track');
  assert.equal(project.timing?.ppqn, 480);
  assert.deepEqual(project.timing?.timeSigMap[0], { tick: 0, num: 3, den: 4 });
  assert.equal(project.timing?.tempoMap[0].mpqn, Math.round(60000000 / 90));
  assert.equal(mock.sentToHost.length, 0);
});

test('SyncManager: onGuestConnected sends JSON-safe initial project state', () => {
  const project = createTestProject() as Project & {
    self?: unknown;
    transient?: () => string;
    nested?: { value: string; callback?: () => string };
  };

  project.self = project;
  project.transient = () => 'ignored';
  project.nested = {
    value: 'kept',
    callback: () => 'ignored',
  };

  setProject(project, true);

  const mock = createMockCollaborationManager({ clientId: 'host-1', isHost: true });
  const manager = new SyncManager(mock.manager);

  manager.onGuestConnected('guest-1');

  assert.equal(mock.sentToGuest.length, 1);
  assert.equal(mock.sentToGuest[0].guestId, 'guest-1');

  const message = mock.sentToGuest[0].message;
  const projectState = message.data?.projectState as Record<string, unknown>;

  assert.equal(message.type, 'initial-state');
  assert.equal('self' in projectState, false);
  assert.equal('transient' in projectState, false);
  assert.deepEqual(projectState.nested, { value: 'kept' });
  assert.doesNotThrow(() => JSON.stringify(projectState));
  assert.notEqual(projectState, project);
  assert.deepEqual(projectState.tracks, project.tracks);
});

console.log('\n' + '='.repeat(60));
console.log(`Tests: ${testCount}, Passed: ${passCount}, Failed: ${failCount}`);

if (failCount > 0) {
  process.exitCode = 1;
}
