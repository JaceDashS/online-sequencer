#!/usr/bin/env tsx
/**
 * Phase 5: History regression tests
 *
 * 목표:
 * - split/merge undo/redo 시퀀스 회귀 방지
 * - historyIndex 기반 노트 복원(파트 add/remove undo/redo) 회귀 방지
 *
 * 실행:
 * - npx tsx scripts/history-tests/index.ts
 */

import assert from 'node:assert/strict';

import type { MidiNote, MidiPart, Project, Track } from '../../src/types/project';
import { createSimpleTiming } from '../../src/utils/midiTickUtils';

import {
  setProject,
  getProject,
  addMidiPart,
  findMidiPart,
  addNoteToMidiPart,
  undoMidiPartLevel,
  redoMidiPartLevel,
  splitMidiPart,
  mergeMidiParts,
} from '../../src/store/projectStore';

import { resetAllHistoriesForTests } from '../../src/store/history/history';

type TestFn = () => void;

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name: string, fn: TestFn) {
  testCount += 1;
  try {
    fn();
    passCount += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
  }
}

function makeBaseProject(): Project {
  const track: Track = {
    id: 'track-1',
    name: 'Track 1',
    instrument: 'piano',
    volume: 1,
    pan: 0,
    effects: [],
    solo: false,
    mute: false,
    mutedBySolo: false,
  };

  return {
    version: 2,
    timing: createSimpleTiming(120, [4, 4]),
    tracks: [track],
    midiParts: [],
    masterVolume: 1,
    masterPan: 0,
    masterEffects: [],
  };
}

function resetState() {
  resetAllHistoriesForTests();
  setProject(makeBaseProject(), true);
}

console.log('History tests (Phase 5)\n');
console.log('='.repeat(60));

test('historyIndex restore: add empty part -> add note -> undo addPart -> redo addPart keeps notes', () => {
  resetState();

  const part: MidiPart = {
    id: 'part-1',
    trackId: 'track-1',
    startTick: 0,
    durationTicks: 480 * 4,
    notes: [],
  };
  addMidiPart(part, false);

  const note: MidiNote = { note: 60, velocity: 100, startTick: 0, durationTicks: 240 };
  addNoteToMidiPart('part-1', note, false);

  // Undo part-level addPart => part removed
  undoMidiPartLevel();
  assert.equal(findMidiPart('part-1'), undefined);

  // Redo => part re-added, notes restored from noteHistory via historyIndex
  redoMidiPartLevel();
  const restored = findMidiPart('part-1');
  assert.ok(restored, 'Expected part to be restored');
  assert.equal(restored.notes.length, 1);
  assert.equal(restored.notes[0].note, 60);
  assert.equal(restored.notes[0].startTick, 0);
});

test('splitPart undo/redo keeps original notes', () => {
  resetState();

  const part: MidiPart = {
    id: 'part-split',
    trackId: 'track-1',
    startTick: 0,
    durationTicks: 480 * 4,
    notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 480 * 2 }],
  };
  addMidiPart(part, true); // skipHistory: avoid addPart interfering
  // record split history itself is handled inside splitMidiPart

  const result = splitMidiPart('part-split', 0.5);
  assert.ok(result, 'Expected splitMidiPart to succeed');
  const { firstPartId, secondPartId } = result!;

  assert.equal(findMidiPart('part-split'), undefined, 'Original part should be removed');
  assert.ok(findMidiPart(firstPartId), 'First split part should exist');
  assert.ok(findMidiPart(secondPartId), 'Second split part should exist');

  undoMidiPartLevel();
  const restoredOriginal = findMidiPart('part-split');
  assert.ok(restoredOriginal, 'Original part should be restored after undo');
  assert.equal(findMidiPart(firstPartId), undefined);
  assert.equal(findMidiPart(secondPartId), undefined);
  assert.equal(restoredOriginal.notes.length, 1);

  redoMidiPartLevel();
  assert.equal(findMidiPart('part-split'), undefined);
  assert.ok(findMidiPart(firstPartId));
  assert.ok(findMidiPart(secondPartId));
});

test('mergeParts undo/redo restores originals and keeps notes', () => {
  resetState();

  const partA: MidiPart = {
    id: 'part-a',
    trackId: 'track-1',
    startTick: 0,
    durationTicks: 480 * 2,
    notes: [{ note: 60, velocity: 100, startTick: 0, durationTicks: 240 }],
  };
  const partB: MidiPart = {
    id: 'part-b',
    trackId: 'track-1',
    startTick: 480 * 2,
    durationTicks: 480 * 2,
    notes: [{ note: 64, velocity: 100, startTick: 0, durationTicks: 240 }],
  };

  addMidiPart(partA, true);
  addMidiPart(partB, true);

  const mergeResult = mergeMidiParts(['part-a', 'part-b']);
  assert.ok(mergeResult, 'Expected mergeMidiParts to succeed');
  const mergedPartId = mergeResult!.mergedPartId;

  assert.equal(findMidiPart('part-a'), undefined);
  assert.equal(findMidiPart('part-b'), undefined);
  const merged = findMidiPart(mergedPartId);
  assert.ok(merged);
  assert.equal(merged.notes.length, 2, 'Merged part should contain both notes');

  undoMidiPartLevel();
  const restoredA = findMidiPart('part-a');
  const restoredB = findMidiPart('part-b');
  assert.ok(restoredA);
  assert.ok(restoredB);
  assert.equal(findMidiPart(mergedPartId), undefined);
  assert.equal(restoredA.notes.length, 1);
  assert.equal(restoredB.notes.length, 1);

  redoMidiPartLevel();
  assert.equal(findMidiPart('part-a'), undefined);
  assert.equal(findMidiPart('part-b'), undefined);
  assert.ok(findMidiPart(mergedPartId));
});

console.log('\n' + '='.repeat(60));
console.log(`\nResult: ${passCount}/${testCount} passed`);
if (failCount > 0) process.exit(1);


