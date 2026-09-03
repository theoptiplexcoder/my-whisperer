#!/bin/bash
exec 200>test2.lock
flock -n 200 || { echo "locked"; exit 1; }
sleep 5 &
