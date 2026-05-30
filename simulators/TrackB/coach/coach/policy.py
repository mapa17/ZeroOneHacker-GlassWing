"""
Decision policy — maps inferred state to an action.

Input:  belief (from estimator) + journey step + trajectory-derived segment lean
Output: §2 action object (action_tier, channel, message, reason, belief)

Silence is a first-class action. Over-firing is the failure mode.

Segment priors here are [DESIGNED] — encoded segment facts from personas.json
that shape the RESPONSE after a state is inferred. They never enter the
estimator (THE WALL). The policy is told the state by behaviour; the stats only
colour how it replies.
"""
from .estimator import STATES

from .contracts import SEGMENT_PRIOR as _SEG_PRIOR, CONF_GATE, LOW_CONF_EXIT

# trajectory lean -> tolerances. [DESIGNED] from personas.json, response-layer only.
SEGMENT_PRIOR = {(None if k == "None" else k): v for k, v in _SEG_PRIOR.items()}


def _support_tone(state: str, seg_lean: str | None, prior: dict) -> str:
    """Derived emotional-support tone for the chosen action. [DESIGNED] from
    segment profile — articulates the tone behind the action, never overrides
    the tier. Honest: encoded, not affect-detected."""
    if state == "ready":
        return "step_back"            # get out of the way
    if state in ("orienting", "evaluating"):
        return "low_pressure"         # respectful, non-intrusive
    if state == "overwhelmed":
        # low-NPS users (Peter) need concrete help, not brand-warmth
        return "warm_concrete" if prior["nps"] < 0 else "reassure"
    if state == "abandoning":
        # Franz (advisor rejected) gets cold/factual; others get warm exit
        return "cold_factual" if not prior["advisor_ok"] else "warm_exit"
    return "neutral"


def decide(estimator, step: str, seg_lean: str | None, price_gap: bool = False) -> dict:
    """Return a §2 action object. seg_lean is the trajectory-inferred S1/S2/S3
    or None — derived from belief history elsewhere, never from a label."""
    state = estimator.top
    conf = estimator.confidence
    prior = SEGMENT_PRIOR[seg_lean]
    belief = estimator.as_dict()
    tone = _support_tone(state, seg_lean, prior)

    def act(tier, channel, message, reason):
        return {"action_tier": tier, "channel": channel, "message": message,
                "reason": reason, "belief": belief, "support_tone": tone}

    # --- silence gates -----------------------------------------------------
    if conf < CONF_GATE:
        return act("silent", "none", None,
                   f"conf={conf:.2f} below gate {CONF_GATE}; staying dark")
    if state in ("orienting", "evaluating", "ready"):
        if state == "ready":
            return act("silent", "none", None,
                       f"state=ready conf={conf:.2f}; clear friction only, no interruption")
        return act("ambient", "tooltip", "[ambient term hints available]",
                   f"state={state} conf={conf:.2f}; passive cue only")

    # --- overwhelmed (Peter-like) -----------------------------------------
    if state == "overwhelmed":
        return act("prompted", "chat",
                   "This can be a lot — want me to recommend the right option in one line?",
                   f"state=overwhelmed conf={conf:.2f}; simplify + warm offer "
                   f"(NPS={prior['nps']} -> actionable, not brand-warmth)")

    # --- abandoning --------------------------------------------------------
    if state == "abandoning":
        if seg_lean == "S2" and not prior["advisor_ok"]:
            return act("active", "save_progress",
                       "Your final price reflects your health profile. Save your "
                       "progress and finish whenever — no call needed.",
                       f"state=abandoning S2-lean conf={conf:.2f}; price_gap={price_gap}; "
                       f"save_progress not advisor (segment rejects advisor)")
        return act("active", "chat",
                   "Looks like something's holding you up — can I help you finish this here?",
                   f"state=abandoning conf={conf:.2f}; earned interruption; "
                   f"advisor_ok={prior['advisor_ok']}")

    return act("silent", "none", None, f"no rule matched state={state}")
