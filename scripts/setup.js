const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const CONFIG = require('./config');
const { downloadFile, checkCommand } = require('./download');

async function isOllamaRunning() {
  return new Promise((resolve) => {
    http.get(`${CONFIG.ollama.host}/api/tags`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function getOllamaModels() {
  return new Promise((resolve) => {
    http.get(`${CONFIG.ollama.host}/api/tags`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.models || []).map(m => m.name.split(':')[0]));
        } catch (_) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

function resolveNeedleCli() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const localBin = path.join(CONFIG.paths.bin, `needle${ext}`);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  if (checkCommand('needle')) {
    return 'needle';
  }
  return null;
}

function resolveWhisperCli() {
  const ext = process.platform === 'win32' ? '.exe' : '';

  // 1. Check local repo bin directory (standalone executable or wrapper script)
  const localBin = path.join(CONFIG.paths.bin, `whisper-cli${ext}`);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 1b. Check extracted release directories in bin
  if (fs.existsSync(CONFIG.paths.bin)) {
    const entries = fs.readdirSync(CONFIG.paths.bin);
    for (const entry of entries) {
      if (entry.startsWith('whisper-bin-')) {
        const subBin = path.join(CONFIG.paths.bin, entry, `whisper-cli${ext}`);
        if (fs.existsSync(subBin)) {
          return subBin;
        }
      }
    }
  }

  // 2. Check system PATH
  if (checkCommand('whisper-cli')) {
    return 'whisper-cli';
  }
  if (checkCommand('whisper')) {
    return 'whisper';
  }

  // 3. Check common local paths
  const possiblePaths = [
    '/home/ybl/git/whisper.cpp/build/bin/whisper-cli',
    path.join(process.env.HOME || '', 'git/whisper.cpp/build/bin/whisper-cli'),
    '/usr/local/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cli'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

async function setupWhisperCli() {
  console.log('\n--- 1. Setting up whisper-cli ---');
  let whisperCli = resolveWhisperCli();
  if (whisperCli) {
    // If resolved from a subdirectory, ensure bin/whisper-cli wrapper exists for convenience
    const ext = process.platform === 'win32' ? '.exe' : '';
    const targetBinPath = path.join(CONFIG.paths.bin, `whisper-cli${ext}`);
    if (whisperCli !== targetBinPath && !fs.existsSync(targetBinPath)) {
      if (process.platform === 'linux') {
        const candDir = path.dirname(whisperCli);
        const script = `#!/bin/sh\nexport LD_LIBRARY_PATH="${candDir}:$LD_LIBRARY_PATH"\nexec "${whisperCli}" "$@"\n`;
        fs.writeFileSync(targetBinPath, script, { mode: 0o755 });
      }
    }
    console.log(`[setup] Found existing whisper-cli at: ${whisperCli}`);
    return whisperCli;
  }

  const platform = process.platform;
  const arch = process.arch;
  const tag = 'v1.9.2'; // Reliable release with binaries
  let downloadUrl = null;
  const ext = platform === 'win32' ? '.exe' : '';
  const targetBinPath = path.join(CONFIG.paths.bin, `whisper-cli${ext}`);

  if (platform === 'linux' && arch === 'x64') {
    downloadUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${tag}/whisper-bin-ubuntu-x64.tar.gz`;
  } else if (platform === 'linux' && arch === 'arm64') {
    downloadUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${tag}/whisper-bin-ubuntu-arm64.tar.gz`;
  } else if (platform === 'win32' && arch === 'x64') {
    downloadUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${tag}/whisper-bin-x64.zip`;
  }

  if (downloadUrl) {
    console.log(`[setup] Downloading prebuilt whisper.cpp binary (${platform} ${arch})...`);
    const archivePath = path.join(CONFIG.paths.bin, `whisper-${tag}-${platform}-${arch}.${platform === 'win32' ? 'zip' : 'tar.gz'}`);
    try {
      await downloadFile(downloadUrl, archivePath);
      console.log('[setup] Extracting binary...');
      if (platform === 'win32') {
        execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${CONFIG.paths.bin}' -Force"`, { stdio: 'inherit' });
      } else {
        execSync(`tar -xzf "${archivePath}" -C "${CONFIG.paths.bin}"`, { stdio: 'inherit' });
      }

      // Check if whisper-cli was extracted
      // In the archive, it may be in a subdirectory (e.g. whisper-bin-ubuntu-x64) or under build/bin
      const candidates = [
        path.join(CONFIG.paths.bin, `whisper-cli${ext}`),
        path.join(CONFIG.paths.bin, `main${ext}`),
        path.join(CONFIG.paths.bin, 'build', 'bin', `whisper-cli${ext}`)
      ];

      // Add subdirectory candidates like whisper-bin-ubuntu-x64
      const entries = fs.readdirSync(CONFIG.paths.bin);
      for (const entry of entries) {
        if (entry.startsWith('whisper-bin-')) {
          candidates.push(path.join(CONFIG.paths.bin, entry, `whisper-cli${ext}`));
        }
      }

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          if (candidate !== targetBinPath) {
            if (platform === 'linux') {
              // Create wrapper script pointing LD_LIBRARY_PATH to the dir of shared libraries
              const candDir = path.dirname(candidate);
              const script = `#!/bin/sh\nexport LD_LIBRARY_PATH="${candDir}:$LD_LIBRARY_PATH"\nexec "${candidate}" "$@"\n`;
              fs.writeFileSync(targetBinPath, script, { mode: 0o755 });
            } else {
              try {
                fs.copyFileSync(candidate, targetBinPath);
              } catch (_) {
                // If copy fails or isn't standalone, keep candidate
                return candidate;
              }
            }
          }
          if (platform !== 'win32') {
            fs.chmodSync(targetBinPath, 0o755);
          }
          console.log(`[setup] whisper-cli installed successfully to ${targetBinPath}`);
          return targetBinPath;
        }
      }
    } catch (err) {
      console.warn(`[setup] Automatic prebuilt download failed: ${err.message}`);
    }
  }

  // Fallback for macOS or systems without prebuilt archives
  if (platform === 'darwin') {
    console.log('\n[setup] On macOS, whisper-cli can be installed via Homebrew:');
    console.log('   brew install whisper-cpp');
    if (checkCommand('brew')) {
      console.log('[setup] Attempting brew install whisper-cpp...');
      try {
        execSync('brew install whisper-cpp', { stdio: 'inherit' });
        return 'whisper-cli';
      } catch (err) {
        console.warn('[setup] brew install failed.');
      }
    }
  }

  console.warn('\n[setup] Warning: whisper-cli not automatically installed.');
  console.warn('Please install whisper.cpp or ensure whisper-cli is in your PATH.');
  return null;
}

async function setupWhisperModel() {
  console.log('\n--- 2. Setting up Whisper GGML Base Model ---');
  const modelPath = path.join(CONFIG.paths.models, CONFIG.whisper.modelName);
  if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 100 * 1024 * 1024) {
    console.log(`[setup] Model ready: ${modelPath}`);
    return modelPath;
  }

  // Check if system whisper.cpp has models
  const commonModelPaths = [
    '/home/ybl/git/whisper.cpp/models/ggml-base.en.bin',
    path.join(process.env.HOME || '', 'git/whisper.cpp/models/ggml-base.en.bin')
  ];
  for (const cmp of commonModelPaths) {
    if (fs.existsSync(cmp)) {
      console.log(`[setup] Linking existing model from ${cmp} -> ${modelPath}`);
      try {
        fs.copyFileSync(cmp, modelPath);
        return modelPath;
      } catch (_) {}
    }
  }

  await downloadFile(CONFIG.whisper.modelUrl, modelPath);
  return modelPath;
}

