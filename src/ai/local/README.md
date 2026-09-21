# Blueberry Local HF Sidecar — hardware-tuned (Yoga 9 ready, Humaize-style)

Fully **local** HF inference, no Ollama, no API keys, no internet after first download.
`src/ai/local/hardware.py` auto-detects your machine (`--profile auto`) and picks budgets:

| Profile | Machine class | Model | Threads | Budgets |
|---|---|---|---|---|
| `puny` | ≤4 cores or <8GB RAM | SmolLM2-135M (~280MB) | 1 | 1000 chars / 64 tok |
| `yoga` | ultrabook 6+ threads + ≥12GB — **Yoga 9 14ITL5 (i7-1195G7/16GB) lands here** | SmolLM2-360M (~700MB) | 4 + MKL-DNN | 2000 chars / 96 tok |
| `beefy` | 16+ threads + ≥32GB | SmolLM2-360M | 8 | 4000 chars / 160 tok |

**Humaize refs:** `D:\Humaize\generator.py:104` `TextRewriter`, `D:\Humaize\config.py:127` `apply_light_mode`. Yoga profile keeps the light path but widens caps + threads for 4 physical Tiger Lake cores (GEMM latency peaks ~4 threads; 8 threads just contends with the browser).

## Quick Start (Yoga 9)

```powershell
# 0. Check what your machine resolves to (no model load):
python src/ai/local/server.py --print-profile
# → {"profile": "yoga", "threads": 4, ...} on Yoga 9 14ITL5

# 1. One-time install (creates .venv, installs torch+transformers CPU)
powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1
# or double-click: scripts/start-sidecar.bat

# 2. Server starts on http://127.0.0.1:11435 (profile auto → yoga → 360M, 4 threads)
# First run downloads model ~700MB to HF cache, then offline
# Logs: [sidecar] Model ready + /health shows {"profile":"yoga","threads":4}
#
# Measured live on Yoga 9 14ITL5 (i7-1195G7, 16GB):
#   preload 360M ~100s (one-time per boot) · short reply ~4s · 96-tok summary stream ~50s

# 3. In another terminal, run Blueberry Firefox
npm install
npm run build:firefox:extension
npm run dev:firefox
# Sidebar now defaults to `Local SmolLM2-135M (Puny, Free)` — no config needed
```

**Test without Blueberry:**

```powershell
curl http://127.0.0.1:11435/health
curl -X POST http://127.0.0.1:11435/api/chat -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Summarize this in one sentence: Blueberry is a Firefox-native AI browser\"}]}"
```

**Manual (no scripts):**

```bash
python src/ai/local/server.py --profile auto --port 11435
# Options: --profile puny|yoga|beefy   (override auto-detect)
#          --threads 2                 (override torch threads)
#          --model HuggingFaceTB/SmolLM2-135M-Instruct  (pin model, skip profile pick)
#          --model Qwen/Qwen2.5-0.5B-Instruct          (400MB)
# Legacy:  --puny                      (force puny budgets, keep model)
# npm:     npm run sidecar / sidecar:yoga / sidecar:135 / sidecar:360
```

**How it hooks to Blueberry:**

- `src/shared/constants/defaults.ts:12` now has `{ id:'local-smollm135', baseUrl:'http://localhost:11435', model:'HuggingFaceTB/SmolLM2-135M-Instruct' }` enabled by default.
- `src/firefox/extension/background/aiRouter.ts:32` treats `local-smollm135` as Ollama-compatible (`/api/chat` NDJSON) via `fetch` — no cloud.
- `src/firefox/extension/sidebar/sidebar.ts:24` defaults to `local-smollm135`, dropdown includes it.

**Troubleshooting:**

- **OOM / too slow?** Drop to `--profile puny` (135M, 1 thread). On Yoga 9, 360M fp32 is ~700MB — fine on 16GB.
- **Humaize already installed?** `server.py` auto-imports `D:\Humaize\generator.py` — reuses that env, no duplicate download.
- **Offline?** Works — model cached after first run. Delete cache: remove HF cache dir, re-downloads on next start.
- **Yoga running hot?** `--threads 2` caps CPU further; the browser stays responsive since torch never takes all 8 threads.

**Stop:** `Ctrl+C` in sidecar terminal. Blueberry sidebar will show `Error (local-smollm135)` if sidecar not running — start it again.
