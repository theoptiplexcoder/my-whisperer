# my-whisperer

Cross-platform, low-latency push-to-talk voice capture, transcription, and AI normalization pipeline.

`my-whisperer` records audio from your microphone, transcribes it locally using [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp), cleans/formats the transcript with an Ollama LLM (`s1-mini`), and automatically copies the result to your system clipboard while sending a desktop notification.

---

## Features

- **Cross-Platform**: Supports Linux, macOS, and Windows.
- **Fast Local Transcription**: Leverages `whisper.cpp` (`ggml-base.en.bin`) for near-instant offline speech-to-text.
- **AI Text Normalization**: Uses local Ollama model `s1-mini` to correct grammar, remove filler words ("um", "uh"), and output clean prose.
- **Push-to-Talk / Toggle Workflow**: Start/stop recording with dedicated commands or bind them to a global keyboard shortcut.
- **Clipboard & Notifications**: Directly puts the normalized text onto your clipboard (`wl-copy`, `xclip`, `pbcopy`, or PowerShell) and shows desktop notifications.

---

## Prerequisites & OS Requirements

### All Platforms
- **Node.js**: v16+ (v18+ recommended)
- **Ollama**: Installed and running (`ollama serve`). Download from [ollama.com](https://ollama.com).

### Audio Recording Tools by OS
`my-whisperer` detects and uses your system's native recording utility:

- **Linux**:
  - `pipewire` (`pw-record`), `pulseaudio` (`parec`), or `ffmpeg` / `arecord` / `sox`.
  - Install via package manager: `sudo apt install ffmpeg` or `sudo pacman -S ffmpeg`
  - Clipboard tools: `wl-clipboard` (Wayland) or `xclip` / `xsel` (X11).
- **macOS**:
  - `ffmpeg` or `sox`.
  - Install via Homebrew: `brew install ffmpeg` or `brew install sox`
  - Native `pbcopy` and `osascript` (built into macOS) handle clipboard and notifications.
- **Windows**:
  - `ffmpeg` or `sox`.
  - Install via Winget or Chocolatey:
    - `winget install Gyan.FFmpeg`
    - or `choco install ffmpeg`
  - Native PowerShell handles clipboard and notification balloon tips.

---

## Installation & Setup

1. **Clone the repository and enter the directory**:
   ```bash
   git clone <repo-url> my-whisperer
   cd my-whisperer
   ```

2. **Run the automated setup wizard**:
   ```bash
   npm run setup
   ```
   The setup script will:
   - Detect or download `whisper-cli` for your OS/architecture (or guide you to install via Homebrew/system).
   - Ensure the Whisper GGML model (`ggml-base.en.bin`) is present.
   - Verify Ollama is running and ensure the `s1-mini` model is built/available.
   - Detect available audio recording CLI tools on your system.

3. **Check status**:
   ```bash
   npm run status
   ```
   Verifies that all components (`whisper-cli`, whisper model, Ollama server, `s1-mini`, audio recorder) are in a `READY` or `FOUND` state.

---

## Usage

You can invoke `my-whisperer` using npm scripts or direct Node commands:

| Command | Description |
|---|---|
| `npm run toggle` | Toggles recording on/off (if recording is running, stops and transcribes; if idle, starts recording) |
| `npm run record:start` | Explicitly starts audio recording |
| `npm run record:stop` | Stops recording, transcribes with Whisper, normalizes with Ollama, and copies to clipboard |
| `npm run status` | Inspects system status, audio devices, and models |

CLI shortcut:
```bash
node scripts/index.js        # toggle
node scripts/index.js start  # start
node scripts/index.js stop   # stop
```

---

## Keyboard Shortcut Configuration

To use `my-whisperer` as a global push-to-talk or toggle dictation tool, bind a keyboard shortcut to execute the toggle script.

Use the absolute path to `node` and the project directory:
```bash
/usr/bin/node /path/to/my-whisperer/scripts/toggle.js
```
*(On Windows: `node.exe C:\path\to\my-whisperer\scripts\toggle.js`)*

### Linux

#### GNOME (Ubuntu, Fedora)
1. Go to **Settings** > **Keyboard** > **Keyboard Shortcuts** > **Custom Shortcuts**.
2. Click **+** (Add Shortcut).
3. Name: `Voice Capture Toggle`
4. Command: `node /absolute/path/to/my-whisperer/scripts/toggle.js`
5. Set shortcut to e.g. `Super + Space` or `F8` or `Ctrl + Shift + V`.

#### KDE Plasma
1. Go to **System Settings** > **Shortcuts** > **Custom Shortcuts**.
2. Edit > New > Global Shortcut > Command/URL.
3. Trigger: choose your key combination.
4. Action: `node /absolute/path/to/my-whisperer/scripts/toggle.js`.

#### Sway / i3
Add to `~/.config/sway/config` or `~/.config/i3/config`:
```config
bindsym $mod+v exec node /absolute/path/to/my-whisperer/scripts/toggle.js
```

### macOS

#### Option A: Automator / Shortcuts App
1. Open **Shortcuts** (macOS Monterey+) or **Automator**.
2. Create a new Quick Action / Shortcut.
3. Add a "Run Shell Script" action:
   ```bash
   export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
   node /Users/<username>/path/to/my-whisperer/scripts/toggle.js
   ```
4. Assign a global hotkey under **System Settings** > **Keyboard** > **Keyboard Shortcuts** > **Services** / **Shortcuts**.

#### Option B: Raycast / Alfred
- Create a script command or workflow in Raycast/Alfred with a hotkey to run `node /path/to/my-whisperer/scripts/toggle.js`.

### Windows

#### Option A: AutoHotkey (Recommended)
1. Install [AutoHotkey](https://www.autohotkey.com/).
2. Create a `.ahk` script (e.g. `whisperer.ahk`):
   ```ahk
   ^!v:: ; Ctrl + Alt + V
   Run, node.exe "C:\path\to\my-whisperer\scripts\toggle.js", , Hide
   return
   ```
3. Run the script (or place it in your Windows Startup folder).

#### Option B: Windows Shortcut Key
1. Create a desktop shortcut to `wscript.exe` or `cmd.exe /c node C:\path\to\my-whisperer\scripts\toggle.js`.
2. Right-click the shortcut > **Properties**.
3. In the **Shortcut key** field, press your desired combination (e.g. `Ctrl + Alt + V`).
4. Click **OK**.

---

## Architecture & How It Works

1. **Recording (`scripts/record.js`)**:
   - Uses the first available audio recorder (`pw-record`, `ffmpeg`, `sox`, or `arecord`).
   - Captures 16 kHz 16-bit mono WAV to `~/.cache/voiceprompt/recording.wav`.
2. **Transcription (`whisper.cpp`)**:
   - Runs `whisper-cli` with `ggml-base.en.bin` on `recording.wav`.
   - Generates raw transcript text.
3. **Normalization (`scripts/normalize.js` & `s1-mini`)**:
   - Sends the raw transcript to the local Ollama instance running `s1-mini`.
   - Strips filler speech, formats punctuation, and outputs clean prose.
4. **Clipboard & Output (`scripts/utils.js`)**:
   - Copies the cleaned string to system clipboard.
   - Triggers native desktop notification.
