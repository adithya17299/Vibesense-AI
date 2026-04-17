import cv2
import numpy as np


class FrameStabilizer:
    """ECC-based video stabilization to cancel camera shake.
    Optimized: runs ECC at quarter resolution with minimal iterations."""

    def __init__(self):
        self.prev_gray = None
        self.warp_matrix = np.eye(2, 3, dtype=np.float32)
        self.criteria = (
            cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
            8,     # max iterations (reduced for speed)
            0.01   # epsilon (relaxed — converges faster)
        )

    def stabilize(self, frame: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if self.prev_gray is None:
            self.prev_gray = gray
            return frame

        try:
            # Downscale to quarter resolution for faster ECC computation
            h, w = gray.shape
            small_gray = cv2.resize(gray, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
            small_prev = cv2.resize(self.prev_gray, (w // 4, h // 4), interpolation=cv2.INTER_AREA)

            _, warp = cv2.findTransformECC(
                small_prev,
                small_gray,
                self.warp_matrix.copy(),
                cv2.MOTION_TRANSLATION,
                self.criteria
            )
            # Scale translation back to full resolution
            warp[0, 2] *= 4.0
            warp[1, 2] *= 4.0

            stabilized = cv2.warpAffine(
                frame, warp, (frame.shape[1], frame.shape[0]),
                flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP
            )
        except cv2.error:
            stabilized = frame

        self.prev_gray = gray
        return stabilized

    def reset(self):
        self.prev_gray = None
        self.warp_matrix = np.eye(2, 3, dtype=np.float32)
