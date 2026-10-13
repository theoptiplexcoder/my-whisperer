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

function resolveWhisperCli() {
  // 1. Check local repo bin directory
  const ext = process.platform === 'win32' ? '.exe' : '';
  const localBin = path.join(CONFIG.paths.bin, `whisper-cli${ext}`);
  if (fs.existsSync(localBin)) {
    return localBin;
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
      // In the archive, it may be named main or whisper-cli or under build/bin
      const candidates = [
        path.join(CONFIG.paths.bin, `whisper-cli${ext}`),
        path.join(CONFIG.paths.bin, `main${ext}`),
        path.join(CONFIG.paths.bin, 'build', 'bin', `whisper-cli${ext}`)
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          if (candidate !== targetBinPath) {
            fs.copyFileSync(candidate, targetBinPath);
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

async function setupOllamaAndS1Mini() {
  console.log('\n--- 3. Setting up Ollama & s1-mini model ---');
  const running = await isOllamaRunning();
  if (!running) {
    console.warn('[setup] Warning: Ollama does not seem to be running on 127.0.0.1:11434.');
    console.warn('Please make sure Ollama is installed and started (`ollama serve`).');
    if (!checkCommand('ollama')) {
      console.warn('Install Ollama from https://ollama.com');
    }
    return;
  }

  console.log('[setup] Ollama server is running.');
  const models = await getOllamaModels();
  if (models.includes(CONFIG.ollama.model)) {
    console.log(`[setup] Model "${CONFIG.ollama.model}" is already configured in Ollama!`);
    return;
  }

  console.log(`[setup] Model "${CONFIG.ollama.model}" not found in Ollama. Preparing s1-mini...`);

  // Download GGUF if not present
  const ggufPath = path.join(CONFIG.paths.models, CONFIG.ollama.s1MiniGgufName);
  await downloadFile(CONFIG.ollama.s1MiniGgufUrl, ggufPath);

  // Generate Modelfile pointing directly to local GGUF
  const modelfileContent = `FROM ${ggufPath.replace(/\\/g, '/')}

TEMPLATE """{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end -}}
{{- range .Messages -}}
{{- if eq .Role "system" }}<|im_start|>system
{{ .Content }}<|im_end|>
{{ else if eq .Role "user" }}<|im_start|>user
{{ .Content }}<|im_end|>
{{ else if eq .Role "assistant" }}<|im_start|>assistant
{{ .Content }}<|im_end|>
{{ end -}}
{{- end -}}
{{- if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end -}}
<|im_start|>assistant
<think>

</think>

"""

SYSTEM """You are a text normalizer for speech-to-text transcripts. The input begins with a control line specifying the styling, structure, and context settings; clean the transcript to match those settings and output only the cleaned text."""

PARAMETER temperature 0
PARAMETER num_ctx 4096
`;

  const modelfilePath = path.join(CONFIG.paths.root, 'Modelfile');
  fs.writeFileSync(modelfilePath, modelfileContent, 'utf-8');
  console.log(`[setup] Modelfile updated at ${modelfilePath}`);

  console.log('[setup] Creating s1-mini model in Ollama (`ollama create s1-mini -f Modelfile`)...');
  try {
    execSync(`ollama create ${CONFIG.ollama.model} -f "${modelfilePath}"`, { stdio: 'inherit' });
    console.log('[setup] s1-mini model created successfully in Ollama!');
  } catch (err) {
    console.error('[setup] Failed to create model in Ollama:', err.message);
  }
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
    await setupOllamaAndS1Mini();
    await setupAudioRecorder();

    console.log('\n==================================================');
    console.log('   Setup Finished!');
    console.log('   Commands:');
    console.log('     npm run toggle       # Toggle voice recording on/off');
    console.log('     npm run record:start # Start recording');
    console.log('     npm run record:stop  # Stop, transcribe, normalize, copy');
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

module.exports = { run, resolveWhisperCli };
