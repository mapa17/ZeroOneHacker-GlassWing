"""
Fake signal emitter (STUB — teammate #2's real LLM personas replace this).

Three scripted journeys matching each persona's documented drop pattern.
Emits §1 signal events. CRITICAL: no segment/state label in any event — THE WALL.
The seg_lean returned alongside is the GROUND TRUTH for eval only; it is NOT
passed to the estimator.
"""

# Each entry: (event_dict, ground_truth_state) — ground truth used by eval only.

FRANZ = [   # fast, confident, then late abandon-spike at final price (price-trust breach)
    ({"event_type": "enter", "step": "coverage"}, "orienting"),
    ({"event_type": "dwell", "step": "coverage", "dwell_ms": 2000}, "ready"),
    ({"event_type": "select", "step": "coverage"}, "ready"),
    ({"event_type": "enter", "step": "whom"}, "ready"),
    ({"event_type": "dwell", "step": "whom", "dwell_ms": 1500}, "ready"),
    ({"event_type": "select", "step": "whom"}, "ready"),
    ({"event_type": "enter", "step": "personal"}, "ready"),
    ({"event_type": "dwell", "step": "personal", "dwell_ms": 5000}, "ready"),
    ({"event_type": "select", "step": "personal", "value": "done"}, "ready"),
    ({"event_type": "enter", "step": "tariff"}, "evaluating"),
    ({"event_type": "dwell", "step": "tariff", "dwell_ms": 7000}, "evaluating"),
    ({"event_type": "toggle", "step": "tariff", "target": "optimal_row"}, "evaluating"),
    ({"event_type": "select", "step": "tariff", "value": "optimal"}, "ready"),
    ({"event_type": "enter", "step": "addons"}, "ready"),
    ({"event_type": "dwell", "step": "addons", "dwell_ms": 4000}, "ready"),
    ({"event_type": "select", "step": "addons"}, "ready"),
    ({"event_type": "enter", "step": "person"}, "ready"),
    ({"event_type": "dwell", "step": "person", "dwell_ms": 10000}, "ready"),
    ({"event_type": "select", "step": "person"}, "ready"),
    ({"event_type": "enter", "step": "history"}, "ready"),
    ({"event_type": "dwell", "step": "history", "dwell_ms": 3000}, "ready"),
    ({"event_type": "select", "step": "history"}, "ready"),
    ({"event_type": "enter", "step": "finalprice"}, "abandoning"),
    ({"event_type": "dwell", "step": "finalprice", "dwell_ms": 35000}, "abandoning"),
    ({"event_type": "hover", "step": "finalprice", "target": "cancel_button"}, "abandoning"),
    ({"event_type": "back", "step": "finalprice"}, "abandoning"),
]

JUDITH = [  # late spike after advisory-locked tariff hover without ever peaking to high confidence
    ({"event_type": "enter", "step": "coverage"}, "orienting"),
    ({"event_type": "dwell", "step": "coverage", "dwell_ms": 4500}, "orienting"),
    ({"event_type": "select", "step": "coverage"}, "orienting"),
    ({"event_type": "enter", "step": "whom"}, "orienting"),
    ({"event_type": "dwell", "step": "whom", "dwell_ms": 3000}, "orienting"),
    ({"event_type": "select", "step": "whom"}, "orienting"),
    ({"event_type": "enter", "step": "personal"}, "orienting"),
    ({"event_type": "dwell", "step": "personal", "dwell_ms": 10000}, "orienting"),
    ({"event_type": "select", "step": "personal", "value": "done"}, "orienting"),
    ({"event_type": "enter", "step": "tariff"}, "evaluating"),
    ({"event_type": "dwell", "step": "tariff", "dwell_ms": 50000}, "overwhelmed"),
    ({"event_type": "hover", "step": "tariff", "target": "glossary_term"}, "evaluating"),
    ({"event_type": "hover", "step": "tariff", "target": "optplus_row"}, "evaluating"),
    ({"event_type": "hover", "step": "tariff", "target": "premium_row"}, "evaluating"),
    ({"event_type": "back", "step": "tariff"}, "abandoning"),
    ({"event_type": "tab_blur", "step": "tariff"}, "abandoning"),
]

PETER = [   # early overwhelm: stalled dwell + hesitant edits in first ~3 steps
    ({"event_type": "enter", "step": "coverage"}, "overwhelmed"),
    ({"event_type": "dwell", "step": "coverage", "dwell_ms": 25000}, "overwhelmed"),
    ({"event_type": "select", "step": "coverage"}, "overwhelmed"),
    ({"event_type": "enter", "step": "whom"}, "overwhelmed"),
    ({"event_type": "dwell", "step": "whom", "dwell_ms": 15000}, "overwhelmed"),
    ({"event_type": "select", "step": "whom"}, "overwhelmed"),
    ({"event_type": "enter", "step": "personal"}, "overwhelmed"),
    ({"event_type": "dwell", "step": "personal", "dwell_ms": 60000}, "overwhelmed"),
    ({"event_type": "field_edit", "step": "personal", "edit_quality": "hesitant"}, "overwhelmed"),
    ({"event_type": "field_edit", "step": "personal", "edit_quality": "corrected"}, "overwhelmed"),
    ({"event_type": "back", "step": "personal"}, "overwhelmed"),
    ({"event_type": "enter", "step": "tariff"}, "overwhelmed"),
    ({"event_type": "dwell", "step": "tariff", "dwell_ms": 55000}, "overwhelmed"),
    ({"event_type": "hover", "step": "tariff", "target": "phone_icon"}, "abandoning"),
]

PERSONAS = {"franz": (FRANZ, "S2"), "judith": (JUDITH, "S1"), "peter": (PETER, "S3")}
