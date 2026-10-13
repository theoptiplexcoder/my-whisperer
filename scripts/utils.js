const { spawn, execSync } = require('child_process');
const os = require('os');

function notify(title, message, expireMs = 1500) {
  const platform = process.platform;
  try {
    if (platform === 'linux') {
      spawn('notify-send', [
        '-h', 'string:x-canonical-private-synchronous:voiceprompt',
        '-t', String(expireMs),
        title,
        message
      ], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'darwin') {
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
      spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true }).unref();
    } else if (platform === 'win32') {
      const psCommand = `
        [void] [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms");
        $notify = New-Object System.Windows.Forms.NotifyIcon;
        $notify.Icon = [System.Drawing.SystemIcons]::Information;
        $notify.Visible = $true;
        $notify.ShowBalloonTip(${expireMs}, "${title.replace(/"/g, '`"')}", "${message.replace(/"/g, '`"')}", [System.Windows.Forms.ToolTipIcon]::Info);
        Start-Sleep -Milliseconds 2000;
        $notify.Dispose();
      `;
      spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { stdio: 'ignore', detached: true }).unref();
    }
  } catch (err) {
    // Notifications are best-effort
  }
}

function copyToClipboard(text) {
  const platform = process.platform;
  try {
    if (platform === 'linux') {
      if (process.env.WAYLAND_DISPLAY) {
        try {
          execSync('wl-copy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
          return true;
        } catch (_) {}
      }
      try {
        execSync('xclip -selection clipboard', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
        return true;
      } catch (_) {
        try {
          execSync('xsel --clipboard --input', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
          return true;
        } catch (_) {}
      }
    } else if (platform === 'darwin') {
      execSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    } else if (platform === 'win32') {
      execSync('powershell -NoProfile -Command "Set-Clipboard -Value ([Console]::In.ReadToEnd())"', {
        input: text,
        stdio: ['pipe', 'ignore', 'ignore']
      });
      return true;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err.message);
    return false;
  }
  return false;
}

module.exports = {
  notify,
  copyToClipboard
};