async function setupCactusModel() {
  console.log('\n--- 3. Setting up Cactus Whistle Model & Needle CLI ---');
  const needleCli = resolveNeedleCli();
  const whistlePath = path.join(CONFIG.paths.models, CONFIG.cactus.modelName);

  if (!needleCli) {
    console.log('[setup] Downloading needle CLI binary for linux-x86_64...');
    const needleDest = path.join(CONFIG.paths.bin, 'needle');
    if (!fs.existsSync(CONFIG.paths.bin)) fs.mkdirSync(CONFIG.paths.bin, { recursive: true });
    try {
      await downloadFile('https://huggingface.co/Cactus-Compute/needle3/resolve/main/linux-x86_64/needle', needleDest);
      fs.chmodSync(needleDest, 0o755);
      console.log(`[setup] Installed needle to ${needleDest}`);
    } catch (err) {
      console.warn(`[setup] Could not download needle binary: ${err.message}`);
    }
  } else {
    console.log(`[setup] Found existing needle CLI at: ${needleCli}`);
  }

  if (fs.existsSync(whistlePath) && fs.statSync(whistlePath).size > 10 * 1024 * 1024) {
    console.log(`[setup] Cactus Whistle model ready: ${whistlePath}`);
    return whistlePath;
  }

  console.log(`[setup] Downloading Cactus Whistle model (${CONFIG.cactus.modelName})...`);
  await downloadFile(CONFIG.cactus.modelUrl, whistlePath);
  return whistlePath;
}

async function setupAudioRecorder() {
  console.log('\n--- 4. Checking Audio Recording Capability ---');
  const platform = process.platform;
  const recorders = ['ffmpeg', 'sox', 'rec', 'pw-record', 'parec', 'arecord'];
  const found = recorders.filter(checkCommand);

  console.log(`[setup] OS: ${platform}`);
  if (found.length > 0) {
    console.log(`[setup] Detected audio tools: ${found.join(', ')}`);
  } else {
    console.warn('[setup] No standard audio recording CLI detected.');
    if (platform === 'win32') {
      console.log('[setup] Note: Windows can install ffmpeg via `winget install Gyan.FFmpeg` or `choco install ffmpeg`.');
    } else if (platform === 'darwin') {
      console.log('[setup] Note: macOS can install ffmpeg via `brew install ffmpeg` or sox via `brew install sox`.');
    } else {
      console.log('[setup] Note: Linux can install ffmpeg or pipewire via `sudo apt install ffmpeg` or `sudo pacman -S ffmpeg`.');
    }
  }
}

async function run() {
  console.log('==================================================');
  console.log('   My-Whisperer: Cross-Platform Setup Wizard');
  console.log('==================================================');
  console.log(`Platform: ${process.platform} (${process.arch})`);

  try {
    await setupWhisperCli();
    await setupWhisperModel();
    await setupCactusModel();
    await setupAudioRecorder();

    console.log('\n==================================================');
    console.log('   Setup Finished!');
    console.log('   Commands:');
    console.log('     npm run toggle       # Toggle voice recording on/off');
    console.log('     npm run record:start # Start recording');
    console.log('     npm run record:stop  # Stop, transcribe, and copy');
    console.log('==================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n[setup] Error during setup:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, resolveWhisperCli, resolveNeedleCli };
