#!/bin/bash
exec 200>test-pw.lock
flock -n 200 || { echo "locked"; exit 1; }
pw-record --rate 16000 --channels 1 --format s16 test.wav &
