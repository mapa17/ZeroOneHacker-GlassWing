"""
Bayesian state estimator — the coach's coding instrument.

Maintains a belief distribution over 5 mental states and updates it per
telemetry event. THE WALL: this module is stat-blind. It reads behaviour
only — never personas.json, never NPS, never a segment label. Identity
emerges from the trajectory; it is never supplied.

Spec: interfaces.md §3.
"""
import numpy as np

from .contracts import STATES


class BayesianCoachEstimator:
    def __init__(self, alpha: float = 0.1, floor: float = 0.1):
        self.alpha = alpha          # decay-to-uniform weight
        self.floor = floor          # likelihood floor (anti-collapse)
        self.belief = np.full(5, 0.2)
        self._uniform = np.full(5, 0.2)

    def update(self, likelihood: np.ndarray) -> dict:
        """One Bayesian update. likelihood = P(signal | state), length-5."""
        clamped = np.clip(likelihood, self.floor, 1.0)
        raw = self.belief * clamped
        s = raw.sum()
        if s <= 0:                              # all-zero guard (shouldn't happen w/ floor)
            normalized = self._uniform.copy()
        else:
            normalized = raw / s
        # entropy decay: keep estimate responsive to mid-session state change
        self.belief = (1 - self.alpha) * normalized + self.alpha * self._uniform
        return self.as_dict()

    def as_dict(self) -> dict:
        return dict(zip(STATES, self.belief.round(4)))

    @property
    def top(self) -> str:
        return STATES[int(np.argmax(self.belief))]

    @property
    def confidence(self) -> float:
        """How peaked the belief is: 0 = uniform, 1 = certain. Normalised gap
        between top state and uniform (0.2)."""
        return float((self.belief.max() - 0.2) / 0.8)

    def reset(self):
        self.belief = self._uniform.copy()
