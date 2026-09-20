#!/usr/bin/env bash
# Local caller brain: an OpenAI-compatible llama.cpp server. Used when no AWS credentials are present.
# Usage: tools/llm/serve.sh [port]   (default 8081). Set LLM_BASE_URL=http://localhost:8081/v1 LLM_MODEL=qwen2.5-3b in app/.env
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8081}"
MODEL="${LLM_GGUF:-models/qwen2.5-3b-instruct-q4_k_m.gguf}"
[ -f "$MODEL" ] || { echo "model missing: $MODEL (run tools/llm/install.sh)"; exit 1; }
BIN=bin/cpu/llama-server; NGL=0
if [ -x bin/vulkan/llama-server ] && [ -e /usr/lib/libvulkan.so.1 ] && [ -z "${LLM_CPU:-}" ]; then BIN=bin/vulkan/llama-server; NGL=99; fi
export LD_LIBRARY_PATH="$(dirname "$BIN"):${LD_LIBRARY_PATH:-}"
exec "$BIN" -m "$MODEL" --alias qwen2.5-3b --port "$PORT" --host 127.0.0.1 -c 8192 -ngl "$NGL" --parallel 4 --cont-batching --no-webui --log-disable 2>/dev/null \
  || exec "$BIN" -m "$MODEL" --alias qwen2.5-3b --port "$PORT" --host 127.0.0.1 -c 8192 -ngl "$NGL" --parallel 4
