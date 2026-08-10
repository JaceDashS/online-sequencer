#!/usr/bin/env tsx
/**
 * Sync module verification tests.
 *
 * Covered modules:
 * - SyncManager: initial project state serialization and deserialization
 */

import assert from 'node:assert/strict';

import { SyncManager } from '../../src/core/sync/SyncManager';
import { CollaborationManager } from '../../src/core/sync/CollaborationManager';
import { WebRTCManager } from '../../src/core/sync/WebRTCManager';
import type { ChangeMessage, P2PMessage, RemoteChange } from '../../src/core/sync/types/p2p';
import { getProject, setProject } from '../../src/store/projectState';
import { updateMasterVolume } from '../../src/store/projectActions';
import {
  notifyMidiNoteChange,
  notifyMidiPartChange,
  notifyProjectChange,
  notifyTrackChange,
} from '../../src/store/projectEvents';
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
      return () => {
        const index = p2pCallbacks.indexOf(callback);
        if (index !== -1) {
          p2pCallbacks.splice(index, 1);
        }
      };
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
  const localProject = createTestProject();
  localProject.masterVolume = 0.4;
  setProject(localProject, true);

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
  assert.equal(project.masterVolume, 0.4);
  assert.equal(mock.sentToHost.length, 0);

  manager.disconnect();
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
  assert.ok(message.id.length > 0);
  assert.equal('self' in projectState, false);
  assert.equal('transient' in projectState, false);
  assert.equal('masterVolume' in projectState, false);
  assert.deepEqual(projectState.nested, { value: 'kept' });
  assert.doesNotThrow(() => JSON.stringify(projectState));
  assert.notEqual(projectState, project);
  assert.deepEqual(projectState.tracks, project.tracks);

  manager.disconnect();
});

test('SyncManager: distinct message IDs survive timestamp collisions', () => {
  setProject(createTestProject(), true);

  const mock = createMockCollaborationManager({ clientId: 'host-1', isHost: true });
  const manager = new SyncManager(mock.manager);
  const receivedChanges: RemoteChange[] = [];
  const timestamp = 1000;

  manager.onGuestChange('guest-1', (change) => receivedChanges.push(change));

  const createBpmMessage = (id: string, bpm: number): ChangeMessage => ({
    id,
    type: 'change',
    from: 'guest-1',
    timestamp,
    data: {
      change: {
        type: 'bpm',
        value: bpm,
        timestamp,
        clientId: 'guest-1',
      },
    },
  });

  mock.p2pCallbacks[0](createBpmMessage('message-1', 121));
  mock.p2pCallbacks[0](createBpmMessage('message-2', 122));
  mock.p2pCallbacks[0](createBpmMessage('message-1', 123));

  assert.deepEqual(receivedChanges.map((change) => change.value), [121, 122]);
  assert.deepEqual(mock.broadcasts.map((message) => message.id), ['message-1', 'message-2']);

  manager.disconnect();
});

test('SyncManager: disconnect releases P2P and store subscriptions', () => {
  const mock = createMockCollaborationManager({ clientId: 'guest-1', isHost: false });
  const manager = new SyncManager(mock.manager);
  const lifecycleState = manager as unknown as {
    pendingLocalChangeTimers: Map<string, ReturnType<typeof setTimeout>>;
  };

  assert.equal(mock.p2pCallbacks.length, 1);

  notifyProjectChange({ type: 'bpm', bpm: 121 });
  assert.equal(mock.sentToHost.length, 1);
  assert.equal(lifecycleState.pendingLocalChangeTimers.size, 1);

  manager.disconnect();

  assert.equal(mock.p2pCallbacks.length, 0);
  assert.equal(lifecycleState.pendingLocalChangeTimers.size, 0);

  const sentCountAfterDisconnect = mock.sentToHost.length;
  notifyProjectChange({ type: 'bpm', bpm: 122 });
  notifyTrackChange('track-1', { volume: 0.5 }, 'update');
  notifyMidiPartChange({ type: 'move', partId: 'part-1', newStartTick: 240 });
  notifyMidiNoteChange({
    type: 'update',
    partId: 'part-1',
    noteIndex: 0,
    changes: { velocity: 90 },
  });

  assert.equal(mock.sentToHost.length, sentCountAfterDisconnect);
  assert.doesNotThrow(() => manager.disconnect());
});

