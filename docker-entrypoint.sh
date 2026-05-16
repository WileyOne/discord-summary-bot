#!/bin/sh
set -e
# Named volumes are often root:root; the app runs as user `node` (UID 1000).
chown -R node:node /data
exec su-exec node "$@"
