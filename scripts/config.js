const os = require('os');
const path = require('path');
const fs = require('fs');

const HOME_DIR = os.homedir();
const CACHE_DIR = path.join(HOME_DIR, '.cache', 'voiceprompt');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT_DIR, 'bin');
const MODELS_DIR = path.join(ROOT_DIR, 'models');

const CONFIG = {
  paths: {
    root: ROOT_DIR,
    bin: BIN_DIR,
    models: MODELS_DIR,
    cache: CACHE_DIR,
    audioFile: path.join(CACHE_DIR, 'recording.wav'),
    pidFile: path.join(CACHE_DIR, 'record.pid'),
    lockFile: path.join(CACHE_DIR, 'start.lock'),
    resultFile: path.join(CACHE_DIR, 'result.txt'),
    logFile: path.join(CACHE_DIR, 'whisper.log')
  },
  whisper: {
    modelName: 'ggml-base.en.bin',
    modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    threads: 4,
    language: 'en'
  },
  ollama: {
    host: 'http://127.0.0.1:11434',
    model: 's1-mini',
    s1MiniGgufUrl: 'https://huggingface.co/superwhisper/s1-mini-GGUF/resolve/main/s1-mini-q4_k_m.gguf',
    s1MiniGgufName: 's1-mini-q4_k_m.gguf'
  }
};

module.exports = CONFIG;