test('SyncManager: master volume changes remain local', () => {
  setProject(createTestProject(), true);

  const mock = createMockCollaborationManager({ clientId: 'guest-1', isHost: false });
  const manager = new SyncManager(mock.manager);

  updateMasterVolume(0.5);

  assert.equal(getProject().masterVolume, 0.5);
  assert.equal(mock.sentToHost.length, 0);

  manager.disconnect();
});

test('CollaborationManager: disconnect disposes the active SyncManager', () => {
  let syncDisconnectCount = 0;
  let webRTCDisconnectCount = 0;
  let signalingDisconnectCount = 0;

  const manager = Object.create(CollaborationManager.prototype) as CollaborationManager;
  const managerState = manager as unknown as Record<string, unknown>;
  Object.assign(managerState, {
    isHost: false,
    roomCode: null,
    syncManager: {
      disconnect: () => {
        syncDisconnectCount += 1;
      },
    },
    webRTCManager: {
      disconnect: () => {
        webRTCDisconnectCount += 1;
      },
    },
    signalingClient: {
      disconnect: () => {
        signalingDisconnectCount += 1;
      },
    },
    p2pMessageCallbacks: [],
    connectionStateCallbacks: [],
    seenP2PMessageIds: new Set<string>(),
    p2pReconnectTimers: new Map<string, number>(),
    p2pReconnectAttempts: new Map<string, number>(),
  });

  manager.disconnect();

  assert.equal(syncDisconnectCount, 1);
  assert.equal(webRTCDisconnectCount, 1);
  assert.equal(signalingDisconnectCount, 1);
  assert.equal(managerState.syncManager, null);
});

test('CollaborationManager: distinct message IDs survive timestamp collisions', () => {
  const receivedMessages: P2PMessage[] = [];
  const manager = Object.create(CollaborationManager.prototype) as CollaborationManager;
  const managerState = manager as unknown as Record<string, unknown>;
  Object.assign(managerState, {
    seenP2PMessageIds: new Set<string>(),
    p2pMessageCallbacks: [(message: P2PMessage) => receivedMessages.push(message)],
  });

  const dispatchP2PMessage = (
    manager as unknown as { dispatchP2PMessage: (message: P2PMessage) => void }
  ).dispatchP2PMessage.bind(manager);
  const baseMessage = {
    type: 'change' as const,
    from: 'guest-1',
    timestamp: 1000,
  };

  dispatchP2PMessage({ ...baseMessage, id: 'message-1' });
  dispatchP2PMessage({ ...baseMessage, id: 'message-2' });
  dispatchP2PMessage({ ...baseMessage, id: 'message-1' });

  assert.deepEqual(receivedMessages.map((message) => message.id), ['message-1', 'message-2']);
});

test('WebRTCManager: dispatches each data-channel message once for both roles', () => {
  const message: P2PMessage = {
    id: 'message-1',
    type: 'change',
    from: 'peer-1',
    timestamp: 1000,
  };

  for (const isHost of [false, true]) {
    const manager = new WebRTCManager(isHost ? 'host-1' : 'guest-1', isHost, { iceServers: [] });
    const receivedMessages: P2PMessage[] = [];
    const dataChannel = {} as RTCDataChannel;
    const setupDataChannel = (
      manager as unknown as {
        setupDataChannel: (channel: RTCDataChannel, peerId: string) => void;
      }
    ).setupDataChannel.bind(manager);

    manager.onMessage((receivedMessage) => receivedMessages.push(receivedMessage));
    setupDataChannel(dataChannel, 'peer-1');

    const handleMessage = (
      dataChannel as unknown as {
        onmessage: ((event: { data: string }) => void) | null;
      }
    ).onmessage;
    assert.ok(handleMessage);
    handleMessage({ data: JSON.stringify(message) });

    assert.deepEqual(receivedMessages, [message]);
    manager.disconnect();
  }
});

console.log('\n' + '='.repeat(60));
console.log(`Tests: ${testCount}, Passed: ${passCount}, Failed: ${failCount}`);

if (failCount > 0) {
  process.exitCode = 1;
}
