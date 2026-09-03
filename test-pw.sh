#!/bin/bash
exec 200>test-pw.lock
flock -n 200 || { echo "locked"; exit 1; }
pw-record --version &
echo "Script exiting"
