"""
jitter.py — perturbation library for the variance sweep.

Maps a noise index n to three failure modes and applies them to a §1 signal
stream. Used by both stages (Stage 1 light, Stage 2 rich). Truth labels are
NEVER perturbed (THE WALL): jitter touches behaviour only.

Noise grid (locked):
    n     drop   spurious   dwell-var    UX profile
    0.0    0%      0%        ±15%         sterile baseline
    0.1   10%     10%        ±20%         normal click friction
    0.2   20%     20%        ±25%         distracted multi-tasking
    0.3   30%     30%        ±30%         high hesitation / mis-clicks
    0.5   50%     50%        ±40%         layout chaos / data loss

Spurious events are deliberately IN-SCOPE noise only (accidental back-clicks,
exit hovers, hesitant edits). They never inject an out-of-scope `select`, so
jitter stresses the estimator WITHOUT spuriously tripping scope routing — a
noise-induced scope route is therefore a real error worth measuring, not an
artefact of the jitter itself.
"""
import numpy as np

NOISE_GRID = [0.0, 0.1, 0.2, 0.3, 0.5]


def noise_profile(n: float) -> dict:
    """n -> {drop_prob, spurious_rate, dwell_var}. dwell_var = 0.15 + 0.5*n."""
    return {"drop_prob": n, "spurious_rate": n, "dwell_var": 0.15 + 0.5 * n}


# spurious event factories — all §1-valid, all IN-SCOPE noise
_SPURIOUS = (
    {"event_type": "back", "nav_vector": -1},                 # accidental back-click
    {"event_type": "hover", "target": "cancel_button"},       # spurious exit hover
    {"event_type": "hover", "target": "phone_icon"},          # spurious exit hover
)


def _spurious_event(step, rng) -> dict:
    ev = dict(_SPURIOUS[rng.integers(len(_SPURIOUS))])
    ev["step"] = step
    return ev


def apply_jitter(events, n, rng, min_keep: int = 2):
    """events: list of (signal_event, truth). Returns a jittered list of the
    same shape. Drop / dwell-jitter / hesitant-edit-flip / spurious-injection
    all scale with n. A spurious event inherits the CURRENT truth (a mis-click
    does not change the user's underlying state)."""
    prof = noise_profile(n)
    out = []
    for ev, truth in events:
        if rng.random() < prof["drop_prob"]:
            continue                                          # dropped signal
        ev = dict(ev)
        if "dwell_ms" in ev:
            f = 1 + rng.uniform(-prof["dwell_var"], prof["dwell_var"])
            ev["dwell_ms"] = max(500, int(ev["dwell_ms"] * f))
        if ev.get("event_type") == "field_edit" and rng.random() < prof["spurious_rate"]:
            ev["edit_quality"] = "hesitant" if rng.random() < 0.5 else "corrected"
        out.append((ev, truth))
        if rng.random() < prof["spurious_rate"]:              # inject noise after
            out.append((_spurious_event(ev.get("step"), rng), truth))
    if len(out) < min_keep:                                   # never starve the engine
        out = [(dict(ev), truth) for ev, truth in events[:min_keep]]
    return out
