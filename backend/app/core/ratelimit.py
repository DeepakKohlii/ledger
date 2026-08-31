import threading
import time
from collections import defaultdict, deque


class SlidingWindow:
    """Counts attempts per key inside a moving time window.

    Deliberately in process: this service runs as a single instance, and an
    in-memory counter needs no extra dependency and no network call on the
    login path. Across several instances each would keep its own count, so a
    shared store would be the next step rather than a rewrite.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, now: float | None = None) -> float | None:
        """Record an attempt. Returns seconds to wait if the key is over limit."""
        moment = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            while hits and moment - hits[0] > self.window:
                hits.popleft()

            if len(hits) >= self.limit:
                return round(self.window - (moment - hits[0]), 1)

            hits.append(moment)
            return None

    def reset(self, key: str) -> None:
        """Forget a key's attempts, called once a login succeeds."""
        with self._lock:
            self._hits.pop(key, None)
