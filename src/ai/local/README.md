# Blueberry Local HF Sidecar — 135M puny (like Humaize)

Fully **local** `HuggingFaceTB/SmolLM2-135M-Instruct` (~280MB) running exactly like `D:\Humaize` light mode. No Ollama, no API keys, no internet after first download.

**Humaize refs:** `D:\Humaize\generator.py:104` `TextRewriter`, `D:\Humaize\config.py:127` `apply_light_mode` (800 feats, 2000 chars/64 tok, 2 threads, ~900MB). Puny here is even tighter: **1000 chars / 32-64 tok / 1 thread / ~400MB**.

## Quick Start (puny laptop)

```powershell
# 1. One-time install (creates .venv, installs torch+transformers CPU)
powershell -ExecutionPolicy Bypass -File scripts/start-sidecar.ps1
# or double-click: scripts/start-sidecar.bat

# 2. Server starts on http://127.0.0.1:11435
# First run downloads model ~280MB to HF cache, then offline
# Logs: [sidecar] Ready HuggingFaceTB/SmolLM2-135M-Instruct

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
python src/ai/local/server.py --model HuggingFaceTB/SmolLM2-135M-Instruct --port 11435 --puny
# Options: --model HuggingFaceTB/SmolLM2-360M-Instruct  (700MB, better quality, needs ~1GB)
#          --model Qwen/Qwen2.5-0.5B-Instruct          (400MB)
```

**How it hooks to Blueberry:**

- `src/shared/constants/defaults.ts:12` now has `{ id:'local-smollm135', baseUrl:'http://localhost:11435', model:'HuggingFaceTB/SmolLM2-135M-Instruct' }` enabled by default.
- `src/firefox/extension/background/aiRouter.ts:32` treats `local-smollm135` as Ollama-compatible (`/api/chat` NDJSON) via `fetch` — no cloud.
- `src/firefox/extension/sidebar/sidebar.ts:24` defaults to `local-smollm135`, dropdown includes it.

**Troubleshooting puny:**

- **OOM / too slow?** Use 135M puny (280MB) not 360M. Keep `--puny` (caps 1000 chars/64 tok/1 thread).
- **Humaize already installed?** `server.py:18` auto-imports `D:\Humaize\generator.py` — reuses that env, no duplicate download.
- **Offline?** Works — model cached after first run. Delete cache: remove HF cache dir, re-downloads on next start.

**Stop:** `Ctrl+C` in sidecar terminal. Blueberry sidebar will show `Error (local-smollm135)` if sidecar not running — start it again.
