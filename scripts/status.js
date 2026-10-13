#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const CONFIG = require('./config');
const { resolveWhisperCli } = require('./setup');
const { checkCommand } = require('./download');

async function checkStatus() {
  console.log('=== My-Whisperer Status ===');
  console.log(`OS: ${process.platform} (${process.arch})`);

  // Whisper CLI
  const whisperCli = resolveWhisperCli();
  console.log(`whisper-cli: ${whisperCli ? `FOUND (${whisperCli})` : 'NOT FOUND'}`);

  // Whisper Model
  const modelPath = `${CONFIG.paths.models}/${CONFIG.whisper.modelName}`;
  const modelExists = fs.existsSync(modelPath);
  console.log(`Whisper Model (${CONFIG.whisper.modelName}): ${modelExists ? 'READY' : 'NOT FOUND'}`);

  // Ollama
  http.get(`${CONFIG.ollama.host}/api/tags`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const models = (parsed.models || []).map(m => m.name);
        const hasS1 = models.some(m => m.startsWith('s1-mini'));
        console.log(`Ollama Server: RUNNING`);
        console.log(`s1-mini Model: ${hasS1 ? 'READY' : 'NOT CONFIGURED'}`);
      } catch (_) {
        console.log('Ollama Server: RUNNING (Unknown models)');
      }
      checkRecorders();
    });
  }).on('error', () => {
    console.log(`Ollama Server: NOT RUNNING on ${CONFIG.ollama.host}`);
    checkRecorders();
  });
}

function checkRecorders() {
  const recorders = ['ffmpeg', 'sox', 'rec', 'pw-record', 'parec', 'arecord'];
  const available = recorders.filter(checkCommand);
  console.log(`Audio Recorders: ${available.length ? available.join(', ') : 'NONE DETECTED'}`);
}

checkStatus();
