#!/usr/bin/env node
const { toggleRecording, startRecording, stopRecording } = require('./record');

const arg = process.argv[2];
if (arg === 'start') {
  startRecording();
} else if (arg === 'stop') {
  stopRecording();
} else {
  toggleRecording();
}
