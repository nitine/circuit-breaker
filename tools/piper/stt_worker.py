"""Streaming speech recognition worker (Vosk). Reads raw PCM16 mono from stdin, writes JSON lines to stdout.
Usage: stt_worker.py <model_dir> <sample_rate>
Lines: {"partial": "..."} while speaking, {"text": "..."} at utterance end.
"""
import json
import os
import sys

os.environ.setdefault("VOSK_LOG_LEVEL", "-1")
from vosk import KaldiRecognizer, Model, SetLogLevel  # noqa: E402

SetLogLevel(-1)
model_dir, rate = sys.argv[1], int(sys.argv[2])
rec = KaldiRecognizer(Model(model_dir), rate)
rec.SetWords(False)
out = sys.stdout
last_partial = ""
while True:
    chunk = sys.stdin.buffer.read(3200)
    if not chunk:
        break
    if rec.AcceptWaveform(chunk):
        r = json.loads(rec.Result())
        t = r.get("text", "").strip()
        last_partial = ""
        if t:
            out.write(json.dumps({"text": t}, ensure_ascii=False) + "\n"); out.flush()
    else:
        p = json.loads(rec.PartialResult()).get("partial", "").strip()
        if p and p != last_partial:
            last_partial = p
            out.write(json.dumps({"partial": p}, ensure_ascii=False) + "\n"); out.flush()
r = json.loads(rec.FinalResult()); t = r.get("text", "").strip()
if t:
    out.write(json.dumps({"text": t}, ensure_ascii=False) + "\n"); out.flush()
