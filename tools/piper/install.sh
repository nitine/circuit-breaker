#!/usr/bin/env bash
# Installs Piper (open-source neural TTS, the caller's voice) and Vosk (offline speech recognition, your mic) for local-mode voice. Linux/macOS, Python 3.10+.
# The app auto-detects tools/piper/.venv/bin/piper and tools/piper/voices/*.onnx; Polly is used instead when AWS keys are set.
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --quiet piper-tts vosk
mkdir -p voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0
for p in en/en_US/ryan/medium/en_US-ryan-medium en/en_US/lessac/medium/en_US-lessac-medium en/en_GB/alan/medium/en_GB-alan-medium; do
  n=${p##*/}
  [ -f "voices/$n.onnx" ] || curl -L -o "voices/$n.onnx" "$B/$p.onnx"
  [ -f "voices/$n.onnx.json" ] || curl -L -o "voices/$n.onnx.json" "$B/$p.onnx.json"
done
# Hindi voices live on the main branch
M=https://huggingface.co/rhasspy/piper-voices/resolve/main
for p in hi/hi_IN/rohan/medium/hi_IN-rohan-medium hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium; do
  n=${p##*/}
  [ -f "voices/$n.onnx" ] || curl -L -o "voices/$n.onnx" "$M/$p.onnx"
  [ -f "voices/$n.onnx.json" ] || curl -L -o "voices/$n.onnx.json" "$M/$p.onnx.json"
done
# Vosk models: your voice, in any browser (en-IN and Hindi). The app spawns stt_worker.py per drill.
mkdir -p models
for m in vosk-model-small-en-in-0.4 vosk-model-small-hi-0.22; do
  [ -d "models/$m" ] || { curl -L -o "/tmp/$m.zip" "https://alphacephei.com/vosk/models/$m.zip"; unzip -q "/tmp/$m.zip" -d models; rm "/tmp/$m.zip"; }
done
echo "Piper ready: $(ls voices/*.onnx | wc -l) voices · Vosk ready: $(ls -d models/vosk-* | wc -l) models"
