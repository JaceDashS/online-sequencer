#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const casesPath = path.join(__dirname, '..', '..', 'case-tests', 'midieditor.cases.json');
const raw = fs.readFileSync(casesPath, 'utf8');
const payload = JSON.parse(raw);
const cases = payload.cases || [];
const docPath = payload.document || 'case-tests/midieditor.md';
const docFullPath = path.join(process.cwd(), docPath);
let docLines = null;
if (fs.existsSync(docFullPath)) {
  docLines = fs.readFileSync(docFullPath, 'utf8').split(/\r?\n/);
}

const args = new Set(process.argv.slice(2));
const nonInteractive = args.has('--non-interactive');
const autoPass = args.has('--auto-pass');

const printHeader = () => {
  console.log('MidiEditor Test Runner');
  console.log(`Cases: ${cases.length}`);
  console.log(`Doc: ${docPath}`);
};

const printList = () => {
  printHeader();
  console.log('');
  cases.forEach((testCase) => {
    console.log(`[${testCase.id}] ${testCase.title}`);
  });
};

const getStepsForCase = (caseId) => {
  if (!docLines) return null;
  const headingPrefix = `### ${caseId}`;
  const start = docLines.findIndex((line) => line.trim().startsWith(headingPrefix));
  if (start === -1) return null;
  let end = docLines.length;
  for (let i = start + 1; i < docLines.length; i += 1) {
    if (docLines[i].startsWith('### ')) {
      end = i;
      break;
    }
  }
  const section = docLines.slice(start + 1, end);
  const stepStart = section.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === '절차:' || trimmed === 'Steps:';
  });
  if (stepStart === -1) {
    const fallback = section.filter((line) => line.trim() !== '').join('\n').trim();
    return fallback.length > 0 ? fallback : null;
  }
  let stepEnd = section.length;
  for (let i = stepStart + 1; i < section.length; i += 1) {
    const trimmed = section[i].trim();
    if (trimmed === '기대결과:' || trimmed === 'Expected:') {
      stepEnd = i;
      break;
    }
  }
  const steps = section.slice(stepStart + 1, stepEnd).filter((line) => line.trim() !== '');
  return steps.length > 0 ? steps.join('\n') : null;
};

if (args.has('--list')) {
  printList();
  process.exit(0);
}

if (nonInteractive || autoPass) {
  printList();
  if (autoPass) {
    console.log('');
    console.log('Result: all cases marked as passed (auto-pass).');
  }
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const results = [];
let index = 0;

const summarize = () => {
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  console.log('');
  console.log(`Summary: pass ${pass}, fail ${fail}, skip ${skip}`);
  process.exit(fail > 0 ? 1 : 0);
};

const askNext = () => {
  if (index >= cases.length) {
    summarize();
    return;
  }

  const testCase = cases[index];
  console.log('');
  console.log(`[${testCase.id}] ${testCase.title}`);
  const steps = getStepsForCase(testCase.id);
  if (steps) {
    console.log('Steps:');
    console.log(steps);
  } else {
    console.log(`Doc: ${docPath}`);
  }
  rl.question('Result (p)ass/(f)ail/(s)kip/(q)uit: ', (answer) => {
    const normalized = (answer || '').trim().toLowerCase();
    if (normalized === 'q') {
      summarize();
      return;
    }
    if (normalized === 'p' || normalized === 'f' || normalized === 's') {
      const status = normalized === 'p' ? 'pass' : normalized === 'f' ? 'fail' : 'skip';
      results.push({ id: testCase.id, status });
      index += 1;
      askNext();
      return;
    }
    console.log('Invalid input. Use p, f, s, or q.');
    askNext();
  });
};

printHeader();
askNext();
