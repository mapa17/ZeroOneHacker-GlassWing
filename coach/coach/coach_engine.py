"""
coach_engine.py — the contract-enforcing wrapper.

The single entry point for the live pipeline. Takes a raw SignalEvent dict,
validates it against the frozen §1 schema, runs the estimator + policy, and
returns a structurally-guaranteed §2 ActionObject.

DESIGN RULE: this class NEVER raises on bad input. A malformed event during
tomorrow's live run must degrade to a safe no-op (silent action), not crash
the pipeline. All validation failures are caught, logged into the action's
`reason`, and swallowed.

Stat-blind (THE WALL): consumes behaviour only; never reads personas.json.
"""
from dataclasses import dataclass, field
from typing import Optional
from .estimator import BayesianCoachEstimator, STATES
from .likelihood import event_to_likelihood
from .policy import decide

# --- frozen enums (the §1 / §2 contracts, hardcoded) ----------------------
VALID_STEPS = {
    "coverage", "whom", "personal", "tariff", "addons",
    "person", "history", "finalprice", "closing",
}
VALID_EVENTS = {
    "enter", "dwell", "hover", "toggle", "back", "select",
    "field_edit", "tab_blur", "chat_msg", "exit",
}
VALID_EDIT_QUALITY = {"clean", "hesitant", "corrected", None}
VALID_TIERS = {"silent", "ambient", "inline", "prompted", "active"}
VALID_CHANNELS = {"none", "tooltip", "inline", "chat", "handoff", "save_progress"}
VALID_TONES = {"step_back", "low_pressure", "warm_concrete", "reassure",
               "cold_factual", "warm_exit", "neutral"}


@dataclass
class ValidationResult:
    ok: bool
    issues: list = field(default_factory=list)


def validate_signal(ev: dict) -> ValidationResult:
    """Check a SignalEvent against the §1 contract. Returns issues, never raises."""
    issues = []
    if not isinstance(ev, dict):
        return ValidationResult(False, ["event is not a dict"])

    et = ev.get("event_type")
    if et not in VALID_EVENTS:
        issues.append(f"unknown event_type={et!r}")

    step = ev.get("step")
    if step not in VALID_STEPS:
        issues.append(f"unknown step={step!r}")

    # type checks on optional fields, only if present
    if "dwell_ms" in ev and not isinstance(ev["dwell_ms"], (int, float)):
        issues.append("dwell_ms not numeric")
    if "nav_vector" in ev and ev["nav_vector"] not in (-1, 0, 1):
        issues.append(f"nav_vector out of range: {ev.get('nav_vector')!r}")
    if et == "field_edit" and ev.get("edit_quality") not in VALID_EDIT_QUALITY:
        issues.append(f"bad edit_quality={ev.get('edit_quality')!r}")

    # THE WALL — a label must never arrive in the stream
    for forbidden in ("persona", "segment", "label", "true_state"):
        if forbidden in ev:
            issues.append(f"WALL VIOLATION: '{forbidden}' present in signal")

    return ValidationResult(len(issues) == 0, issues)


def _safe_action(belief_dict, reason) -> dict:
    """A guaranteed-valid silent ActionObject for degraded/error cases."""
    return {
        "action_tier": "silent", "channel": "none", "message": None,
        "reason": reason, "belief": belief_dict, "support_tone": "neutral",
    }


def validate_action(action: dict) -> dict:
    """Final structural guarantee on the §2 ActionObject before it leaves."""
    if action.get("action_tier") not in VALID_TIERS:
        action["action_tier"] = "silent"
        action["channel"] = "none"
        action["reason"] = f"[coerced] invalid tier -> silent | {action.get('reason','')}"
    if action.get("channel") not in VALID_CHANNELS:
        action["channel"] = "none"
    if not action.get("reason"):
        action["reason"] = "[no reason supplied]"   # reason is mandatory
    if "belief" not in action:
        action["belief"] = {s: 0.2 for s in STATES}
    if action.get("support_tone") not in VALID_TONES:
        action["support_tone"] = "neutral"
    return action


from .contracts import OUT_OF_SCOPE_VALUES as _OOS_RAW

OUT_OF_SCOPE_VALUES = set(_OOS_RAW)


def is_out_of_scope_event(ev: dict) -> bool:
    v = str(ev.get("value") or "").lower()
    et = ev.get("event_type")
    if et == "select" and v in OUT_OF_SCOPE_VALUES:
        return True
    if et == "toggle" and v == "krankenhaus":
        return True
    # prior private insurance branch -> advisor (field carries its key in `target`)
    if et == "field_edit" and ev.get("target") == "privatVersichert7" and v == "ja":
        return True
    return False


class CoachEngine:
    """One engine per session. Feed it events; get back validated actions."""

    def __init__(self, alpha: float = 0.1, floor: float = 0.1):
        self.est = BayesianCoachEstimator(alpha=alpha, floor=floor)
        self.history: list = []          # [{top, step}] — for trajectory seg-lean
        self.session_id: Optional[str] = None
        self.routed_out_of_scope = False

    def process(self, ev: dict) -> dict:
        """Raw SignalEvent dict -> validated ActionObject. Never raises."""
        try:
            self.session_id = self.session_id or (ev.get("session_id") if isinstance(ev, dict) else None)

            v = validate_signal(ev)
            if not v.ok:
                # degrade safely — update nothing, return silent with the reason
                return validate_action(_safe_action(
                    self.est.as_dict(),
                    "INVALID SIGNAL -> no-op | " + "; ".join(v.issues)))

            # valid event: update belief, derive seg-lean, decide
            self.est.update(event_to_likelihood(ev))
            self.history.append({"top": self.est.top, "step": ev.get("step")})

            # scope boundary (track §4): route out-of-scope users to an advisor ONCE,
            # then stay silent. This is a clean exit, NOT a coaching win or a conversion.
            if self.routed_out_of_scope:
                return validate_action(_safe_action(
                    self.est.as_dict(),
                    "out-of-scope: already routed to advisor; coach silent"
                ))

            if is_out_of_scope_event(ev):
                self.routed_out_of_scope = True
                return validate_action({
                    "action_tier": "active",
                    "channel": "handoff",
                    "scope_exit": True,
                    "message": "This option needs a quick word with an advisor — I'll connect you, and everything you've entered is saved.",
                    "reason": f"scope_exit: out-of-scope selection at {ev.get('step')} (value={ev.get('value')!r}); route to advisor, no coaching (not a conversion)",
                    "belief": self.est.as_dict(),
                    "support_tone": "neutral"
                })

            seg = self._infer_seg_lean()
            price_gap = ev.get("step") == "finalprice"
            action = decide(self.est, ev.get("step"), seg, price_gap)
            return validate_action(action)

        except Exception as e:                       # last-resort safety net
            return validate_action(_safe_action(
                self.est.as_dict(), f"ENGINE ERROR -> safe no-op | {type(e).__name__}: {e}"))

    def _infer_seg_lean(self) -> Optional[str]:
        steps_in_order, tops_by_step = [], {}
        for h in self.history:
            if h["step"] not in steps_in_order:
                steps_in_order.append(h["step"])
            tops_by_step.setdefault(h["step"], set()).add(h["top"])
        first3 = steps_in_order[:3]
        if any("overwhelmed" in tops_by_step.get(s, set()) for s in first3):
            return "S3"
        last_top = self.history[-1]["top"] if self.history else None
        last_step = steps_in_order[-1] if steps_in_order else None
        if last_top == "abandoning" and last_step == "finalprice":
            return "S2"
        if any(h["top"] == "abandoning" for h in self.history) and "tariff" in steps_in_order:
            return "S1"
        return None
