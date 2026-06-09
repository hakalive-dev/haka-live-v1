import React, { useState, useCallback } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScroll } from "@components/keyboard";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useDispatch } from "react-redux";

import { authApi } from "@/api/auth";
import { hostApplicationApi } from "@api/hostApplication";
import { TokenStorage } from "@/storage";
import { setAuth } from "@/store/authSlice";
import { Colors, Radius, Spacing } from "@/theme";
import type { RootStackScreenProps } from "@navigation/types";

type Props = RootStackScreenProps<"BecomeHost">;
type Path = "independent" | "with_agent";

export function BecomeHostScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();

  const [selectedPath, setSelectedPath] = useState<Path | null>(null);
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!selectedPath) return;
    setSubmitting(true);
    try {
      if (selectedPath === "independent") {
        await hostApplicationApi.applyIndependent();
        const refreshToken = await TokenStorage.getRefresh();
        if (!refreshToken) {
          throw new Error("Session expired. Please sign in again.");
        }
        const tokens = await authApi.refresh(refreshToken);
        await TokenStorage.setAccess(tokens.accessToken);
        if (tokens.refreshToken)
          await TokenStorage.setRefresh(tokens.refreshToken);
        const me = await authApi.getMe();
        await TokenStorage.setUserJson(JSON.stringify(me));
        dispatch(
          setAuth({
            user: me,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken ?? refreshToken,
          }),
        );
        Alert.alert(
          "You're a host!",
          "You can go live anytime. You are directly under the company — no review step.",
          [
            {
              text: "OK",
              onPress: () => navigation.replace("HostApplicationStatus"),
            },
          ],
        );
      } else {
        if (!agentId.trim()) {
          Alert.alert("Required", "Please enter the agent's User ID.");
          return;
        }
        await hostApplicationApi.applyWithAgent(agentId.trim());
        Alert.alert(
          "Application Submitted!",
          "Your host application has been submitted. You'll be notified once it's reviewed.",
          [
            {
              text: "OK",
              onPress: () => navigation.replace("HostApplicationStatus"),
            },
          ],
        );
      }
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedPath, agentId, navigation, dispatch]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a Host</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScroll contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}>
        {/* Hero */}
        <LinearGradient
          colors={Colors.gradientPurple as [string, string]}
          style={styles.hero}
        >
          <Ionicons name="mic" size={40} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Start Hosting Live</Text>
          <Text style={styles.heroSub}>
            Go live, grow your audience, and earn real income from your streams.
          </Text>
        </LinearGradient>

        {/* Benefits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Host Benefits</Text>
          {BENEFITS.map((b) => (
            <View key={b.label} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon} size={20} color={Colors.primary} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitLabel}>{b.label}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Path selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Your Path</Text>

          <TouchableOpacity
            style={[
              styles.pathCard,
              selectedPath === "independent" && styles.pathCardActive,
            ]}
            onPress={() => setSelectedPath("independent")}
            activeOpacity={0.8}
          >
            <View style={styles.pathCardLeft}>
              <Ionicons
                name="person"
                size={24}
                color={
                  selectedPath === "independent"
                    ? Colors.primary
                    : Colors.textSecondary
                }
              />
              <View style={styles.pathCardText}>
                <Text
                  style={[
                    styles.pathCardTitle,
                    selectedPath === "independent" && { color: Colors.primary },
                  ]}
                >
                  Independent Host
                </Text>
                <Text style={styles.pathCardDesc}>
                  Join directly under the company. Keep 70% of beans you earn;
                  no agency review.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.radioOuter,
                selectedPath === "independent" && styles.radioOuterActive,
              ]}
            >
              {selectedPath === "independent" && (
                <View style={styles.radioInner} />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pathCard,
              selectedPath === "with_agent" && styles.pathCardActive,
            ]}
            onPress={() => setSelectedPath("with_agent")}
            activeOpacity={0.8}
          >
            <View style={styles.pathCardLeft}>
              <Ionicons
                name="people"
                size={24}
                color={
                  selectedPath === "with_agent"
                    ? Colors.primary
                    : Colors.textSecondary
                }
              />
              <View style={styles.pathCardText}>
                <Text
                  style={[
                    styles.pathCardTitle,
                    selectedPath === "with_agent" && { color: Colors.primary },
                  ]}
                >
                  Apply With an Agent
                </Text>
                <Text style={styles.pathCardDesc}>
                  Join an agency. Agents provide coaching and support.
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.radioOuter,
                selectedPath === "with_agent" && styles.radioOuterActive,
              ]}
            >
              {selectedPath === "with_agent" && (
                <View style={styles.radioInner} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Agent identifier field — shown only for with_agent path */}
        {selectedPath === "with_agent" && (
          <View style={styles.section}>
            <Text style={styles.label}>Agent ID (Haka ID or User ID)</Text>
            <TextInput
              style={styles.input}
              value={agentId}
              onChangeText={setAgentId}
              placeholder="Paste agent Haka ID or User ID"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              Ask your agent to share their Haka ID (or internal User ID) from
              their profile.
            </Text>
          </View>
        )}

        {/* Optional note */}
        {selectedPath && (
          <View style={styles.section}>
            <Text style={styles.label}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={note}
              onChangeText={setNote}
              placeholder="Tell us a bit about yourself..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
            <Text style={styles.charCount}>{note.length}/500</Text>
          </View>
        )}

        {/* Submit */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!selectedPath || submitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!selectedPath || submitting}
          >
            <>
              <Ionicons name="send" size={18} color="#FFF" />
              <Text style={styles.submitBtnText}>Submit Application</Text>
            </>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statusLink}
            onPress={() => navigation.navigate("HostApplicationStatus")}
          >
            <Text style={styles.statusLinkText}>
              Check existing application status →
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScroll>
    </View>
  );
}

const BENEFITS = [
  {
    icon: "mic" as const,
    label: "Go Live Anytime",
    desc: "Host audio/video rooms 24/7 with up to 20 speakers.",
  },
  {
    icon: "leaf" as const,
    label: "Earn Beans",
    desc: "Receive virtual gifts converted to beans, then cash.",
  },
  {
    icon: "people" as const,
    label: "Grow Your Audience",
    desc: "Build followers, get featured on the Discover page.",
  },
  {
    icon: "trophy" as const,
    label: "Leaderboard Fame",
    desc: "Top hosts rank on the weekly & monthly leaderboard.",
  },
  {
    icon: "briefcase" as const,
    label: "Agent Support",
    desc: "Optionally join an agency for coaching & promotion.",
  },
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },

  hero: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "700" },
  heroSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  sectionTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700" },

  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: { flex: 1 },
  benefitLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: "600" },
  benefitDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  pathCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  pathCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySubtle,
  },
  pathCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  pathCardText: { flex: 1 },
  pathCardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "600" },
  pathCardDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },

  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    height: 52,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  textArea: { height: 96, paddingTop: Spacing.md, textAlignVertical: "top" },
  hint: { color: Colors.textTertiary, fontSize: 12 },
  charCount: { color: Colors.textTertiary, fontSize: 11, textAlign: "right" },

  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  statusLink: { alignItems: "center", paddingVertical: Spacing.md },
  statusLinkText: { color: Colors.primary, fontSize: 13, fontWeight: "600" },
});
