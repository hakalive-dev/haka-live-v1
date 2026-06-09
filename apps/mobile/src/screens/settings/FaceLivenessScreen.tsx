import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch } from "react-redux";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type CameraRef,
} from "react-native-vision-camera";
import {
  createFaceDetectorOutput,
  type Face,
} from "react-native-vision-camera-face-detector";

import { Colors, Radius, Spacing } from "@/theme";
import type { RootStackScreenProps } from "@navigation/types";
import {
  faceVerificationApi,
  type FaceChallenge,
  type FaceChallengeKey,
} from "@/api/faceVerification";
import { authApi } from "@/api/auth";
import { setUser } from "@/store/authSlice";
import {
  createChallengeState,
  getStablePassesRequired,
  isChallengeSatisfied,
  resetChallengeStateForStep,
  type ChallengeDetectorState,
  type FaceLivenessPayload,
} from "@/utils/faceLivenessChallenges";

type Props = RootStackScreenProps<"FaceLiveness">;

const FACE_DETECTION_OPTIONS = {
  performanceMode: "fast" as const,
  runClassifications: true,
  cameraFacing: "front" as const,
};

const THROTTLE_MS = 150;
const PRE_TAKE_PHOTO_DRAIN_MS = 280;

const INVERT_YAW_FOR_FRONT_CAMERA = true;

function mapFacePayload(payload: FaceLivenessPayload) {
  return {
    yawAngle: payload.yaw,
    pitchAngle: payload.pitch,
    rollAngle: payload.roll,
    leftEyeOpenProbability: payload.leftEye,
    rightEyeOpenProbability: payload.rightEye,
    smilingProbability: payload.smile,
  };
}

