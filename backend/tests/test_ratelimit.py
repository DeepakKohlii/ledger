from app.core.ratelimit import SlidingWindow


def test_allows_up_to_the_limit():
    window = SlidingWindow(limit=3, window_seconds=60)
    assert [window.check("a", now=t) for t in (0, 1, 2)] == [None, None, None]


def test_blocks_past_the_limit():
    window = SlidingWindow(limit=3, window_seconds=60)
    for t in (0, 1, 2):
        window.check("a", now=t)
    assert window.check("a", now=3) is not None


def test_reports_how_long_to_wait():
    window = SlidingWindow(limit=2, window_seconds=60)
    window.check("a", now=0)
    window.check("a", now=0)
    assert window.check("a", now=10) == 50.0


def test_window_slides_so_old_attempts_expire():
    window = SlidingWindow(limit=2, window_seconds=60)
    window.check("a", now=0)
    window.check("a", now=1)
    assert window.check("a", now=30) is not None
    # Both early attempts have aged out by now.
    assert window.check("a", now=62) is None


def test_keys_are_counted_separately():
    window = SlidingWindow(limit=1, window_seconds=60)
    assert window.check("a", now=0) is None
    assert window.check("b", now=0) is None
    assert window.check("a", now=1) is not None


def test_success_clears_the_count():
    window = SlidingWindow(limit=2, window_seconds=60)
    window.check("a", now=0)
    window.check("a", now=1)
    window.reset("a")
    assert window.check("a", now=2) is None
