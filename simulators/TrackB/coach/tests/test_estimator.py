"""Smoke tests for the estimator invariants. Run: python -m pytest tests/ -q"""
import numpy as np
from coach import BayesianCoachEstimator, event_to_likelihood


def test_belief_sums_to_one():
    est = BayesianCoachEstimator()
    for _ in range(20):
        est.update(np.random.rand(5))
        assert abs(est.belief.sum() - 1.0) < 1e-9


def test_no_permanent_collapse():
    """Fire 'abandoning' repeatedly, then a 'ready' signal — belief must recover."""
    est = BayesianCoachEstimator()
    aband = event_to_likelihood({"event_type": "hover", "target": "cancel_button"})
    for _ in range(10):
        est.update(aband)
    assert est.belief[3] > 0   # 'ready' never hit exactly zero (floor + decay)
    ready = event_to_likelihood({"event_type": "select"})
    for _ in range(5):
        est.update(ready)
    assert est.top == "ready"  # recovered


def test_unknown_event_is_noop():
    est = BayesianCoachEstimator()
    before = est.belief.copy()
    est.update(event_to_likelihood({"event_type": "nonsense"}))
    assert np.allclose(est.belief, before, atol=1e-9)


def test_dwell_ratio_not_absolute():
    """30s is stalled on a yes/no step but normal on a dense step."""
    from coach.likelihood import _dwell_key
    assert _dwell_key(30000, "whom") == "dwell_stalled"
    assert _dwell_key(30000, "person") in ("dwell_normal", "dwell_slow")
