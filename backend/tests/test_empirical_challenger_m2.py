"""
Empirical Verification & Adversarial Stress Harness for Milestone 2.
Challenger 1 empirical stress tests for MangaDex acquisition layer:
- TokenBucketRateLimiter pacing under burst conditions (<= 4.0 RPS sustained)
- Concurrency & thread safety under heavy contention (16-50 threads)
- HTTP 429 and 503 backoff timing and jitter distribution
- Retry-After header edge cases (numeric, zero, malformed, missing)
- Decoupling of page downloads from API rate limiter
"""

import time
import math
import random
import threading
from typing import List, Tuple
from unittest.mock import MagicMock, patch

import pytest
import requests

from src.acquisition.mangadex_client import (
    TokenBucketRateLimiter,
    MangaDexClient,
    MANGADEX_API,
    DEFAULT_MAX_RPS,
)


# ==============================================================================
# Category 1: TokenBucket Pacing & Burst Conditions
# ==============================================================================

class TestTokenBucketBurstAndPacing:
    """Stress tests verifying TokenBucket burst limits and sustained pacing <= 4.0 RPS."""

    def test_burst_capacity_immediate_emission(self):
        """When bucket is full, up to capacity (4.0) tokens are emitted immediately."""
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        t0 = time.monotonic()
        emitted = 0
        for _ in range(4):
            if limiter.acquire(1.0, timeout=0.01):
                emitted += 1
        elapsed = time.monotonic() - t0
        assert emitted == 4, f"Expected 4 immediate tokens, got {emitted}"
        assert elapsed < 0.05, f"Burst emission took too long: {elapsed:.4f}s"

    def test_burst_exhaustion_blocks_fifth_request(self):
        """Immediately after draining 4 tokens, a 5th request without wait must fail if timed out."""
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        for _ in range(4):
            assert limiter.acquire(1.0) is True

        # 5th request with minimal timeout should fail because bucket is empty
        assert limiter.acquire(1.0, timeout=0.02) is False

    def test_multithreaded_pacing_sustained_under_4_rps(self):
        """
        Under heavy multithreaded acquisition (16 concurrent threads),
        after initial burst is consumed, requests are strictly paced at <= 4.0 RPS.
        """
        rate = 4.0
        capacity = 4.0
        limiter = TokenBucketRateLimiter(rate=rate, capacity=capacity)

        # Drain initial burst
        for _ in range(4):
            limiter.acquire(1.0)

        # Now launch 16 worker threads contending for tokens over ~2.0 seconds
        acquired_timestamps: List[float] = []
        lock = threading.Lock()
        stop_event = threading.Event()

        def worker():
            while not stop_event.is_set():
                if limiter.acquire(1.0, timeout=0.1):
                    ts = time.monotonic()
                    with lock:
                        acquired_timestamps.append(ts)

        threads = [threading.Thread(target=worker) for _ in range(16)]
        t_start = time.monotonic()
        for t in threads:
            t.start()

        # Run test for 2.5 seconds
        time.sleep(2.5)
        stop_event.set()
        for t in threads:
            t.join(timeout=2.0)
        t_end = time.monotonic()

        test_duration = t_end - t_start
        total_acquired = len(acquired_timestamps)

        # Theoretical maximum tokens in test_duration: duration * rate
        max_theoretical = test_duration * rate + 1.0  # +1 for refill delta rounding
        empirical_rps = total_acquired / test_duration

        assert total_acquired <= math.ceil(max_theoretical), (
            f"Exceeded theoretical limit! Acquired {total_acquired} in {test_duration:.2f}s "
            f"(empirical RPS {empirical_rps:.2f} > 4.0 RPS)"
        )
        # Verify empirical RPS is strictly bounded by 4.0 + tolerance (due to sub-tick refill)
        assert empirical_rps <= 4.15, f"Sustained RPS too high: {empirical_rps:.2f} RPS"

    def test_sliding_window_1s_never_exceeds_4_requests_post_burst(self):
        """
        In any 1.0-second sliding window after the initial burst has drained,
        the number of granted requests must never exceed 4 (tolerance <= 5 for edge-boundary ticks).
        """
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)

        # Drain initial burst
        for _ in range(4):
            limiter.acquire(1.0)

        timestamps: List[float] = []
        lock = threading.Lock()
        stop_event = threading.Event()

        def worker():
            while not stop_event.is_set():
                if limiter.acquire(1.0, timeout=0.1):
                    with lock:
                        timestamps.append(time.monotonic())

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()

        time.sleep(2.0)
        stop_event.set()
        for t in threads:
            t.join(timeout=2.0)

        # Check sliding 1.0s window across all recorded timestamps
        max_in_window = 0
        for i, t_i in enumerate(timestamps):
            count_in_window = sum(1 for t in timestamps if t_i <= t < t_i + 1.0)
            if count_in_window > max_in_window:
                max_in_window = count_in_window

        # Max allowed in any 1s interval when refill rate is 4.0 tokens/s is 4 (or 5 if boundary tick matches)
        assert max_in_window <= 5, (
            f"Sliding window violation: {max_in_window} requests observed in a 1.0s window"
        )


