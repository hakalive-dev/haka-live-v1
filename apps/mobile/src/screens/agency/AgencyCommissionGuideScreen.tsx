import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing } from "@/theme";
import type { RootStackScreenProps } from "@navigation/types";

type Props = RootStackScreenProps<"AgencyCommissionGuide">;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <Text style={styles.bullet}>
      {"\u2022 "}
      {children}
    </Text>
  );
}

/**
 * In-app copy of docs/agency-commission-user-guide.md (condensed for mobile).
 * Update when the repo doc changes.
 */
export function AgencyCommissionGuideScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Agency commission
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator
      >
        <Text style={styles.lead}>
          For agents (agency owners): how commission works in Haka Live, and
          what you see in Agency Centre.
        </Text>
        <Text style={styles.note}>
          Rates and tier thresholds are set by your deployment. Percentages
          below match default seeds unless an admin changed them.
        </Text>

        <Section title="Who this affects">
          <Bullet>
            Agents: when gifts are tied to your active agency, you may earn
            commission beans in your personal wallet.
          </Bullet>
          <Bullet>
            Parent agents: if your agency has a parent, the parent owner may
            earn parent commission on some gifts — only the rate difference
            above your direct rate, not an extra charge to the host.
          </Bullet>
          <Bullet>
            Hosts under an agent: you still get your full host share first.
            Commission is calculated from that share; your agent does not take
            beans out of your 70%.
          </Bullet>
        </Section>

        <Section title="Host share (70%)">
          <Text style={styles.body}>
            Gift value (beans × quantity) is split so roughly 70% becomes the
            host share, rounded down to whole beans. Agency commission uses that
            host share as its base — not the full gift value.
          </Text>
        </Section>

        <Section title="When commission applies">
          <Text style={styles.body}>
            Commission can apply when the gift is tied to an active agency, for
            example:
          </Text>
          <Bullet>Gift sent to the agency (agency as recipient).</Bullet>
          <Bullet>
            Gift sent to you while you are live as an agent (treated like a gift
            to your agency).
          </Bullet>
          <Bullet>Gift sent to an agent_host under your agency.</Bullet>
          <Text style={styles.body}>
            If the agency is suspended or not active, you may see messaging in
            Agency Centre that earnings are paused or disabled.
          </Text>
        </Section>

        <Section title="Direct, parent, and gift bonus">
          <Text style={styles.body}>
            <Text style={styles.emphasis}>Direct commission</Text>
            {" — "}your tier (or a temporary admin override) on activity
            attributed to your agency.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.emphasis}>Parent commission</Text>
            {" — "}only when the parent agency is active; amount is based on the
            difference between parent and your direct rate on the same host
            share.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.emphasis}>Agency gift bonus</Text>
            {" — "}separate from wallet commission. Paid when gifts go to your
            agency ID or you while live as agent — not on gifts to hosts only.
            Host gifts still count toward your 7-day bonus tier. Uses a 7-day
            rolling window, not the 30-day commission ladder.
          </Text>
          <Text style={styles.body}>
            Toasts may say Commission, Parent commission, or Agency gift bonus
            when you earn.
          </Text>
        </Section>

        <Section title="Commission tiers (30 days)">
          <Text style={styles.body}>
            Agency Centre shows rolling 30-day turnover to explain your tier
            (often labeled A–E). Higher turnover generally unlocks a higher
            percentage of the host share. You may also see an effective rate if
            an admin set a fixed override for a period.
          </Text>
        </Section>

        <Section title="What you see in Agency Centre">
          <Bullet>Host counts and host gift activity.</Bullet>
          <Bullet>
            Commission totals (today, week, all time) from wallet credits.
          </Bullet>
          <Bullet>Rolling 30-day figures for the tier journey.</Bullet>
          <Bullet>
            Split of direct vs invite-agent (parent) commission over time, when
            available.
          </Bullet>
        </Section>

        <Section title="Real-time updates">
          <Bullet>
            After some gifts, your bean balance updates immediately and you may
            see a short success toast.
          </Bullet>
          <Bullet>
            Stats can refresh even when commission rounds to zero, so tier views
            stay in sync.
          </Bullet>
        </Section>

        <Section title="FAQ">
          <Text style={styles.body}>
            <Text style={styles.emphasis}>
              Does my agent take part of my host beans?
            </Text>
            {"\n"}No. You receive your host share first; commission is a
            separate calculation.
          </Text>
          <Text style={[styles.body, styles.faqGap]}>
            <Text style={styles.emphasis}>
              Why did my tier not jump after one big gift?
            </Text>
            {"\n"}Rolling windows and rounding apply. On-screen turnover can use
            a slightly different aggregate than the exact payout input — your
            tier should trend with sustained activity.
          </Text>
          <Text style={styles.body}>
            <Text style={styles.emphasis}>Where do gift bonus beans go?</Text>
            {"\n"}To the agency bean balance (pot), not your personal wallet,
            until any future withdrawal flow exists.
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: 17,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  headerSpacer: {
    width: 24,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    fontStyle: "italic",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.xs,
  },
  emphasis: {
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  faqGap: {
    marginTop: Spacing.md,
  },
});