export function FaceLivenessScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const device = useCameraDevice("front");
  const { hasPermission: cameraGranted, requestPermission } =
    useCameraPermission();
  const cameraRef = useRef<CameraRef>(null);
  // v5 photo capture moved off the Camera ref onto a dedicated photo output.
  // usePhotoOutput() memoizes on stable defaults, so this identity is stable.
  const photoOutput = usePhotoOutput();
  const photoOutputRef = useRef(photoOutput);
  photoOutputRef.current = photoOutput;

  const mountedRef = useRef(true);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const [loading, setLoading] = useState(true);
  /** True while uploading after capture (frame processor stays off). */
  const [uploading, setUploading] = useState(false);
  /** Pauses frame processor during capture + upload. */
  const [pauseDetection, setPauseDetection] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<FaceChallenge[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [statusText, setStatusText] = useState(
    "Position your face in the circle",
  );
  const [debugAngles, setDebugAngles] = useState<{
    yaw: number;
    pitch: number;
    roll: number;
  } | null>(null);

  const challengeStateRef = useRef<ChallengeDetectorState>(
    createChallengeState(),
  );
  const passStreakRef = useRef(0);
  const lastTickRef = useRef(0);
  const lastStatusRef = useRef("");
  const capturingRef = useRef(false);
  const uploadingRef = useRef(false);
  const stepIndexRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const challengesRef = useRef<FaceChallenge[]>([]);

  const current = challenges[stepIndex];

  const setStatusTextIfChanged = useCallback((text: string) => {
    if (lastStatusRef.current === text) return;
    lastStatusRef.current = text;
    setStatusText(text);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
    sessionIdRef.current = sessionId;
    challengesRef.current = challenges;
    challengeStateRef.current = resetChallengeStateForStep(
      challenges[stepIndex]?.key ?? "nod",
    );
    passStreakRef.current = 0;
    setStatusTextIfChanged("Follow the instruction — capture is automatic");
  }, [stepIndex, sessionId, challenges, setStatusTextIfChanged]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await requestPermission();
      if (!mountedRef.current) return;
      if (!perm) {
        Alert.alert(
          "Camera required",
          "Allow camera access to verify your face.",
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
        return;
      }

      const status = await faceVerificationApi.getStatus();
      if (!mountedRef.current) return;
      if (status.status === "approved") {
        Alert.alert("Already verified", "Your face is already certified.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
        return;
      }
      if (status.status === "pending_admin") {
        Alert.alert(
          "Under review",
          "Your verification is waiting for admin approval.",
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
        return;
      }

      const session = await faceVerificationApi.createSession();
      if (!mountedRef.current) return;
      setSessionId(session.sessionId);
      setChallenges(session.challenges);
      setStepIndex(0);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const msg =
        e instanceof Error ? e.message : "Could not start verification";
      Alert.alert("Error", msg, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [navigation, requestPermission]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const captureAndAdvance = useCallback(async () => {
    const sid = sessionIdRef.current;
    const idx = stepIndexRef.current;
    const list = challengesRef.current;
    const step = list[idx];
    if (!sid || !step || capturingRef.current) return;

    const photoOut = photoOutputRef.current;
    if (!photoOut) return;

    capturingRef.current = true;
    setPauseDetection(true);
    setStatusTextIfChanged("Capturing…");

    try {
      await new Promise((resolve) =>
        setTimeout(resolve, PRE_TAKE_PHOTO_DRAIN_MS),
      );
      if (!mountedRef.current || !isFocusedRef.current) return;

      const photoFile = await photoOut.capturePhotoToFile(
        { flashMode: "off", enableShutterSound: false },
        {},
      );
      const uri =
        Platform.OS === "ios"
          ? photoFile.filePath
          : `file://${photoFile.filePath}`;

      setUploading(true);
      uploadingRef.current = true;
      setStatusTextIfChanged("Processing…");

      await faceVerificationApi.uploadFrameFromUri(sid, step.key, uri);

      if (!mountedRef.current) return;

      if (idx + 1 >= list.length) {
        setStatusTextIfChanged(
          "Verifying faces — this can take up to a minute…",
        );
        await faceVerificationApi.submitSession(sid);
        const me = await authApi.getMe();
        if (!mountedRef.current) return;
        dispatch(setUser(me));
        Alert.alert(
          "Submitted",
          "Your face verification was submitted. You will be notified after admin review.",
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
      } else {
        setStepIndex(idx + 1);
        setStatusTextIfChanged("Great! Next instruction…");
      }
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const msg = e instanceof Error ? e.message : "Step failed";
      Alert.alert("Verification failed", msg);
      setStatusTextIfChanged("Try again — follow the instruction");
      passStreakRef.current = 0;
    } finally {
      capturingRef.current = false;
      uploadingRef.current = false;
      setUploading(false);
      if (mountedRef.current && isFocusedRef.current) {
        setPauseDetection(false);
      }
    }
  }, [dispatch, navigation, setStatusTextIfChanged]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setPauseDetection(true);
      };
    }, []),
  );

  const handleFacesDetection = useCallback(
    (facePayloads: FaceLivenessPayload[]) => {
      if (!mountedRef.current || !isFocusedRef.current) return;
      if (capturingRef.current || uploadingRef.current) return;

      const now = Date.now();
      if (now - lastTickRef.current < THROTTLE_MS) return;
      lastTickRef.current = now;

      const step = challengesRef.current[stepIndexRef.current];
      if (!step) return;

      if (!facePayloads.length) {
        passStreakRef.current = 0;
        setStatusTextIfChanged("Move your face into the circle");
        return;
      }

      if (facePayloads.length > 1) {
        passStreakRef.current = 0;
        setStatusTextIfChanged("Only one person in frame");
        return;
      }

      const mapped = mapFacePayload(facePayloads[0]);
      if (__DEV__) {
        setDebugAngles({
          yaw: mapped.yawAngle ?? 0,
          pitch: mapped.pitchAngle ?? 0,
          roll: mapped.rollAngle ?? 0,
        });
      }

      const result = isChallengeSatisfied(
        step.key as FaceChallengeKey,
        mapped,
        challengeStateRef.current,
      );
      challengeStateRef.current = result.nextState;

      if (result.passed) {
        passStreakRef.current += 1;
        setStatusTextIfChanged("Hold still…");
        if (
          passStreakRef.current >=
          getStablePassesRequired(step.key as FaceChallengeKey)
        ) {
          passStreakRef.current = 0;
          void captureAndAdvance();
        }
      } else {
        passStreakRef.current = 0;
        setStatusTextIfChanged(step.label);
      }
    },
    [captureAndAdvance, setStatusTextIfChanged],
  );

  const handleFacesDetectionRef = useRef(handleFacesDetection);
  handleFacesDetectionRef.current = handleFacesDetection;

  // v5: face detection runs natively in a CameraOutput. `onFacesDetected` is a
  // plain JS callback (no worklet / runOnJS bridge needed). Map the native
  // Face[] → FaceLivenessPayload[] and forward to the throttled JS handler,
  // which already bails while capturing/uploading or when the screen is blurred.
  const onFacesDetected = useCallback((faces: Face[]) => {
    const payloads: FaceLivenessPayload[] = [];
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const rawYaw = f.yawAngle ?? 0;
      payloads.push({
        yaw: INVERT_YAW_FOR_FRONT_CAMERA ? -rawYaw : rawYaw,
        pitch: f.pitchAngle ?? 0,
        roll: f.rollAngle ?? 0,
        leftEye: f.leftEyeOpenProbability ?? 1,
        rightEye: f.rightEyeOpenProbability ?? 1,
        smile: f.smilingProbability ?? 0,
      });
    }
    handleFacesDetectionRef.current(payloads);
  }, []);
  const onFacesDetectedRef = useRef(onFacesDetected);
  onFacesDetectedRef.current = onFacesDetected;

  // Create the native detector output exactly once; stable refs keep the
  // callbacks current without recreating the output (which would reconfigure
  // the camera session on every render).
  const faceOutput = useMemo(
    () =>
      createFaceDetectorOutput({
        ...FACE_DETECTION_OPTIONS,
        onFacesDetected: (faces) => onFacesDetectedRef.current(faces),
        onError: () => {},
      }),
    [],
  );

  const cameraOutputs = useMemo(
    () => [photoOutput, faceOutput],
    [photoOutput, faceOutput],
  );

  /** Keep the camera session alive during capture/upload. */
  const cameraSessionActive =
    isFocused && !loading && !!device && cameraGranted;

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!device || !cameraGranted) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Camera unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            setPauseDetection(true);
            navigation.goBack();
          }}
          hitSlop={8}
          style={styles.backBtn}
          disabled={uploading || pauseDetection}
        >
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Face verification</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <Text style={styles.progress}>
          Step {stepIndex + 1} of {challenges.length}
        </Text>

        <View style={styles.stepRow}>
          {challenges.map((c, i) => (
            <View
              key={c.key}
              style={[
                styles.stepDot,
                i < stepIndex && styles.stepDotDone,
                i === stepIndex && styles.stepDotActive,
              ]}
            />
          ))}
        </View>

        <Text style={styles.instruction}>{current?.label ?? ""}</Text>
        <Text style={styles.hint}>{statusText}</Text>
        {__DEV__ && debugAngles && (
          <Text style={styles.debugText}>
            yaw {debugAngles.yaw.toFixed(1)} · pitch{" "}
            {debugAngles.pitch.toFixed(1)} · roll {debugAngles.roll.toFixed(1)}
          </Text>
        )}

        <View style={styles.cameraWrap}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraSessionActive}
            outputs={cameraOutputs}
          />
          <View style={styles.ovalOverlay} pointerEvents="none" />
        </View>

        {(uploading || pauseDetection) && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.uploadingText}>
              {pauseDetection && !uploading ? "Capturing…" : "Processing…"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  errorText: { color: Colors.textSecondary, fontSize: 15 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
  },
  body: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  progress: { fontSize: 13, color: "#666", textAlign: "center" },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: Spacing.sm,
  },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#DDD" },
  stepDotActive: { backgroundColor: Colors.primary, width: 24 },
  stepDotDone: { backgroundColor: Colors.success },
  instruction: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: 14,
    color: Colors.primary,
    textAlign: "center",
    marginBottom: Spacing.md,
    minHeight: 20,
  },
  debugText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  cameraWrap: {
    flex: 1,
    maxHeight: 420,
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: Spacing.lg,
  },
  ovalOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: "rgba(123, 79, 255, 0.85)",
    borderRadius: Radius.full,
    margin: 28,
  },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  uploadingText: { fontSize: 14, color: "#666" },
});