# ==============================================================================
# Category 2: HTTP 429 and 503 Backoff Timing and Simulated Jitter
# ==============================================================================

class VirtualClock:
    """Virtual clock that advances time.monotonic when time.sleep is called."""
    def __init__(self, start_time: float = 1000.0):
        self.current_time = start_time
        self.sleeps: List[float] = []

    def monotonic(self) -> float:
        return self.current_time

    def sleep(self, duration: float) -> None:
        self.sleeps.append(duration)
        self.current_time += duration


class TestBackoffTimingAndJitter:
    """Stress tests verifying backoff progression and jitter on 429 and 503."""

    def test_request_exponential_backoff_timing_and_jitter(self):
        """
        _request backoff follows formula: (backoff_factor * (2 ** attempt)) + jitter
        where backoff_factor=1.5 and jitter in [0.0, 0.5].
        """
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()
            mock_res = MagicMock()
            mock_res.status_code = 429
            mock_res.headers = {}
            with patch.object(client.session, "request", return_value=mock_res):
                client._request("GET", f"{MANGADEX_API}/manga", max_retries=4)

        # 4 retries in loop means 4 backoff sleeps recorded
        assert len(clock.sleeps) == 4, f"Expected 4 sleep calls, got {len(clock.sleeps)}"

        expected_bases = [1.5 * (2 ** att) for att in range(4)]  # [1.5, 3.0, 6.0, 12.0]
        for idx, (actual, base) in enumerate(zip(clock.sleeps, expected_bases)):
            # actual must be in [base, base + 0.5]
            assert base <= actual <= base + 0.55, (
                f"Attempt {idx}: expected sleep in [{base}, {base + 0.5}], got {actual:.3f}"
            )

    def test_request_503_service_unavailable_backoff(self):
        """503 Service Unavailable triggers identical exponential backoff with jitter."""
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()
            mock_res = MagicMock()
            mock_res.status_code = 503
            mock_res.headers = {}
            with patch.object(client.session, "request", return_value=mock_res):
                client._request("GET", f"{MANGADEX_API}/manga", max_retries=3)

        assert len(clock.sleeps) == 3
        for att, duration in enumerate(clock.sleeps):
            base = 1.5 * (2 ** att)
            assert base <= duration <= base + 0.55, (
                f"Attempt {att}: expected sleep in [{base}, {base + 0.5}], got {duration:.3f}"
            )

    def test_request_respects_retry_after_numeric(self):
        """When Retry-After header is provided (e.g., '4'), sleep uses Retry-After + jitter."""
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()
            mock_res = MagicMock()
            mock_res.status_code = 429
            mock_res.headers = {"Retry-After": "4"}
            with patch.object(client.session, "request", return_value=mock_res):
                client._request("GET", f"{MANGADEX_API}/manga", max_retries=2)

        assert len(clock.sleeps) == 2
        for duration in clock.sleeps:
            assert 4.0 <= duration <= 4.55, (
                f"Expected sleep in [4.0, 4.5], got {duration:.3f}"
            )
    def test_request_retry_after_zero_and_malformed(self):
        """
        Retry-After = '0' must sleep in [0.0, 0.5].
        Non-numeric Retry-After must safely fallback to exponential backoff without crashing.
        """
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()

            # Case 1: Retry-After = '0'
            mock_res = MagicMock()
            mock_res.status_code = 429
            mock_res.headers = {"Retry-After": "0"}
            with patch.object(client.session, "request", return_value=mock_res):
                client._request("GET", f"{MANGADEX_API}/manga", max_retries=1)

            assert len(clock.sleeps) == 1
            assert 0.0 <= clock.sleeps[0] <= 0.55

            # Case 2: Non-numeric Retry-After = 'Wed, 21 Oct 2026 07:28:00 GMT'
            clock.sleeps.clear()
            mock_res.headers = {"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}
            with patch.object(client.session, "request", return_value=mock_res):
                client._request("GET", f"{MANGADEX_API}/manga", max_retries=1)

            assert len(clock.sleeps) == 1
            # Fallback to exponential backoff attempt 0: base 1.5 in [1.5, 2.0]
            assert 1.5 <= clock.sleeps[0] <= 2.05

    def test_get_chapter_pages_info_backoff_timing(self):
        """
        get_chapter_pages_info applies (2.0 * (attempt + 1)) + jitter
        on 429 and 503.
        """
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()
            mock_res = MagicMock()
            mock_res.status_code = 503
            mock_res.headers = {}
            with patch.object(client.session, "get", return_value=mock_res):
                with pytest.raises(RuntimeError, match="No se pudo obtener información"):
                    client.get_chapter_pages_info("dummy-chapter-id", max_retries=3)

        assert len(clock.sleeps) == 3
        expected_bases = [2.0 * (att + 1) for att in range(3)]  # [2.0, 4.0, 6.0]
        for att, (actual, base) in enumerate(zip(clock.sleeps, expected_bases)):
            assert base <= actual <= base + 0.55, (
                f"Attempt {att}: expected in [{base}, {base + 0.5}], got {actual:.3f}"
            )

    def test_jitter_variance_distribution(self):
        """Simulated jitter across multiple calls exhibits positive variance (not static)."""
        clock = VirtualClock()
        with patch("time.monotonic", side_effect=clock.monotonic), patch("time.sleep", side_effect=clock.sleep):
            client = MangaDexClient()
            mock_res = MagicMock()
            mock_res.status_code = 429
            mock_res.headers = {"Retry-After": "1"}
            with patch.object(client.session, "request", return_value=mock_res):
                for _ in range(15):
                    client._request("GET", f"{MANGADEX_API}/manga", max_retries=1)

        jitters = [d - 1.0 for d in clock.sleeps]
        assert all(0.0 <= j <= 0.5001 for j in jitters)
        # Check variance > 0
        mean = sum(jitters) / len(jitters)
        variance = sum((j - mean) ** 2 for j in jitters) / len(jitters)
        assert variance > 0.005, f"Jitter had negligible variance: {variance}"


# ==============================================================================
# Category 3: Thread Safety & Contention in TokenBucketRateLimiter.acquire()
# ==============================================================================

class TestTokenBucketThreadSafety:
    """Stress tests verifying absence of race conditions and deadlocks."""

    def test_high_contention_no_token_double_spending(self):
        """
        40 concurrent threads requesting tokens simultaneously with rapid rate.
        Total acquired must strictly match count of successful acquires,
        and tokens balance must never become negative.
        """
        rate = 100.0  # Fast rate for stress test execution
        capacity = 20.0
        limiter = TokenBucketRateLimiter(rate=rate, capacity=capacity)

        success_count = 0
        lock = threading.Lock()
        threads = []

        def worker():
            nonlocal success_count
            for _ in range(5):
                ok = limiter.acquire(1.0, timeout=1.0)
                if ok:
                    with lock:
                        success_count += 1

        for _ in range(20):  # 20 threads * 5 = 100 requests total
            t = threading.Thread(target=worker)
            threads.append(t)
            t.start()

        for t in threads:
            t.join(timeout=5.0)

        assert success_count == 100, f"Expected 100 acquisitions, got {success_count}"
        assert limiter.tokens >= 0.0, f"Token balance corrupted: {limiter.tokens}"

    def test_acquire_timeout_under_contention_does_not_corrupt_state(self):
        """
        When threads time out, the internal bucket state remains consistent
        and uncorrupted.
        """
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=1.0)
        # Drain token
        assert limiter.acquire(1.0) is True

        timed_out_count = 0
        lock = threading.Lock()

        def timeout_worker():
            nonlocal timed_out_count
            # Extremely short timeout (0.01s) when token takes 1.0s to refill
            ok = limiter.acquire(1.0, timeout=0.01)
            if not ok:
                with lock:
                    timed_out_count += 1

        threads = [threading.Thread(target=timeout_worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=1.0)

        assert timed_out_count == 10, "All 10 short-timeout threads should have timed out"
        # State should be valid
        assert limiter.tokens >= 0.0
        assert limiter.available_tokens <= 1.0


# ==============================================================================
# Category 4: Edge Cases and Decoupling Verification
# ==============================================================================

class TestEdgeCasesAndDecoupling:
    """Boundary conditions and architectural decoupling verification."""

    def test_acquire_zero_tokens_returns_immediately(self):
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        # Drain all tokens
        for _ in range(4):
            limiter.acquire(1.0)

        # Acquiring 0 tokens should succeed immediately without waiting
        t0 = time.monotonic()
        assert limiter.acquire(0.0, timeout=0.05) is True
        assert (time.monotonic() - t0) < 0.02

    def test_acquire_tokens_exceeding_capacity_with_timeout_fails_cleanly(self):
        """Requesting more tokens than capacity must return False within timeout."""
        limiter = TokenBucketRateLimiter(rate=4.0, capacity=4.0)
        t0 = time.monotonic()
        result = limiter.acquire(10.0, timeout=0.1)
        elapsed = time.monotonic() - t0
        assert result is False
        assert elapsed < 0.2

    def test_page_downloads_do_not_consume_api_rate_limiter(self):
        """
        MangaDexClient.download_page targets CDN / @Home nodes and must NEVER
        consume tokens from the API rate limiter (TokenBucket).
        """
        client = MangaDexClient()
        initial_tokens = client.rate_limiter.available_tokens

        mock_res = MagicMock()
        mock_res.status_code = 200
        mock_res.content = b"x" * 2048

        with patch.object(client.session, "get", return_value=mock_res):
            for _ in range(10):
                content = client.download_page(
                    base_url="https://athome.node",
                    ch_hash="test-hash",
                    page_name="001.jpg"
                )
                assert len(content) == 2048

        # Tokens in rate_limiter must be completely unconsumed
        assert client.rate_limiter.available_tokens >= initial_tokens - 0.05


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
