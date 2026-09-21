#!/usr/bin/env python3
"""Unit tests for hardware.py — stdlib unittest, no torch/transformers needed.

Run: python -m unittest discover -s src/ai/local -p "test_*.py"
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hardware import (
    PROFILES,
    recommend_profile,
    resolve_profile,
    thread_env,
    describe,
)


class TestRecommendProfile(unittest.TestCase):
    def test_puny_weak_cpu(self):
        self.assertEqual(recommend_profile(cpu_logical=2, ram_gb=4.0), "puny")

    def test_puny_low_ram(self):
        self.assertEqual(recommend_profile(cpu_logical=8, ram_gb=4.0), "puny")

    def test_puny_thin_and_light_8gb(self):
        # 8 threads but only 8GB shared with iGPU -> stay on 135M
        self.assertEqual(recommend_profile(cpu_logical=8, ram_gb=8.0), "puny")

    def test_yoga_class(self):
        # Yoga 9 14ITL5: i7-1195G7 4C/8T + 16GB
        self.assertEqual(recommend_profile(cpu_logical=8, ram_gb=15.6), "yoga")
        self.assertEqual(recommend_profile(cpu_logical=6, ram_gb=12.0), "yoga")

    def test_beefy(self):
        self.assertEqual(recommend_profile(cpu_logical=16, ram_gb=32.0), "beefy")
        self.assertEqual(recommend_profile(cpu_logical=24, ram_gb=64.0), "beefy")

    def test_unknown_ram_falls_back_by_cpu(self):
        self.assertEqual(recommend_profile(cpu_logical=8, ram_gb=0.0), "yoga")
        self.assertEqual(recommend_profile(cpu_logical=2, ram_gb=0.0), "puny")


class TestResolveProfile(unittest.TestCase):
    def test_explicit_names(self):
        for name in ("puny", "yoga", "beefy"):
            caps = resolve_profile(name)
            self.assertEqual(caps.name, name)

    def test_unknown_name_falls_back_to_auto(self):
        caps = resolve_profile("does-not-exist")
        self.assertIn(caps.name, PROFILES)

    def test_auto_resolves_to_known(self):
        self.assertIn(resolve_profile("auto").name, PROFILES)


class TestCapsSanity(unittest.TestCase):
    def test_monotonic_budgets(self):
        # bigger machines get >= budgets at every step
        for key in ("max_input_chars", "max_new_tokens", "prompt_cap"):
            self.assertLessEqual(getattr(PROFILES["puny"], key), getattr(PROFILES["yoga"], key))
            self.assertLessEqual(getattr(PROFILES["yoga"], key), getattr(PROFILES["beefy"], key))

    def test_threads_positive_and_latency_capped(self):
        for caps in PROFILES.values():
            self.assertGreaterEqual(caps.threads, 1)
            self.assertLessEqual(caps.threads, 8)  # latency, not throughput
            self.assertTrue(caps.model.startswith("HuggingFaceTB/"))

    def test_thread_env_keys(self):
        env = thread_env(PROFILES["yoga"])
        self.assertEqual(env["OMP_NUM_THREADS"], "4")
        self.assertEqual(env["MKL_NUM_THREADS"], "4")
        self.assertIn("OPENBLAS_NUM_THREADS", env)


class TestDescribe(unittest.TestCase):
    def test_shape(self):
        d = describe()
        self.assertIn(d["profile"], PROFILES)
        self.assertGreaterEqual(d["cpu_logical"], 1)
        self.assertGreaterEqual(d["ram_gb"], 0.0)
        self.assertIn("threads", d["caps"])


if __name__ == "__main__":
    unittest.main()
