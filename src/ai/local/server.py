#!/usr/bin/env python3
"""
Blueberry Local HF Sidecar — 135M puny (Humaize-style)
- Reuses Humaize TextRewriter pattern: SmolLM2-135M-Instruct, chat template, puny caps
- Exposes Ollama-compatible HTTP on localhost:11435 for Gecko aiRouter.ts
- Fully local, no API keys, offline after first download (~280MB)

Run: python src/ai/local/server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny
Test: curl http://localhost:11435/health
      curl -X POST http://localhost:11435/api/chat -H "Content-Type: application/json" -d '{"model":"smollm135","messages":[{"role":"user","content":"hello"}]}'

Humaize refs: D:\\Humaize\\generator.py:104 TextRewriter, D:\\Humaize\\config.py:127 apply_light_mode
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List

# Allow importing from D:\Humaize if present (reuse TextRewriter), else fallback to local transformers
HUMAIZE_ROOT = Path(r"D:\Humaize")
if HUMAIZE_ROOT.exists() and str(HUMAIZE_ROOT) not in sys.path:
    sys.path.insert(0, str(HUMAIZE_ROOT))

PORT_DEFAULT = 11435
MODEL_DEFAULT = "HuggingFaceTB/SmolLM2-135M-Instruct"

# --- Try to import Humaize's TextRewriter, else define minimal fallback ---
try:
    from generator import TextRewriter  # type: ignore
    from config import GeneratorConfig, apply_light_mode, AppConfig  # type: ignore
    HAS_HUMAIZE = True
    print("[sidecar] Using D:\\Humaize TextRewriter")
except Exception as e:
    HAS_HUMAIZE = False
    print(f"[sidecar] Humaize not importable ({e}), using minimal transformers fallback")

    # Minimal fallback if Humaize not available (still HF local)
    TextRewriter = None  # type: ignore
    GeneratorConfig = None  # type: ignore


class PunyRewriter:
    """Minimal fallback rewriter when Humaize not available — same HF local via transformers."""

    def __init__(self, model_name: str, puny: bool = True):
        self.model_name = model_name
        self.puny = puny
        self._model = None
        self._tok = None
        self.device = "cpu"

    def load(self):
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch

        print(f"[sidecar] Loading {self.model_name} (puny={self.puny}) ...")
        tok = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
        if tok.pad_token is None:
            tok.pad_token = tok.eos_token
        tok.padding_side = "left"
        mdl = AutoModelForCausalLM.from_pretrained(
            self.model_name, trust_remote_code=True, torch_dtype=torch.float32, low_cpu_mem_usage=True
        )
        mdl.to(self.device)
        mdl.eval()
        # Puny: 1 thread like Humaize Yoga
        try:
            torch.set_num_threads(1)
        except:
            pass
        self._model, self._tok = mdl, tok
        print(f"[sidecar] Ready {self.model_name} on {self.device}")
        return self

    def chat(self, messages: List[Dict[str, str]], max_new_tokens: int = 64) -> str:
        import torch

        assert self._model is not None and self._tok is not None
        # Build prompt via chat template
        try:
            prompt = self._tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        except:
            # fallback plain
            prompt = "\n".join(f"{m['role']}: {m['content']}" for m in messages) + "\nassistant:"
        if self.puny:
            max_new_tokens = min(max_new_tokens, 64)
            prompt = prompt[-2000:]  # Humaize puny cap

        enc = self._tok(prompt, return_tensors="pt", truncation=True, max_length=1024)
        input_ids = enc["input_ids"].to(self._model.device)
        attn = enc["attention_mask"].to(self._model.device)
        with torch.no_grad():
            out = self._model.generate(
                input_ids,
                attention_mask=attn,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=self._tok.eos_token_id,
                eos_token_id=self._tok.eos_token_id,
            )
        new = out[0][input_ids.shape[1] :]
        text = self._tok.decode(new, skip_special_tokens=True)
        # Humaize-style sanitize (strip prompt echo)
        text = text.strip().replace("<input_text>", "").replace("</input_text>", "").strip()
        return " ".join(text.split()) or "No response"


# Global rewriter instance
_REWRITER: Any = None
_START = time.time()


def get_rewriter(model: str, puny: bool) -> Any:
    global _REWRITER
    if _REWRITER is not None:
        return _REWRITER
    if HAS_HUMAIZE:
        # Use Humaize's TextRewriter with puny config
        cfg = GeneratorConfig()
        cfg.fallback_model_name = model
        cfg.model_name = model
        cfg.max_input_chars = 1000 if puny else 2000  # even tighter than Humaize light 2000
        # Build AppConfig and apply light/puny
        app = AppConfig()
        app.generator = cfg
        if puny:
            app = apply_light_mode(app)
            # extra puny: 1 thread, 32 tok cap will be enforced in rewrite()
            app.generator.max_input_chars = 1000
        # Force fast_mode so it uses fallback model (135M) on CPU
        os.environ["HUMAIZE_FAST"] = "1"
        rw = TextRewriter(config=app.generator, fast_mode=True)
        rw.load()
        # Wrap to expose chat()
        class Wrap:
            def __init__(self, r):
                self.r = r
                self.puny = puny

            def chat(self, messages, max_new_tokens=64):
                # Convert messages to Humaize rewrite payload: last user message is payload, rest as guidance
                payload = messages[-1]["content"] if messages else ""
                guidance = None
                if len(messages) > 1:
                    guidance = "\n".join(f"{m['role']}: {m['content']}" for m in messages[:-1])[-500:]
                cands = self.r.rewrite(payload, guidance=guidance, num_candidates=1)
                return cands[0].text if cands else payload

        _REWRITER = Wrap(rw)
    else:
        rw = PunyRewriter(model, puny)
        rw.load()
        _REWRITER = rw
    return _REWRITER


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[sidecar] {self.client_address[0]} - {format % args}")

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            uptime = int(time.time() - _START)
            has_model = _REWRITER is not None
            self.wfile.write(
                json.dumps({"status": "ok", "model": MODEL_DEFAULT, "has_model": has_model, "uptime": uptime}).encode()
            )
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body.decode() or "{}")
        except:
            data = {}

        # Normalize: support Ollama /api/chat and /api/generate and Humaize /infer
        messages: List[Dict[str, str]] = []
        stream = bool(data.get("stream", False))
        model = data.get("model", MODEL_DEFAULT)

        if "messages" in data:
            # Ollama-style: {messages:[{role,content}]}
            raw = data["messages"] or []
            for m in raw:
                if isinstance(m, dict) and "content" in m:
                    messages.append({"role": m.get("role", "user"), "content": m["content"]})
        elif "prompt" in data:
            messages = [{"role": "user", "content": data["prompt"]}]
        elif "payload" in data:
            messages = [{"role": "user", "content": data["payload"]}]
        elif "input_text" in data:
            messages = [{"role": "user", "content": data["input_text"]}]

        if not messages:
            # Try to handle Humaize-style <input_text>
            txt = str(body.decode())
            if "<input_text>" in txt:
                import re

                m = re.search(r"<input_text>(.*?)</input_text>", txt, re.DOTALL)
                if m:
                    messages = [{"role": "user", "content": m.group(1).strip()}]
        if not messages:
            messages = [{"role": "user", "content": "Hello"}]

        # Puny caps
        max_tokens = int(data.get("max_tokens", data.get("max_new_tokens", 64)))
        if _REWRITER and getattr(_REWRITER, "puny", False):
            max_tokens = min(max_tokens, 64)

        # Generate
        try:
            rewriter = get_rewriter(MODEL_DEFAULT, puny=True)
            text = rewriter.chat(messages, max_new_tokens=max_tokens)
        except Exception as e:
            import traceback

            traceback.print_exc()
            text = f"Error: {e}"

        if stream:
            # NDJSON stream like Ollama: each line JSON
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()
            # Chunk by words for streaming effect
            words = text.split()
            for i, w in enumerate(words):
                chunk = {"message": {"role": "assistant", "content": w + (" " if i < len(words) - 1 else "")}, "done": False}
                self.wfile.write((json.dumps(chunk) + "\n").encode())
                self.wfile.flush()
                time.sleep(0.02)
            self.wfile.write((json.dumps({"message": {"role": "assistant", "content": ""}, "done": True}) + "\n").encode())
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            # Ollama-compatible response + also HuggingFace-friendly
            resp = {"message": {"role": "assistant", "content": text}, "response": text, "done": True, "model": model}
            self.wfile.write(json.dumps(resp).encode())


def main():
    global MODEL_DEFAULT
    parser = argparse.ArgumentParser(description="Blueberry 135M puny sidecar (Humaize-style)")
    parser.add_argument("--model", default=MODEL_DEFAULT, help="HF model id")
    parser.add_argument("--port", type=int, default=PORT_DEFAULT, help="port")
    parser.add_argument("--puny", action="store_true", default=True, help="puny caps (1000 chars, 64 tok, 1 thread)")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    MODEL_DEFAULT = args.model

    print(f"[sidecar] Blueberry 135M puny sidecar")
    print(f"[sidecar] Model: {args.model}  Puny: {args.puny}  Port: {args.port}")
    print(f"[sidecar] Pre-loading model (first run downloads ~280MB)...")
    try:
        get_rewriter(args.model, args.puny)
        print(f"[sidecar] Model ready")
    except Exception as e:
        print(f"[sidecar] Preload failed, will lazy-load on first request: {e}")

    server = HTTPServer((args.host, args.port), Handler)
    print(f"[sidecar] Listening on http://{args.host}:{args.port}  (health: /health, chat: POST /api/chat)")
    print(f"[sidecar] For Blueberry, set provider baseUrl to http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[sidecar] Shutting down")


if __name__ == "__main__":
    main()
