"""Contract-enforcement tests: the engine must never crash on bad input."""
from coach.coach_engine import CoachEngine, validate_signal, VALID_TIERS, VALID_CHANNELS


def test_clean_event_produces_valid_action():
    eng = CoachEngine()
    a = eng.process({"event_type": "select", "step": "tariff", "value": "optimal"})
    assert a["action_tier"] in VALID_TIERS
    assert a["channel"] in VALID_CHANNELS
    assert a["reason"]                      # mandatory, never empty
    assert "belief" in a


def test_garbage_event_degrades_not_crashes():
    eng = CoachEngine()
    for bad in [{}, {"event_type": "xyz", "step": "??"}, {"step": "tariff"},
                "not a dict", None, {"event_type": "dwell", "step": "tariff",
                                     "dwell_ms": "lots"}]:
        a = eng.process(bad)
        assert a["action_tier"] == "silent"       # safe no-op
        assert a["reason"]


def test_wall_violation_is_flagged_and_blocked():
    eng = CoachEngine()
    a = eng.process({"event_type": "select", "step": "tariff", "segment": "S2"})
    assert a["action_tier"] == "silent"
    assert "WALL VIOLATION" in a["reason"]


def test_validate_signal_catches_nav_range():
    r = validate_signal({"event_type": "back", "step": "tariff", "nav_vector": 9})
    assert not r.ok
    assert any("nav_vector" in i for i in r.issues)


def test_out_of_scope_routing():
    eng = CoachEngine()
    # first event select premium (out-of-scope)
    a1 = eng.process({"event_type": "select", "step": "tariff", "value": "premium"})
    assert a1["action_tier"] == "active"
    assert a1["channel"] == "handoff"
    assert a1.get("scope_exit") is True
    assert "scope_exit" in a1["reason"]

    # second event
    a2 = eng.process({"event_type": "back", "step": "tariff", "nav_vector": -1})
    assert a2["action_tier"] == "silent"
    assert a2["channel"] == "none"
    assert "out-of-scope" in a2["reason"]
