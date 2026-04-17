import collections
import numpy as np


class HealthScorer:
    """Computes a 0-100 structural health score per frame, smoothed."""

    def __init__(self, window: int = 10):
        self.window = window
        self.history = collections.deque(maxlen=window)

    def compute(self, rms: float, threat_level: str, max_rms: float = 2.0) -> float:
        """
        score = 100 - (normalized_rms * 60) - threat_penalty
        Clamped [0, 100], then rolling-averaged.
        """
        normalized = min(rms / max_rms, 1.0) if max_rms > 0 else 0.0
        penalty = {"NORMAL": 0, "WARNING": 15, "DANGER": 35}.get(threat_level, 0)
        raw = 100.0 - (normalized * 60.0) - penalty
        raw = max(0.0, min(100.0, raw))
        self.history.append(raw)
        return round(np.mean(self.history), 1)

    def reset(self):
        self.history.clear()
