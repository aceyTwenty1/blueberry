#!/usr/bin/env python3
"""Hardware-aware profiles for the Blueberry local sidecar — stdlib only, no new deps.

Tuned for LENOVO Yoga 9 14ITL5 (i7-1195G7, 4C/8T, 16GB, Iris Xe):
  - torch CPU GEMM latency on 4 physical Tiger Lake cores peaks at ~4 threads;
    8 threads adds contention with the browser for tiny (135M/360M) matmuls.
  - 16GB fits SmolLM2-360M fp32 (~700MB) with headroom; <12GB stays on 135M.
  - HTTPServer stays single-threaded (sequential generates = no RAM spikes).

Profiles: puny (weak) / yoga (ultrabook like Yoga 9) / beefy (workstation).
"""
from __future__ import annotations

import os
import platform
from dataclasses import dataclass


@dataclass(frozen=True)
class ProfileCaps:
    name: str
    # torch threads (intra-op). Rule of thumb: physical cores, capped — latency, not throughput.
    threads: int
    interop_threads: int
    # generation / context budgets
    max_input_chars: int
    max_new_tokens: int
    prompt_cap: int
    # default HF model id for this class (both cached on the Yoga)
    model: str
    # short human rationale (surfaces in --print-profile / /health)
    why: str


PROFILES: dict[str, ProfileCaps] = {
    "puny": ProfileCaps(
        name="puny",
        threads=1,
        interop_threads=1,
        max_input_chars=1000,
        max_new_tokens=64,
        prompt_cap=2000,
        model="HuggingFaceTB/SmolLM2-135M-Instruct",
        why="<=4 logical cores or <8GB RAM: 135M, single thread, tight caps",
    ),
    "yoga": ProfileCaps(
        name="yoga",
        threads=4,
        interop_threads=2,
        max_input_chars=2000,
        max_new_tokens=96,
        prompt_cap=4000,
        model="HuggingFaceTB/SmolLM2-360M-Instruct",
        why="ultrabook 4C/8T + >=12GB (e.g. Yoga 9 i7-1195G7/16GB): 360M on 4 MKL threads",
    ),
    "beefy": ProfileCaps(
        name="beefy",
        threads=8,
        interop_threads=2,
        max_input_chars=4000,
        max_new_tokens=160,
        prompt_cap=6000,
        model="HuggingFaceTB/SmolLM2-360M-Instruct",
        why=">=16 logical cores + >=32GB: wider caps, still latency-capped threads",
    ),
}


def cpu_logical_count() -> int:
    return os.cpu_count() or 2


def cpu_physical_estimate() -> int:
    """Physical cores without psutil: psutil if present, else logical//2 heuristic.

    The //2 heuristic is exact for Intel HT (4C/8T Yoga 9 -> 4) and a safe
    under-estimate elsewhere (fewer threads = less contention).
    """
    try:
        import psutil  # type: ignore

        n = psutil.cpu_count(logical=False)
        if n:
            return n
    except Exception:
        pass
    return max(1, cpu_logical_count() // 2)


def total_ram_gb() -> float:
    """Total RAM in GiB, stdlib only. Returns 0.0 when undetectable."""
    try:
        if os.name == "nt":
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

            ms = MS()
            ms.dwLength = ctypes.sizeof(MS)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms)):
                return ms.ullTotalPhys / (1024 ** 3)
            return 0.0
        # posix: sysconf
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return (pages * page_size) / (1024 ** 3)
    except Exception:
        return 0.0


def machine_tag() -> str:
    return f"{platform.system()}/{platform.machine()} {platform.processor() or ''}".strip()


def recommend_profile(cpu_logical: int | None = None, ram_gb: float | None = None) -> str:
    """Pure function: class of machine -> profile name. Unit-tested."""
    cpu = cpu_logical if cpu_logical is not None else cpu_logical_count()
    ram = ram_gb if ram_gb is not None else total_ram_gb()
    if cpu >= 16 and ram >= 32:
        return "beefy"
    if cpu >= 6 and ram >= 12:
        return "yoga"
    if cpu >= 8 and ram >= 8:
        # many thin-and-lights: 8 threads but shared iGPU RAM — stay on 135M
        return "puny"
    if ram > 0 and ram < 8:
        return "puny"
    if cpu <= 4:
        return "puny"
    # Unknown RAM (0.0) but decent CPU: assume ultrabook, pick yoga caps w/ safe model
    return "yoga" if cpu >= 6 else "puny"


def resolve_profile(name: str = "auto") -> ProfileCaps:
    """Resolve 'auto' via hardware probe; explicit names return caps directly."""
    if name in PROFILES:
        return PROFILES[name]
    return PROFILES[recommend_profile()]


def thread_env(caps: ProfileCaps) -> dict[str, str]:
    """OMP/MKL env: must be set BEFORE torch is imported (torch reads at init)."""
    n = str(caps.threads)
    return {
        "OMP_NUM_THREADS": n,
        "MKL_NUM_THREADS": n,
        "OPENBLAS_NUM_THREADS": n,
        # oneDNN verbose off, allow TF32 where available (no-op on CPU-only Tiger Lake)
        "MKLDNN_VERBOSE": "0",
    }


def apply_thread_env(caps: ProfileCaps) -> None:
    for k, v in thread_env(caps).items():
        os.environ.setdefault(k, v)


def describe() -> dict:
    caps = resolve_profile("auto")
    return {
        "machine": machine_tag(),
        "cpu_logical": cpu_logical_count(),
        "cpu_physical_est": cpu_physical_estimate(),
        "ram_gb": round(total_ram_gb(), 1),
        "profile": caps.name,
        "caps": {
            "threads": caps.threads,
            "interop_threads": caps.interop_threads,
            "max_input_chars": caps.max_input_chars,
            "max_new_tokens": caps.max_new_tokens,
            "prompt_cap": caps.prompt_cap,
            "model": caps.model,
        },
        "why": caps.why,
    }


if __name__ == "__main__":
    import json

    print(json.dumps(describe(), indent=2))
