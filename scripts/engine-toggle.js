#!/usr/bin/env node
const CONFIG = require('./config');
const { notify } = require('./utils');

const current = CONFIG.getActiveEngine();
const next = current === 'cactus' ? 'whisper' : 'cactus';

CONFIG.setActiveEngine(next);

const label = next === 'cactus' ? 'Cactus Whistle (whistle.cact)' : 'Whisper (ggml-base.en.bin)';
console.log(`[engine] Switched STT engine: ${current} -> ${next} (${label})`);
notify('Voice Engine Switched', `Active: ${label}`, 2000);
