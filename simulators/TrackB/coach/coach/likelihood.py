"""
Likelihood mapper — turns a §1 signal event into a P(signal | state) vector.

Discrete events map directly. Continuous dwell is log-binned on the RATIO to
each step's baseline (not raw ms) — which is also what defends the annoyance
metric: a slow-but-fine reader on a dense step reads as 'normal', not 'stalled'.

Matrix is HAND-SET and "directionally right", not learned — every cell is
explainable. Stat-blind: nothing here reads personas.json.

State order: [orienting, evaluating, overwhelmed, ready, abandoning]
"""
import numpy as np

from .contracts import LIKELIHOOD as _LIKELIHOOD_RAW, STEP_BASELINE_MS

# --- likelihood matrix: P(signal | state) ---------------------------------
LIKELIHOOD = {k: np.array(v) for k, v in _LIKELIHOOD_RAW.items()}

_NOOP = np.ones(5)   # unknown event -> no update after renormalise


def _dwell_key(dwell_ms: int, step: str) -> str:
    ratio = dwell_ms / STEP_BASELINE_MS.get(step, 8000)
    if ratio < 0.5:
        return "dwell_fast"
    if ratio < 1.5:
        return "dwell_normal"
    if ratio < 4.0:
        return "dwell_slow"
    return "dwell_stalled"


def event_to_likelihood(event: dict) -> np.ndarray:
    """Map one §1 signal event to a likelihood vector. Returns ones() (no-op)
    for anything unrecognised — never zeros."""
    vec = _base_likelihood(event)
    # context boost: abandon signals at the final-price step carry extra weight
    # (Franz's cause is a price-triggered trust breach — encoded, not tuned blindly)
    if event.get("step") == "finalprice" and event.get("event_type") in ("hover", "back"):
        if event.get("event_type") == "back" or event.get("target") == "cancel_button":
            vec = vec.copy()
            vec[4] = min(1.0, vec[4] * 1.3)   # lift P(abandoning)
            vec[1] *= 0.7                       # damp P(evaluating)
    return vec


def _base_likelihood(event: dict) -> np.ndarray:
    et = event.get("event_type")

    if et == "dwell":
        return LIKELIHOOD[_dwell_key(event.get("dwell_ms", 0), event.get("step", ""))]

    if et == "hover":
        tgt = event.get("target")
        if tgt == "cancel_button":
            return LIKELIHOOD["hover_cancel"]
        if tgt in ("optplus_row", "premium_row"):
            return LIKELIHOOD["hover_advisory"]
        if tgt == "glossary_term":
            return LIKELIHOOD["hover_glossary"]
        if tgt == "phone_icon":
            return LIKELIHOOD["hover_phone"]
        return _NOOP

    if et == "back":
        return LIKELIHOOD["back_nav"]
    if et == "toggle":
        return LIKELIHOOD["toggle_tariff"]
    if et == "select":
        return LIKELIHOOD["select"]
    if et == "tab_blur":
        return LIKELIHOOD["tab_blur"]
    if et == "field_edit":
        q = event.get("edit_quality", "clean")
        return LIKELIHOOD.get(f"edit_{q}", LIKELIHOOD["edit_clean"])

    return _NOOP
