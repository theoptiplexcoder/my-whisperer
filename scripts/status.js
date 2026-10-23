#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const CONFIG = require('./config');
const { resolveWhisperCli, resolveNeedleCli } = require('./setup');
const { checkCommand } = require('./download');

async function checkStatus() {
  console.log('=== My-Whisperer Status ===');
  console.log(`OS: ${process.platform} (${process.arch})`);
  console.log(`Active STT Engine: ${CONFIG.engine.toUpperCase()}`);

  // Cactus Whistle (needle)
  const needleCli = resolveNeedleCli();
  console.log(`needle CLI: ${needleCli ? `FOUND (${needleCli})` : 'NOT FOUND'}`);
  const whistleModel = `${CONFIG.paths.models}/${CONFIG.cactus.modelName}`;
  console.log(`Whistle Model (${CONFIG.cactus.modelName}): ${fs.existsSync(whistleModel) ? 'READY' : 'NOT FOUND'}`);

  // Whisper CLI
  const whisperCli = resolveWhisperCli();
  console.log(`whisper-cli: ${whisperCli ? `FOUND (${whisperCli})` : 'NOT FOUND'}`);

  // Whisper Model
  const modelPath = `${CONFIG.paths.models}/${CONFIG.whisper.modelName}`;
  const modelExists = fs.existsSync(modelPath);
  console.log(`Whisper Model (${CONFIG.whisper.modelName}): ${modelExists ? 'READY' : 'NOT FOUND'}`);

  // Audio Recorders
  checkRecorders();
}

function checkRecorders() {
  const recorders = ['ffmpeg', 'sox', 'rec', 'pw-record', 'parec', 'arecord'];
  const available = recorders.filter(checkCommand);
  console.log(`Audio Recorders: ${available.length ? available.join(', ') : 'NONE DETECTED'}`);
}

checkStatus();
