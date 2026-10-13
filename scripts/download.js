const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1024) {
        console.log(`[setup] Already downloaded: ${path.basename(destPath)} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
        return resolve();
      }
    }

    console.log(`[setup] Downloading: ${path.basename(destPath)} from ${url} ...`);
    const tempPath = `${destPath}.tmp`;
    const file = fs.createWriteStream(tempPath);

    const get = (targetUrl) => {
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return get(response.headers.location);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tempPath);
          return reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastLogged = Date.now();

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          file.write(chunk);
          const now = Date.now();
          if (now - lastLogged > 2000 && totalBytes > 0) {
            const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r[setup] Progress: ${pct}% (${mb}/${totalMb} MB)`);
            lastLogged = now;
          }
        });

        response.on('end', () => {
          file.end();
          if (totalBytes > 0) {
            process.stdout.write('\n');
          }
          fs.renameSync(tempPath, destPath);
          console.log(`[setup] Completed: ${path.basename(destPath)}`);
          resolve();
        });

        response.on('error', (err) => {
          file.close();
          try { fs.unlinkSync(tempPath); } catch (_) {}
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(tempPath); } catch (_) {}
        reject(err);
      });
    };

    get(url);
  });
}

function checkCommand(cmd) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  downloadFile,
  checkCommand
};
