#!/usr/bin/env bash
# Fetches llama.cpp release binaries (Vulkan + CPU) and the Qwen2.5-3B-Instruct GGUF (~2 GB). Linux x64 only.
set -euo pipefail
cd "$(dirname "$0")"
TAG="${LLAMA_TAG:-b11060}"
mkdir -p bin/vulkan bin/cpu models
for v in vulkan ""; do n="llama-$TAG-bin-ubuntu-${v:+$v-}x64.tar.gz"; d="bin/${v:-cpu}"; [ -x "$d/llama-server" ] && continue
  echo "fetching $n"; curl -sL -o /tmp/$n "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/$n"; tar xzf /tmp/$n -C "$d" --strip-components=1; rm /tmp/$n; done
[ -f models/qwen2.5-3b-instruct-q4_k_m.gguf ] || curl -L -o models/qwen2.5-3b-instruct-q4_k_m.gguf "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
echo "ok. start with: tools/llm/serve.sh"
