const http = require('http');
const CONFIG = require('./config');

const SYSTEM_PROMPT = 'You are a text normalizer for speech-to-text transcripts. The input begins with a control line specifying the styling, structure, and context settings; clean the transcript to match those settings and output only the cleaned text.';
const CONTROL_LINE = '[Styling: semi-formal] [Structure: prose] [Context: general]';

function buildPrompt(rawText) {
  return (
    `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n` +
    `<|im_start|>user\n${CONTROL_LINE}\n${rawText.trim()}<|im_end|>\n` +
    '<|im_start|>assistant\n<think>\n\n</think>\n\n'
  );
}

async function normalizeText(rawText) {
  const text = (rawText || '').trim();
  if (!text) {
    return '';
  }

  const payload = JSON.stringify({
    model: CONFIG.ollama.model,
    prompt: buildPrompt(text),
    raw: true,
    stream: false,
    options: {
      temperature: 0
    }
  });

  return new Promise((resolve) => {
    const url = new URL(`${CONFIG.ollama.host}/api/generate`);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const normalized = (parsed.response || '').trim();
          resolve(normalized || text);
        } catch (_) {
          resolve(text);
        }
      });
    });

    req.on('error', () => {
      // Fall back to raw text if Ollama is unreachable
      resolve(text);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(text);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  normalizeText
};
