#!/bin/bash
LOCKFILE="test.lock"
exec 200>"$LOCKFILE"
flock -n 200 || { echo "Locked"; exit 0; }
echo "Got lock"
sleep 5 &
