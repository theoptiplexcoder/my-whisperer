const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const CONFIG = require('./config');
const { notify, copyToClipboard } = require('./utils');
const { checkCommand } = require('./download');
const { resolveWhisperCli } = require('./setup');
const { normalizeText } = require('./normalize');

function spawnRecorder(outputWav) {
  const platform = process.platform;

  // 1. Linux PipeWire / Pulse / ALSA / FFmpeg
  if (platform === 'linux') {
    if (checkCommand('pw-record')) {
      return spawn('pw-record', ['--rate', '16000', '--channels', '1', '--format', 's16', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
    if (checkCommand('ffmpeg')) {
      // Use default audio input
      return spawn('ffmpeg', ['-y', '-f', 'pulse', '-i', 'default', '-ar', '16000', '-ac', '1', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
    if (checkCommand('arecord')) {
      return spawn('arecord', ['-r', '16000', '-c', '1', '-f', 'S16_LE', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
    if (checkCommand('sox') || checkCommand('rec')) {
      const cmd = checkCommand('rec') ? 'rec' : 'sox';
      return spawn(cmd, ['-d', '-r', '16000', '-c', '1', '-b', '16', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
  }

  // 2. macOS (avfoundation via ffmpeg or sox)
  if (platform === 'darwin') {
    if (checkCommand('sox') || checkCommand('rec')) {
      const cmd = checkCommand('rec') ? 'rec' : 'sox';
      return spawn(cmd, ['-d', '-r', '16000', '-c', '1', '-b', '16', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
    if (checkCommand('ffmpeg')) {
      return spawn('ffmpeg', ['-y', '-f', 'avfoundation', '-i', ':default', '-ar', '16000', '-ac', '1', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
  }

  // 3. Windows (dshow via ffmpeg, or sox, or PowerShell WASAPI)
  if (platform === 'win32') {
    if (checkCommand('ffmpeg')) {
      // Find audio device or use default directshow virtual device
      return spawn('ffmpeg', ['-y', '-f', 'dshow', '-i', 'audio=default', '-ar', '16000', '-ac', '1', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
    if (checkCommand('sox') || checkCommand('rec')) {
      const cmd = checkCommand('rec') ? 'rec' : 'sox';
      return spawn(cmd, ['-d', '-r', '16000', '-c', '1', '-b', '16', outputWav], {
        detached: true,
        stdio: 'ignore'
      });
    }
  }

  // Generic fallback if ffmpeg is available
  if (checkCommand('ffmpeg')) {
    return spawn('ffmpeg', ['-y', '-ar', '16000', '-ac', '1', outputWav], {
      detached: true,
      stdio: 'ignore'
    });
  }

  throw new Error(`No compatible audio recorder found on ${platform}. Please install ffmpeg or sox.`);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function stopProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGINT');
      const start = Date.now();
      while (isProcessRunning(pid) && Date.now() - start < 1000) {
        // short wait
      }
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch (_) {}
}

async function startRecording() {
  const { audioFile, pidFile } = CONFIG.paths;

  // Check if already running
  if (fs.existsSync(pidFile)) {
    const existingPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (!isNaN(existingPid) && isProcessRunning(existingPid)) {
      console.log(`[record] Recording is already active (PID: ${existingPid})`);
      return;
    }
    try { fs.unlinkSync(pidFile); } catch (_) {}
  }

  if (fs.existsSync(audioFile)) {
    try { fs.unlinkSync(audioFile); } catch (_) {}
  }

  notify('Voice Input', 'Recording...', 1000);
  console.log('[record] Starting recording...');

  const child = spawnRecorder(audioFile);
  fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  child.unref();

  console.log(`[record] Recording started with PID ${child.pid}`);
}

async function stopRecording() {
  const { audioFile, pidFile, resultFile, logFile, models } = CONFIG.paths;

  if (!fs.existsSync(pidFile)) {
    console.log('[record] No active recording PID found.');
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  try { fs.unlinkSync(pidFile); } catch (_) {}

  if (!isNaN(pid)) {
    console.log(`[record] Stopping recording process ${pid}...`);
    stopProcess(pid);
  }

  // Small delay to ensure file stream is flushed
  await new Promise(r => setTimeout(r, 200));

  if (!fs.existsSync(audioFile)) {
    notify('Voice Input', 'No audio recorded', 1500);
    console.log('[record] Audio file not found.');
    return;
  }

  const stats = fs.statSync(audioFile);
  // Standard WAV header is 44 bytes
  if (stats.size <= 44) {
    notify('Voice Input', 'No audio recorded', 1500);
    console.log('[record] Audio file is empty (<= 44 bytes).');
    return;
  }

  notify('Voice Input', 'Transcribing...', 1200);
  console.log('[record] Transcribing with whisper-cli...');

  const whisperCli = resolveWhisperCli();
  if (!whisperCli) {
    notify('Voice Input', 'whisper-cli not found. Run npm run setup', 2500);
    console.error('[record] Error: whisper-cli not found.');
    return;
  }

  let modelPath = path.join(models, CONFIG.whisper.modelName);
  if (!fs.existsSync(modelPath)) {
    // Check local fallback
    const fallback = '/home/ybl/git/whisper.cpp/models/ggml-base.en.bin';
    if (fs.existsSync(fallback)) {
      modelPath = fallback;
    } else {
      notify('Voice Input', 'Whisper model not found. Run npm run setup', 2500);
      console.error('[record] Error: Whisper model not found at', modelPath);
      return;
    }
  }

  if (fs.existsSync(resultFile)) {
    try { fs.unlinkSync(resultFile); } catch (_) {}
  }

  const resultPrefix = path.join(CONFIG.paths.cache, 'result');
  const whisperArgs = [
    '-m', modelPath,
    '-f', audioFile,
    '-l', CONFIG.whisper.language,
    '-ng',
    '-t', String(CONFIG.whisper.threads),
    '-bs', '1',
    '-bo', '1',
    '-nt',
    '-np',
    '-of', resultPrefix,
    '-otxt'
  ];

  try {
    const logStream = fs.openSync(logFile, 'w');
    execSync(`"${whisperCli}" ${whisperArgs.map(a => `"${a}"`).join(' ')}`, {
      stdio: ['ignore', logStream, logStream]
    });
    fs.closeSync(logStream);
  } catch (err) {
    notify('Voice Input', 'Transcription failed', 2000);
    console.error('[record] Transcription failed:', err.message);
    return;
  }

  if (!fs.existsSync(resultFile)) {
    notify('Voice Input', 'Transcription failed', 2000);
    console.error('[record] Result file not generated.');
    return;
  }

  let rawTranscript = fs.readFileSync(resultFile, 'utf8').trim();
  if (!rawTranscript) {
    notify('Voice Input', 'No speech detected', 1500);
    console.log('[record] No speech detected.');
    return;
  }

  console.log(`[record] Raw transcription: "${rawTranscript}"`);
  console.log('[record] Normalizing with s1-mini...');

  const cleanedText = await normalizeText(rawTranscript);
  console.log(`[record] Cleaned text: "${cleanedText}"`);

  if (!cleanedText) {
    notify('Voice Input', 'No speech detected', 1500);
    return;
  }

  fs.writeFileSync(resultFile, cleanedText, 'utf8');

  copyToClipboard(cleanedText);
  notify('Voice Input', cleanedText, 2500);
  console.log('[record] Copied to clipboard and notified!');
}

async function toggleRecording() {
  const { pidFile } = CONFIG.paths;
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (!isNaN(pid) && isProcessRunning(pid)) {
      await stopRecording();
      return;
    }
  }
  await startRecording();
}

const action = process.argv[2];
if (action === 'start') {
  startRecording();
} else if (action === 'stop') {
  stopRecording();
} else if (action === 'toggle') {
  toggleRecording();
}

module.exports = {
  startRecording,
  stopRecording,
  toggleRecording
};
