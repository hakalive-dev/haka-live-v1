import {
  computeCoinSellerCommissionDisplay,
  decimalRateToDisplayPercent,
} from "./coinSellerCommissionDisplay";
import type { AgencySummaryV2 } from "@/types";

describe("decimalRateToDisplayPercent", () => {
  it("converts decimal fractions to whole percents", () => {
    expect(decimalRateToDisplayPercent(0.04)).toBe(4);
    expect(decimalRateToDisplayPercent(0.16)).toBe(16);
  });
});

describe("computeCoinSellerCommissionDisplay", () => {
  const base: AgencySummaryV2 = {
    commissionTier: { name: "A", commissionRate: 0.04 },
    totalHosts: 1,
    weeklyBeans: 0,
    weeklyCommission: 0,
    allTimeCommission: 0,
    todayBeans: 0,
    yesterdayBeans: 0,
    sameDayLastWeekBeans: 0,
    todayCommission: 0,
    monthCommission: 0,
    directCommissionAllTime: 0,
    inviteAgentCommissionAllTime: 0,
    cumulativeHostIncome: "0",
    agencyPotBalance: "0",
    effectiveCommissionRate: 0.04,
    effectiveGiftBonusRate: 0,
    giftBonusProgramEnabled: true,
    giftBonusEnabled: true,
    rollingSevenDayAgencyHostIncome: "0",
    rollingThirtyDayAgencyHostIncome: "0",
    rollingThirtyDayWindowStart: "",
    rollingThirtyDayWindowEnd: "",
    currentGiftBonusTier: null,
    nextGiftBonusTier: null,
    allGiftBonusTiers: [
      { name: "T1", bonusRate: 0, minRollingIncome: "0" },
      { name: "T2", bonusRate: 0.15, minRollingIncome: "1" },
    ],
    currentTier: { name: "A", commissionRate: 0.04, minHostIncome: "0" },
    nextTier: null,
    allTiers: [
      { name: "A", commissionRate: 0.04, minHostIncome: "0" },
      { name: "E", commissionRate: 0.2, minHostIncome: "1" },
    ],
    agencyStatus: "active",
    subAgencyCount: 0,
    baseSalaryHostCount: 0,
    monthHostBeans: 0,
    monthHostCommission: 0,
    monthSubAgentCommission: 0,
  };

  it("matches reference formula: 70 + 0 + 4*0.7 = 72.8", () => {
    const d = computeCoinSellerCommissionDisplay(base);
    expect(d.giftCommissionPercent).toBe("70");
    expect(d.incomeRewardPercent).toBe("4");
    expect(d.giftBonusPercent).toBe("0");
    expect(d.myCommissionRatePercent).toBe("72.8");
    expect(d.maxMyCommissionRatePercent).toBe("94.5");
  });
});
