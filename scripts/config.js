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

const ENGINE_FILE = path.join(CACHE_DIR, 'engine');

function getActiveEngine() {
  if (process.env.STT_ENGINE) {
    return process.env.STT_ENGINE.toLowerCase().trim();
  }
  if (fs.existsSync(ENGINE_FILE)) {
    try {
      const val = fs.readFileSync(ENGINE_FILE, 'utf8').toLowerCase().trim();
      if (val === 'whisper' || val === 'cactus') {
        return val;
      }
    } catch (_) {}
  }
  return 'cactus';
}

function setActiveEngine(engine) {
  const norm = engine.toLowerCase().trim();
  if (norm !== 'whisper' && norm !== 'cactus') {
    throw new Error(`Invalid engine: ${engine}. Must be 'whisper' or 'cactus'`);
  }
  fs.writeFileSync(ENGINE_FILE, norm, 'utf8');
  return norm;
}

const CONFIG = {
  paths: {
    root: ROOT_DIR,
    bin: BIN_DIR,
    models: MODELS_DIR,
    cache: CACHE_DIR,
    engineFile: ENGINE_FILE,
    audioFile: path.join(CACHE_DIR, 'recording.wav'),
    pidFile: path.join(CACHE_DIR, 'record.pid'),
    lockFile: path.join(CACHE_DIR, 'start.lock'),
    resultFile: path.join(CACHE_DIR, 'result.txt'),
    logFile: path.join(CACHE_DIR, 'whisper.log')
  },
  getActiveEngine,
  setActiveEngine,
  get engine() {
    return getActiveEngine();
  },
  cactus: {
    modelName: 'whistle.cact',
    modelUrl: 'https://huggingface.co/Cactus-Compute/whistle/resolve/main/whistle.cact',
    language: 'en'
  },
  whisper: {
    modelName: 'ggml-base.en.bin',
    modelUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    threads: 4,
    language: 'en'
  }
};

module.exports = CONFIG;
