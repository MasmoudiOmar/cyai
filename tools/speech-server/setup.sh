#!/usr/bin/env bash
# Installs the local speech server into ~/.cyai/speech: a Python venv, the pinned packages
# and the Kokoro voice model. Whisper downloads itself on first start.
set -euo pipefail

home="${CYAI_HOME:-$HOME/.cyai}/speech"
here="$(cd "$(dirname "$0")" && pwd)"
models="$home/models"
release="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"

mkdir -p "$models"
if [ ! -x "$home/venv/bin/python" ]; then
  python3 -m venv "$home/venv"
fi
"$home/venv/bin/pip" install --quiet --upgrade pip
"$home/venv/bin/pip" install --quiet -r "$here/requirements.txt"

fetch() {
  local name="$1" size="$2"
  if [ "$(stat -c %s "$models/$name" 2>/dev/null || echo 0)" != "$size" ]; then
    echo "Downloading $name ..."
    curl -sSfL -o "$models/$name" "$release/$name"
  fi
}
fetch kokoro-v1.0.int8.onnx 92361271
fetch voices-v1.0.bin 28214398

echo "Installed. Start it with: $home/venv/bin/python $here/server.py"
