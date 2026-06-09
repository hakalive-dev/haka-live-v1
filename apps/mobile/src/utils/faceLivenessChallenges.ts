import type { FaceChallengeKey } from "@/api/faceVerification";

/** Plain serializable face metrics passed from the frame-processor worklet to JS. */
export type FaceLivenessPayload = {
  yaw: number;
  pitch: number;
  roll: number;
  leftEye: number;
  rightEye: number;
  smile: number;
};

/** ML Kit / vision-camera-face-detector face shape (subset we use). */
export type DetectedFace = {
  yawAngle?: number;
  pitchAngle?: number;
  rollAngle?: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
};

const YAW_THRESHOLD = 14;
const NOD_DELTA = 10;
/** ML Kit often reports 0.2–0.4 when closed and 0.6+ when open — keep a gap between them. */
const EYE_CLOSED = 0.42;
const EYE_OPEN = 0.5;
const SMILE_MIN = 0.65;

export type ChallengeDetectorState = {
  baselinePitch?: number;
  baselineYaw?: number;
  /** Saw eyes closed during the current blink attempt. */
  sawEyeClosed?: boolean;
  /** Full blink done; keep passing while eyes stay open (for streak counting). */
  blinkReady?: boolean;
};

/** Consecutive frame passes before auto-capture (throttled ~180ms apart). */
export function getStablePassesRequired(key: FaceChallengeKey): number {
  switch (key) {
    case "blink":
      return 2;
    case "smile":
      return 3;
    default:
      return 4;
  }
}

export function createChallengeState(): ChallengeDetectorState {
  return {};
}

/**
 * Returns true when the current frame satisfies the active liveness step.
 * Caller should require consecutive passes (~600ms) before auto-capture.
 */
export function isChallengeSatisfied(
  key: FaceChallengeKey,
  face: DetectedFace,
  state: ChallengeDetectorState,
): { passed: boolean; nextState: ChallengeDetectorState } {
  const yaw = face.yawAngle ?? 0;
  const pitch = face.pitchAngle ?? 0;
  const leftEye = face.leftEyeOpenProbability ?? 1;
  const rightEye = face.rightEyeOpenProbability ?? 1;
  const smile = face.smilingProbability ?? 0;
  const minEyeOpen = Math.min(leftEye, rightEye);

  switch (key) {
    case "nod": {
      if (state.baselinePitch === undefined) {
        return { passed: false, nextState: { ...state, baselinePitch: pitch } };
      }
      const delta = Math.abs(pitch - state.baselinePitch);
      return {
        passed: delta >= NOD_DELTA,
        nextState: state,
      };
    }
    case "turn_left": {
      if (state.baselineYaw === undefined) {
        return { passed: false, nextState: { ...state, baselineYaw: yaw } };
      }
      const delta = state.baselineYaw - yaw;
      return { passed: delta >= YAW_THRESHOLD, nextState: state };
    }
    case "turn_right": {
      if (state.baselineYaw === undefined) {
        return { passed: false, nextState: { ...state, baselineYaw: yaw } };
      }
      const delta = yaw - state.baselineYaw;
      return { passed: delta >= YAW_THRESHOLD, nextState: state };
    }
    case "blink": {
      // Use the more closed eye — blinks are often asymmetric between L/R classifiers.
      const closed = minEyeOpen < EYE_CLOSED;
      const clearlyOpen = minEyeOpen >= EYE_OPEN;

      if (closed) {
        return {
          passed: false,
          nextState: { ...state, sawEyeClosed: true, blinkReady: false },
        };
      }

      if (state.sawEyeClosed && clearlyOpen) {
        return {
          passed: true,
          nextState: { sawEyeClosed: false, blinkReady: true },
        };
      }

      if (state.blinkReady && clearlyOpen) {
        return { passed: true, nextState: state };
      }

      if (state.blinkReady) {
        return { passed: false, nextState: { ...state, blinkReady: false } };
      }

      return { passed: false, nextState: state };
    }
    case "smile":
      return { passed: smile >= SMILE_MIN, nextState: state };
    default:
      return { passed: false, nextState: state };
  }
}

export function resetChallengeStateForStep(
  _key: FaceChallengeKey,
): ChallengeDetectorState {
  return createChallengeState();
}
