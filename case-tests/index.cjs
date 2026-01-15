#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const suites = [
  {
    id: 1,
    name: 'Tracklist',
    script: path.join(__dirname, '..', 'scripts', 'tracklist-tests', 'index.cjs'),
  },
  {
    id: 2,
    name: 'EventDisplay',
    script: path.join(__dirname, '..', 'scripts', 'eventdisplay-tests', 'index.cjs'),
  },
  {
    id: 3,
    name: 'Shortcuts',
    script: path.join(__dirname, '..', 'scripts', 'shortcuts-tests', 'index.cjs'),
  },
  {
    id: 4,
    name: 'Toolbar',
    script: path.join(__dirname, '..', 'scripts', 'toolbar-tests', 'index.cjs'),
  },
  {
    id: 5,
    name: 'Mixer',
    script: path.join(__dirname, '..', 'scripts', 'mixer-tests', 'index.cjs'),
  },
  {
    id: 6,
    name: 'Inspector',
    script: path.join(__dirname, '..', 'scripts', 'inspector-tests', 'index.cjs'),
  },
  {
    id: 7,
    name: 'Ruler',
    script: path.join(__dirname, '..', 'scripts', 'ruler-tests', 'index.cjs'),
  },
  {
    id: 8,
    name: 'MidiEditor',
    script: path.join(__dirname, '..', 'scripts', 'midieditor-tests', 'index.cjs'),
  },
];

const args = process.argv.slice(2);
const runAll = args.includes('--all');
const listOnly = args.includes('--list');
const forwardedArgs = args.filter((arg) => arg !== '--all' && arg !== '--list');

const printMenu = () => {
  console.log('Case Test Index');
  suites.forEach((suite) => {
    console.log(`${suite.id}. ${suite.name}`);
  });
  console.log('A. Run all');
  console.log('Q. Quit');
};

const runSuite = (suite) => {
  const result = spawnSync(process.execPath, [suite.script, ...forwardedArgs], {
    stdio: 'inherit',
  });
  return typeof result.status === 'number' ? result.status : 1;
};

const runAllSuites = () => {
  let failed = 0;
  suites.forEach((suite) => {
    const status = runSuite(suite);
    if (status !== 0) {
      failed += 1;
    }
  });
  process.exit(failed > 0 ? 1 : 0);
};

if (listOnly) {
  printMenu();
  process.exit(0);
}

if (runAll) {
  runAllSuites();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

printMenu();
rl.question('Select suite number (or A for all): ', (answer) => {
  const normalized = (answer || '').trim().toLowerCase();
  if (normalized === 'a') {
    rl.close();
    runAllSuites();
    return;
  }
  if (normalized === 'q') {
    rl.close();
    process.exit(0);
  }
  const selection = Number.parseInt(normalized, 10);
  const suite = suites.find((item) => item.id === selection);
  if (!suite) {
    console.log('Invalid selection.');
    rl.close();
    process.exit(1);
  }
  rl.close();
  const status = runSuite(suite);
  process.exit(status);
});
