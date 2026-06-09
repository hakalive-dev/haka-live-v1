import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Clipboard,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useCoinSellerBootstrapQuery } from "@hooks/queries/useCoinSellerBootstrapQuery";
import { useRefetchOnFocusIfStale } from "@hooks/useRefetchOnFocusIfStale";
import { queryClient } from "@api/queryClient";
import { queryKeys } from "@api/queryKeys";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSelector } from "react-redux";
import * as ImagePicker from "expo-image-picker";

import { agencyApi } from "@api/agency";
import { coinSellerApi } from "@api/coinSeller";
import { paymentsApi } from "@api/payments";
import { usersApi } from "@api/users";
import { walletApi } from "@api/wallet";
import { Colors, Radius, Spacing, Shadows } from "@/theme";
import { ListRowSkeleton } from "@components/Skeleton";
import { KeyboardAwareScroll } from "@components/keyboard";
import { CopyableId } from "@components/CopyableId";
import { UserIdBadge } from "@components/UserIdBadge";
import { UserAvatar } from "@components/UserAvatar";
import type {
  BindMethodType,
  CoinSellerProfile,
  CoinSellerCustomer,
  CoinSellerTargetType,
  SellerExchangeRequest,
  SellerRechargePackage,
  SellerRechargePaymentInfo,
  SellerRechargeRequest,
  RechargePaymentMethod,
  PublicUser,
  UserPaymentMethod,
  WalletBalance,
  AgencySummaryV2,
} from "@/types";
import type {
  RootStackParamList,
  RootStackScreenProps,
} from "@navigation/types";
import {
  computeCoinSellerCommissionDisplay,
  type CoinSellerCommissionDisplay,
} from "@/utils/coinSellerCommissionDisplay";

import EpayIcon from "../../../assets/payment-methods/epay.svg";
import BinanceIcon from "../../../assets/payment-methods/binance.svg";
import UsdtIcon from "../../../assets/payment-methods/usdt.svg";
import BankTransferIcon from "../../../assets/payment-methods/bank-transfer.svg";
import type { RootState } from "../../store";
import { useToast } from "@components/Toast";

type Props = RootStackScreenProps<"CoinSeller">;

const BG = "#E8F5F0";
const PRIMARY = "#5B2FD4";
const BEAN_IMG = require("../../../assets/bean.png");
const TRADING_LEVEL_HEADER_BG = "#FFF0E6";
const TRADING_LEVEL_HEADER_BORDER = "#FFD4B8";
const EXCHANGE_MINT = "#88E8B1";

/** tabContent (lg) + tradingCompoundBody (md) horizontal padding — used so 3 tiles + gaps fit one row */
const RECHARGE_GRID_H_PAD = (Spacing.lg + Spacing.md) * 2;
const RECHARGE_TILE_GAP = Spacing.sm;
const RECHARGE_TILE_WIDTH = Math.floor(
  (Dimensions.get("window").width -
    RECHARGE_GRID_H_PAD -
    RECHARGE_TILE_GAP * 2) /
    3,
);

const TOP_TABS = ["Coin Seller", "Customer"] as const;
type TopTab = (typeof TOP_TABS)[number];

const SELLER_SUBS = ["Myself", "Trading"] as const;
type SellerSub = (typeof SELLER_SUBS)[number];

const CUSTOMER_SUBS = ["Recommend", "Old Customer"] as const;
type CustomerSub = (typeof CUSTOMER_SUBS)[number];

const TRADING_ACTIONS = ["Transfer", "Recharge", "Exchange"] as const;
type TradingAction = (typeof TRADING_ACTIONS)[number];

type PaymentBindRoute = Extract<
  keyof RootStackParamList,
  "BindEpay" | "BindBinance" | "BindUsdtTrc20" | "BindBankAccount"
>;

const PAYMENT_BIND_OVERLAY_OPTIONS: {
  key: BindMethodType;
  label: string;
  route: PaymentBindRoute;
  Icon: React.ComponentType<{ width: number; height: number }>;
}[] = [
  { key: "epay", label: "Epay", route: "BindEpay", Icon: EpayIcon },
  {
    key: "binance_bep20",
    label: "BINANCE (BEP20)",
    route: "BindBinance",
    Icon: BinanceIcon,
  },
  { key: "usdt_trc20", label: "USDT", route: "BindUsdtTrc20", Icon: UsdtIcon },
  {
    key: "bank_account",
    label: "BANK TRANSFER",
    route: "BindBankAccount",
    Icon: BankTransferIcon,
  },
];

export function CoinSellerScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const user = useSelector((s: RootState) => s.auth.user);
  const lastSellerStatsAt = useSelector((s: RootState) => s.auth.lastSellerStatsAt);
  const lastCommissionAt = useSelector((s: RootState) => s.auth.lastCommissionAt);
  const lastAgencyGiftStatsAt = useSelector(
    (s: RootState) => s.auth.lastAgencyGiftStatsAt,
  );

  const [topTab, setTopTab] = useState<TopTab>("Coin Seller");
  const [sellerSub, setSellerSub] = useState<SellerSub>(
    route.params?.initialSellerSub ?? "Myself",
  );
  const [customerSub, setCustomerSub] = useState<CustomerSub>("Recommend");
  const [tradingAction, setTradingAction] = useState<TradingAction>("Transfer");

  const [profile, setProfile] = useState<CoinSellerProfile | null>(null);
  const [agencySummary, setAgencySummary] = useState<AgencySummaryV2 | null>(
    null,
  );
  const [customers, setCustomers] = useState<CoinSellerCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Trading form state
  const [targetUserId, setTargetUserId] = useState("");
  const [resolvedTarget, setResolvedTarget] = useState<PublicUser | null>(null);
  const [checkingTarget, setCheckingTarget] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [targetType, setTargetType] = useState<CoinSellerTargetType>("user");
  const [exchangePoints, setExchangePoints] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Recharge flow state
  const [rechargePackages, setRechargePackages] = useState<
    SellerRechargePackage[]
  >([]);
  const [rechargePaymentInfo, setRechargePaymentInfo] =
    useState<SellerRechargePaymentInfo | null>(null);
  const [rechargeRequests, setRechargeRequests] = useState<
    SellerRechargeRequest[]
  >([]);
  const [rechargeStep, setRechargeStep] = useState<1 | 2 | 3>(1);
  const [selectedRechargeUsd, setSelectedRechargeUsd] = useState<number | null>(
    null,
  );
  const [customRechargeUsd, setCustomRechargeUsd] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<RechargePaymentMethod | null>(null);
  const [rechargeTxHash, setRechargeTxHash] = useState("");
  const [rechargeProof, setRechargeProof] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);

  const [userPaymentMethods, setUserPaymentMethods] = useState<
    UserPaymentMethod[]
  >([]);
  const [paymentOverlayVisible, setPaymentOverlayVisible] = useState(false);
  const [overlayBindSelection, setOverlayBindSelection] =
    useState<BindMethodType>("epay");
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(
    null,
  );
  const [exchangeRequests, setExchangeRequests] = useState<
    SellerExchangeRequest[]
  >([]);
  const [whatsappModalVisible, setWhatsappModalVisible] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  const loadGenerationRef = useRef(0);
  const secondaryLoadedRef = useRef({
    recharge: false,
    exchange: false,
  });

  const commissionDisplay = useMemo(
    () => computeCoinSellerCommissionDisplay(agencySummary),
    [agencySummary],
  );

  const loadRechargeSecondary = useCallback(async () => {
    const generation = loadGenerationRef.current;
    const results = await Promise.allSettled([
      coinSellerApi.getRechargePackages(),
      coinSellerApi.getRechargePaymentInfo(),
      coinSellerApi.getMyRechargeRequests(),
      paymentsApi.getPaymentMethods(),
    ]);
    if (generation !== loadGenerationRef.current) return;
    const [pkgR, infoR, reqR, pmR] = results;
    if (pkgR.status === "fulfilled") setRechargePackages(pkgR.value);
    if (infoR.status === "fulfilled") setRechargePaymentInfo(infoR.value);
    if (reqR.status === "fulfilled") setRechargeRequests(reqR.value);
    if (pmR.status === "fulfilled") setUserPaymentMethods(pmR.value);
    secondaryLoadedRef.current.recharge = true;
  }, []);

  const loadExchangeSecondary = useCallback(async () => {
    const generation = loadGenerationRef.current;
    const [exR] = await Promise.allSettled([
      coinSellerApi.getMyExchangeRequests(),
    ]);
    if (generation !== loadGenerationRef.current) return;
    if (exR.status === "fulfilled") setExchangeRequests(exR.value);
    secondaryLoadedRef.current.exchange = true;
  }, []);

  const authRole = useSelector((s: RootState) => s.auth.user?.role);
  const bootstrapQuery = useCoinSellerBootstrapQuery({
    enabled: authRole === 'agent',
  });
  useRefetchOnFocusIfStale(
    () => bootstrapQuery.refetch(),
    bootstrapQuery.isStale,
    !bootstrapQuery.isLoading,
  );

  useFocusEffect(
    useCallback(() => {
      const sub = route.params?.initialSellerSub;
      if (sub) setSellerSub(sub);
    }, [route.params?.initialSellerSub]),
  );

  useEffect(() => {
    if (!bootstrapQuery.data) return;
    setProfile(bootstrapQuery.data.profile);
    setAgencySummary(bootstrapQuery.data.agencySummary);
    setWalletBalance(bootstrapQuery.data.wallet);
    setLoadError(null);
    setLoading(false);
  }, [bootstrapQuery.data]);

  useEffect(() => {
    if (bootstrapQuery.isError) {
      setLoadError(
        bootstrapQuery.error instanceof Error
          ? bootstrapQuery.error.message
          : "Failed to load coin seller profile.",
      );
      setLoading(false);
    }
  }, [bootstrapQuery.isError, bootstrapQuery.error]);

  const refreshCustomers = useCallback(async () => {
    try {
      const list = await coinSellerApi.getCustomers();
      setCustomers(list);
    } catch {
      /* keep existing list */
    }
  }, []);

  const refreshAfterSellerStats = useCallback(async () => {
    const tasks: Promise<unknown>[] = [
      coinSellerApi.getMyProfile().then((p) => setProfile(p)),
      agencyApi.getSummaryV2().then((s) => setAgencySummary(s)),
      walletApi.getBalance().then((b) => setWalletBalance(b)),
    ];
    if (topTab === "Customer") {
      tasks.push(refreshCustomers());
    }
    if (secondaryLoadedRef.current.recharge) {
      tasks.push(
        coinSellerApi.getMyRechargeRequests().then((r) => setRechargeRequests(r)),
      );
    }
    if (secondaryLoadedRef.current.exchange) {
      tasks.push(
        coinSellerApi.getMyExchangeRequests().then((r) => setExchangeRequests(r)),
      );
    }
    await Promise.allSettled(tasks);
  }, [topTab, refreshCustomers]);

  useEffect(() => {
    if (lastCommissionAt == null && lastAgencyGiftStatsAt == null) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.coinSeller.bootstrap() });
  }, [lastCommissionAt, lastAgencyGiftStatsAt]);

  const openPaymentMethodOverlay = useCallback(() => {
    const preferred =
      userPaymentMethods.find((m) => m.is_default)?.method_type ??
      userPaymentMethods[0]?.method_type ??
      "epay";
    setOverlayBindSelection(preferred);
    setPaymentOverlayVisible(true);
  }, [userPaymentMethods]);

  const confirmPaymentMethodOverlay = useCallback(() => {
    const opt = PAYMENT_BIND_OVERLAY_OPTIONS.find(
      (o) => o.key === overlayBindSelection,
    );
    setPaymentOverlayVisible(false);
    if (opt) {
      const us = { countryCode: 'US' as const };
      switch (opt.route) {
        case 'BindEpay':
          navigation.navigate('BindEpay', { ...us, provider: 'epay' });
          break;
        case 'BindBinance':
          navigation.navigate('BindBinance', { ...us, provider: 'usdt_bep20' });
          break;
        case 'BindUsdtTrc20':
          navigation.navigate('BindUsdtTrc20', { ...us, provider: 'usdt_trc20' });
          break;
        case 'BindBankAccount':
          navigation.navigate('BindPaymentMethod', {
            countryCode: 'US',
            currency: 'USD',
            countryName: 'United States',
          });
          break;
      }
    }
  }, [navigation, overlayBindSelection]);

  const openWhatsappEditor = useCallback(() => {
    if (!profile) return;
    setWhatsappDraft(profile.whatsapp_number ?? "");
    setWhatsappModalVisible(true);
  }, [profile]);

  const handleSaveWhatsapp = async () => {
    const normalized = whatsappDraft.replace(/\s+/g, "").trim();
    setSavingWhatsapp(true);
    try {
      const updated = await coinSellerApi.updateMyProfile({
        whatsapp_number: normalized,
      });
      setProfile(updated);
      setWhatsappModalVisible(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save WhatsApp number.");
    } finally {
      setSavingWhatsapp(false);
    }
  };

  useEffect(() => {
    if (lastSellerStatsAt == null) return;
    void refreshAfterSellerStats();
  }, [lastSellerStatsAt, refreshAfterSellerStats]);

  useEffect(() => {
    if (topTab !== "Coin Seller" || sellerSub !== "Trading") return;
    if (tradingAction === "Recharge" && !secondaryLoadedRef.current.recharge) {
      void loadRechargeSecondary();
    }
    if (tradingAction === "Exchange" && !secondaryLoadedRef.current.exchange) {
      void loadExchangeSecondary();
    }
  }, [topTab, sellerSub, tradingAction, loadRechargeSecondary, loadExchangeSecondary]);

  useEffect(() => {
    if (topTab !== "Customer") {
      setCustomersLoading(false);
      return;
    }
    let cancelled = false;
    setCustomersLoading(true);
    coinSellerApi
      .getCustomers()
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
      setCustomersLoading(false);
    };
  }, [topTab]);

  const handleCheckUser = async () => {
    const input = targetUserId.trim();
    if (!input) return;
    setCheckingTarget(true);
    try {
      const u = await usersApi.profile(input);
      setResolvedTarget(u);
    } catch {
      setResolvedTarget(null);
      Alert.alert("Not Found", "No user found for that Haka ID or Special ID.");
    } finally {
      setCheckingTarget(false);
    }
  };

  const handleTransfer = async () => {
    if (!targetUserId.trim() || !transferAmount.trim()) return;
    // Prefer the resolved UUID; fall back to raw input (backend also resolves hakaId)
    const targetId = resolvedTarget?.id ?? targetUserId.trim();
    setSubmitting(true);
    try {
      const coins = parseInt(transferAmount, 10);
      await coinSellerApi.transfer({
        target_user_id: targetId,
        coins_amount: coins,
        target_type: targetType,
      });
      const recipientLabel =
        resolvedTarget?.displayName ?? resolvedTarget?.username ?? targetUserId.trim();
      toast.show(`Transferred ${coins.toLocaleString()} coins to ${recipientLabel}`, "success");
      setTargetUserId("");
      setTransferAmount("");
      setResolvedTarget(null);
      void refreshCustomers();
      void coinSellerApi.getMyProfile().then(setProfile);
      void walletApi.getBalance().then(setWalletBalance);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Transfer failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split(".").pop() ?? "jpg";
    setRechargeProof({
      uri: asset.uri,
      name: `proof.${ext}`,
      type: `image/${ext}`,
    });
  };

  const handleSubmitRechargeRequest = async () => {
    const usd = selectedRechargeUsd ?? parseFloat(customRechargeUsd);
    if (!usd || usd < 10) {
      Alert.alert("Error", "Minimum recharge is $10.");
      return;
    }
    if (!selectedPaymentMethod) {
      Alert.alert("Error", "Select a payment method.");
      return;
    }
    if (!rechargeProof) {
      Alert.alert("Error", "Upload payment proof screenshot.");
      return;
    }
    setSubmitting(true);
    try {
      await coinSellerApi.submitRechargeRequest({
        amount_usd: usd,
        payment_method: selectedPaymentMethod,
        tx_hash: rechargeTxHash || undefined,
        proof: rechargeProof,
      });
      Alert.alert(
        "Submitted",
        "Your recharge request is pending admin approval.",
      );
      setRechargeStep(1);
      setSelectedRechargeUsd(null);
      setCustomRechargeUsd("");
      setSelectedPaymentMethod(null);
      setRechargeTxHash("");
      setRechargeProof(null);
      void bootstrapQuery.refetch();
      if (secondaryLoadedRef.current.recharge) {
        void coinSellerApi.getMyRechargeRequests().then(setRechargeRequests);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExchange = async () => {
    const pts = parseInt(exchangePoints.replace(/,/g, "").trim(), 10);
    if (!exchangePoints.trim() || Number.isNaN(pts) || pts <= 0) return;
    setSubmitting(true);
    try {
      await coinSellerApi.exchange({
        points_amount: pts,
      });
      Alert.alert(
        "Exchange complete",
        "Your beans were converted to seller coins. Your wallet balance has been updated.",
      );
      setExchangePoints("");
      void bootstrapQuery.refetch();
      if (secondaryLoadedRef.current.exchange) {
        void coinSellerApi.getMyExchangeRequests().then(setExchangeRequests);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Exchange failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loadError || !profile) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={48} color="#CCC" />
          <Text style={styles.errorStateText}>
            {loadError ?? "Could not load profile."}
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void bootstrapQuery.refetch(); }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const filteredCustomers = customers.filter((c) =>
    customerSub === "Recommend"
      ? c.customer_type === "recommend"
      : c.customer_type === "old",
  );

  const preferredPaymentMethod =
    userPaymentMethods.find((m) => m.is_default) ?? userPaymentMethods[0];
  const paymentMethodSummary = preferredPaymentMethod
    ? (PAYMENT_BIND_OVERLAY_OPTIONS.find(
        (o) => o.key === preferredPaymentMethod.method_type,
      )?.label ?? "")
    : "";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>

        {/* Inline tabs */}
        <View style={styles.headerTabs}>
          {TOP_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.headerTabBtn}
              onPress={() => setTopTab(tab)}
            >
              <Text
                style={[
                  styles.headerTabText,
                  topTab === tab && styles.headerTabTextActive,
                ]}
              >
                {tab}
              </Text>
              {topTab === tab && <View style={styles.headerTabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity hitSlop={8} onPress={() => {}}>
          <Ionicons name="help-circle-outline" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* ── Sub toggle (pill style) ── */}
      {topTab === "Coin Seller" ? (
        <View style={styles.pillToggleWrap}>
          <View style={styles.pillToggle}>
            {SELLER_SUBS.map((sub) => (
              <TouchableOpacity
                key={sub}
                style={[
                  styles.pillOption,
                  sellerSub === sub && styles.pillOptionActive,
                ]}
                onPress={() => setSellerSub(sub)}
              >
                <Text
                  style={[
                    styles.pillOptionText,
                    sellerSub === sub && styles.pillOptionTextActive,
                  ]}
                >
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.pillToggleWrap}>
          <View style={styles.pillToggle}>
            {CUSTOMER_SUBS.map((sub) => (
              <TouchableOpacity
                key={sub}
                style={[
                  styles.pillOption,
                  customerSub === sub && styles.pillOptionActive,
                ]}
                onPress={() => setCustomerSub(sub)}
              >
                <Text
                  style={[
                    styles.pillOptionText,
                    customerSub === sub && styles.pillOptionTextActive,
                  ]}
                >
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {/* ── Coin Seller tab ── */}
        {topTab === "Coin Seller" && sellerSub === "Myself" && profile && (
          <MyselfTab
            profile={profile}
            commissionDisplay={commissionDisplay}
            onNavigateRank={() => navigation.navigate("CoinSellerRank")}
            onNavigateAgencyCenter={() => navigation.navigate("AgencyCenter")}
            paymentMethodSummary={paymentMethodSummary}
            onPressPaymentMethod={openPaymentMethodOverlay}
            onPressEditWhatsapp={openWhatsappEditor}
          />
        )}

        {topTab === "Coin Seller" && sellerSub === "Trading" && profile && (
          <TradingTab
            profile={profile}
            tradingAction={tradingAction}
            setTradingAction={setTradingAction}
            targetUserId={targetUserId}
            onTargetUserIdChange={(v) => {
              setTargetUserId(v);
              setResolvedTarget(null);
            }}
            resolvedTarget={resolvedTarget}
            checkingTarget={checkingTarget}
            onCheckUser={handleCheckUser}
            transferAmount={transferAmount}
            setTransferAmount={setTransferAmount}
            targetType={targetType}
            setTargetType={(v) => {
              setTargetType(v);
              setResolvedTarget(null);
            }}
            exchangePoints={exchangePoints}
            setExchangePoints={setExchangePoints}
            myPointBalance={walletBalance?.beanBalance ?? 0}
            exchangeRequests={exchangeRequests}
            onExchangeSubmit={handleExchange}
            onNavigateDetails={() =>
              navigation.navigate("CoinSellerDetails", {})
            }
            rechargePackages={rechargePackages}
            rechargePaymentInfo={rechargePaymentInfo}
            rechargeRequests={rechargeRequests}
            rechargeStep={rechargeStep}
            setRechargeStep={setRechargeStep}
            selectedRechargeUsd={selectedRechargeUsd}
            setSelectedRechargeUsd={setSelectedRechargeUsd}
            customRechargeUsd={customRechargeUsd}
            setCustomRechargeUsd={setCustomRechargeUsd}
            selectedPaymentMethod={selectedPaymentMethod}
            setSelectedPaymentMethod={setSelectedPaymentMethod}
            rechargeTxHash={rechargeTxHash}
            setRechargeTxHash={setRechargeTxHash}
            rechargeProof={rechargeProof}
            onPickProof={handlePickProof}
            onSubmitRecharge={handleSubmitRechargeRequest}
            onTransferSubmit={handleTransfer}
            submitting={submitting}
          />
        )}

        {/* ── Customer tab ── */}
        {topTab === "Customer" && (
          <CustomerTab
            customerSub={customerSub}
            customers={filteredCustomers}
            loading={customersLoading}
            onQuickMessage={() => navigation.navigate("CoinSellerQuickMessage")}
          />
        )}
      </KeyboardAwareScroll>

      <Modal
        visible={paymentOverlayVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentOverlayVisible(false)}
      >
        <View style={styles.paymentOverlayRoot}>
          <View
            style={[
              styles.paymentOverlaySheet,
              { paddingBottom: insets.bottom + Spacing.lg },
            ]}
          >
            <View style={styles.paymentOverlayHeader}>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => setPaymentOverlayVisible(false)}
              >
                <Text style={styles.paymentOverlayCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.paymentOverlayTitle}>Payment Method</Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={confirmPaymentMethodOverlay}
              >
                <Text style={styles.paymentOverlayConfirm}>Confirm</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.paymentOverlayHint}>Select payment method</Text>
            <View style={styles.paymentOverlayList}>
              {PAYMENT_BIND_OVERLAY_OPTIONS.map((opt) => {
                const selected = overlayBindSelection === opt.key;
                const RowIcon = opt.Icon;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.paymentOverlayRow}
                    onPress={() => setOverlayBindSelection(opt.key)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.paymentOverlayIconWrap}>
                      <RowIcon width={44} height={44} />
                    </View>
                    <Text style={styles.paymentOverlayLabel}>{opt.label}</Text>
                    <View
                      style={[
                        styles.paymentOverlayRadioOuter,
                        selected && styles.paymentOverlayRadioOuterSelected,
                      ]}
                    >
                      {selected ? (
                        <View style={styles.paymentOverlayRadioInner} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={whatsappModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setWhatsappModalVisible(false)}
      >
        <View style={styles.paymentOverlayRoot}>
          <View
            style={[
              styles.paymentOverlaySheet,
              { paddingBottom: insets.bottom + Spacing.lg },
            ]}
          >
            <View style={styles.paymentOverlayHeader}>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => setWhatsappModalVisible(false)}
              >
                <Text style={styles.paymentOverlayCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.paymentOverlayTitle}>WhatsApp</Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={handleSaveWhatsapp}
                disabled={savingWhatsapp}
              >
                <Text
                  style={[
                    styles.paymentOverlayConfirm,
                    savingWhatsapp && styles.paymentOverlayConfirmDisabled,
                  ]}
                >
                  {savingWhatsapp ? "…" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.paymentOverlayHint}>
              Buyers can use this number to coordinate transfers. Include
              country code (e.g. +44…).
            </Text>
            <TextInput
              style={styles.whatsappModalInput}
              placeholder="Phone number"
              placeholderTextColor="#999"
              value={whatsappDraft}
              onChangeText={setWhatsappDraft}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ── Myself Sub-Tab ──────────────────────────────────────────────────────── */

function MyselfTab({
  profile,
  commissionDisplay,
  onNavigateRank,
  onNavigateAgencyCenter,
  paymentMethodSummary,
  onPressPaymentMethod,
  onPressEditWhatsapp,
}: {
  profile: CoinSellerProfile;
  commissionDisplay: CoinSellerCommissionDisplay;
  onNavigateRank: () => void;
  onNavigateAgencyCenter: () => void;
  paymentMethodSummary: string;
  onPressPaymentMethod: () => void;
  onPressEditWhatsapp: () => void;
}) {
  const helpIconRef = useRef<View>(null);
  const [formulaTooltip, setFormulaTooltip] = useState<{
    visible: boolean;
    top: number;
    left: number;
  }>({ visible: false, top: 0, left: 0 });
  const d = commissionDisplay;

  const COMMISSION_FORMULA_TOOLTIP_WIDTH = 268;
  const screenWidth = Dimensions.get("window").width;

  const showFormulaTooltip = () => {
    helpIconRef.current?.measureInWindow((x, y, width, height) => {
      let left = x + width / 2 - COMMISSION_FORMULA_TOOLTIP_WIDTH / 2;
      left = Math.max(
        Spacing.lg,
        Math.min(
          left,
          screenWidth - COMMISSION_FORMULA_TOOLTIP_WIDTH - Spacing.lg,
        ),
      );
      setFormulaTooltip({
        visible: true,
        top: y + height + 6,
        left,
      });
    });
  };

  const hideFormulaTooltip = () => {
    setFormulaTooltip((prev) => ({ ...prev, visible: false }));
  };

  return (
    <View style={styles.myselfTabContent}>
      {/* ── Profile card ── */}
      <View style={[styles.card, styles.myselfCard]}>
        {/* Avatar + name row */}
        <View style={styles.profileTopRow}>
          <View style={styles.profileAvatarWrap}>
            {profile.user.avatar ? (
              <Image
                source={{ uri: profile.user.avatar }}
                style={styles.profileAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.profileAvatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {profile.user.displayName?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile.user.displayName}</Text>
            <View style={styles.profileIdRow}>
              {profile.user.activeSpecialId &&
              profile.user.activeSpecialIdLevel ? (
                <UserIdBadge
                  hakaId={profile.user.hakaId ?? null}
                  activeSpecialId={profile.user.activeSpecialId}
                  activeSpecialIdLevel={profile.user.activeSpecialIdLevel}
                  width={96}
                  hidePlain
                />
              ) : (
                <CopyableId
                  value={profile.user.activeSpecialId ?? profile.user.hakaId}
                  textStyle={styles.profileIdText}
                />
              )}
            </View>
          </View>
        </View>

        {/* Meta rows */}
        <View style={styles.metaDivider} />

        {/* Payment Method */}
        <TouchableOpacity style={styles.metaRow} onPress={onPressPaymentMethod}>
          <Image
            source={require("../../../assets/coin-seller/payment_method.png")}
            style={styles.metaIcon}
            contentFit="contain"
          />
          <Text style={styles.metaLabel}>Payment Method</Text>
          <View style={styles.metaRight}>
            <Text
              style={[
                styles.metaValue,
                !paymentMethodSummary && styles.metaValueMuted,
              ]}
              numberOfLines={1}
            >
              {paymentMethodSummary || "Select"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#CCC" />
          </View>
        </TouchableOpacity>

        {/* WhatsApp */}
        <TouchableOpacity style={styles.metaRow} onPress={onPressEditWhatsapp}>
          <Image
            source={require("../../../assets/coin-seller/whatsapp.png")}
            style={styles.metaIcon}
            contentFit="contain"
          />
          <Text style={styles.metaLabel}>WhatsApp</Text>
          <View style={styles.metaRight}>
            <Text style={styles.metaValue}>
              {profile.whatsapp_number || "Not set"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#CCC" />
          </View>
        </TouchableOpacity>

        {/* Assistant */}
        <TouchableOpacity style={styles.metaRow}>
          <Image
            source={require("../../../assets/coin-seller/assistant.png")}
            style={styles.metaIcon}
            contentFit="contain"
          />
          <Text style={styles.metaLabel}>Assistant</Text>
          <View style={styles.metaRight}>
            <View style={styles.assistantAvatarCircle}>
              <Ionicons name="person" size={14} color="#999" />
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCC" />
          </View>
        </TouchableOpacity>

        {/* Coin seller rank */}
        <TouchableOpacity
          style={[styles.metaRow, { borderBottomWidth: 0 }]}
          onPress={onNavigateRank}
        >
          <Image
            source={require("../../../assets/coin-seller/cs_rank.png")}
            style={styles.metaIcon}
            contentFit="contain"
          />
          <Text style={styles.metaLabel}>Coinseller Rank</Text>
          <View style={styles.metaRight}>
            <View
              style={[
                styles.assistantAvatarCircle,
                { marginRight: Spacing.sm },
              ]}
            >
              <Ionicons name="person" size={14} color="#999" />
            </View>
            <View style={styles.assistantAvatarCircle}>
              <Ionicons name="person" size={14} color="#999" />
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCC" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Overview ── */}
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={[styles.card, styles.myselfCard]}>
        <View style={styles.overviewInner}>
          <View style={styles.overviewCol}>
            <Text style={styles.overviewLabel}>Coins Sold</Text>
            <View style={styles.overviewValueRow}>
              <Image
                source={require("../../../assets/coin.png")}
                style={styles.coinIcon16}
                contentFit="contain"
              />
              <Text style={styles.overviewValue}>
                {profile.total_coins_sold.toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={styles.overviewDivider} />
          <View style={styles.overviewCol}>
            <Text style={styles.overviewLabel}>number of Customer</Text>
            <View style={styles.overviewValueRow}>
              <Ionicons name="people-outline" size={16} color="#666" />
              <Text style={styles.overviewValue}>
                {profile.total_customers}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Commission Rate (agency-based display) ── */}
      <View style={[styles.card, styles.myselfCard]}>
        <View style={styles.commissionHeader}>
          <View style={styles.commissionHeaderTitleRow}>
            <Text style={styles.commissionHeaderText}>
              My commission Rate (Max. {d.maxMyCommissionRatePercent}%)
            </Text>
            <View ref={helpIconRef} collapsable={false}>
              <TouchableOpacity
                hitSlop={8}
                onPress={showFormulaTooltip}
                accessibilityLabel="How my commission rate is calculated"
              >
                <Ionicons
                  name="help-circle-outline"
                  size={18}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.commissionHeaderValue}>
            {d.myCommissionRatePercent}%
          </Text>
        </View>

        <Modal
          visible={formulaTooltip.visible}
          transparent
          animationType="fade"
          onRequestClose={hideFormulaTooltip}
        >
          <Pressable
            style={styles.commissionTooltipBackdrop}
            onPress={hideFormulaTooltip}
          >
            <Pressable
              style={[
                styles.commissionFormulaTooltip,
                {
                  top: formulaTooltip.top,
                  left: formulaTooltip.left,
                  width: COMMISSION_FORMULA_TOOLTIP_WIDTH,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.commissionFormulaText}>
                {d.formulaTooltip}
              </Text>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={styles.commissionRow}>
          <Text style={styles.commissionLabel}>Gift commission</Text>
          <Text style={styles.commissionValue}>
            {d.giftCommissionPercent}%
          </Text>
        </View>

        <View>
          <View style={styles.commissionRow}>
            <Text style={styles.commissionLabel}>
              Income Reward (Max. {d.maxIncomeRewardPercent}%)
            </Text>
            <Text style={styles.commissionValue}>
              {d.incomeRewardPercent}%
            </Text>
          </View>
          <TouchableOpacity
            style={styles.levelUpRow}
            onPress={onNavigateAgencyCenter}
          >
            <Text style={styles.levelUpText}>Level Up Ratio &gt;</Text>
          </TouchableOpacity>
        </View>

        <View>
          <View style={styles.commissionRow}>
            <Text style={styles.commissionLabel}>
              Gift Bonus Rate (Max. {d.maxGiftBonusPercent}%)
            </Text>
            <Text style={styles.commissionValue}>{d.giftBonusPercent}%</Text>
          </View>
          <TouchableOpacity
            style={styles.levelUpRow}
            onPress={onNavigateAgencyCenter}
          >
            <Text style={styles.levelUpText}>Level Up Ratio &gt;</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Level Rules — hidden (restore by setting to true) */}
      {false && (
        <>
          <View style={styles.levelRulesHeaderRow}>
            <Text style={styles.sectionTitle}>Level Rules</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.detailedRulesLink}>Detailed Rules &gt;</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, styles.myselfCard]}>
            <View style={styles.levelRulesColHeader}>
              <View style={{ flex: 2 }} />
              <Text style={styles.levelRulesColHeaderText}>Senior seller</Text>
              <Text style={styles.levelRulesColHeaderText}>
                Standard seller
              </Text>
            </View>

            <LevelRulesTable />
          </View>
        </>
      )}

      <TouchableOpacity style={styles.quitBtn} onPress={() => {}}>
        <Text style={styles.quitText}>Quit coinseller role &gt;</Text>
      </TouchableOpacity>
    </View>
  );
}

function LevelRulesTable() {
  const CHECK = <Ionicons name="checkmark-circle" size={18} color={PRIMARY} />;
  const CROSS = <Ionicons name="close-circle" size={18} color="#CCC" />;

  const GroupHeader = ({ label }: { label: string }) => (
    <View style={styles.levelGroupHeader}>
      <Text style={styles.levelGroupHeaderText}>{label}</Text>
    </View>
  );

  const DataRow = ({
    label,
    sub,
    senior,
    standard,
  }: {
    label: string;
    sub?: React.ReactNode;
    senior: React.ReactNode;
    standard: React.ReactNode;
  }) => (
    <View style={styles.levelRulesDataRow}>
      <View style={{ flex: 2 }}>
        <Text style={styles.levelRulesCell}>{label}</Text>
        {sub && <View>{sub}</View>}
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>{senior}</View>
      <View style={{ flex: 1, alignItems: "center" }}>{standard}</View>
    </View>
  );

  return (
    <>
      <GroupHeader label="Exchange Recharge" />
      <DataRow
        label="Exchange"
        sub={
          <View style={styles.levelRulesSubRow}>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.coinIcon12}
              contentFit="contain"
            />
            <Text style={styles.levelRulesSub}>xxx = </Text>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.coinIcon12}
              contentFit="contain"
            />
            <Text style={styles.levelRulesSub}>xxxx from </Text>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.coinIcon12}
              contentFit="contain"
            />
            <Text style={styles.levelRulesSub}>xxxxx</Text>
          </View>
        }
        senior={CHECK}
        standard={CHECK}
      />
      <DataRow
        label="Recharge"
        sub={
          <View style={styles.levelRulesSubRow}>
            <Text style={styles.levelRulesSub}>$x = </Text>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.coinIcon12}
              contentFit="contain"
            />
            <Text style={styles.levelRulesSub}>xxxx from $xxx</Text>
          </View>
        }
        senior={CHECK}
        standard={CROSS}
      />

      <GroupHeader label="Sale Methods" />
      <DataRow label="Coins seller → User" senior={CHECK} standard={CHECK} />
      <DataRow
        label="Coins seller → Coins seller"
        senior={CHECK}
        standard={CHECK}
      />

      <GroupHeader label="Privilege" />
      <DataRow label="Seller List" senior={CHECK} standard={CHECK} />
      <DataRow
        label="Customer Recommend list"
        senior={CHECK}
        standard={CHECK}
      />
      <DataRow label="Coins selling list" senior={CHECK} standard={CROSS} />
      <DataRow
        label="Seller Tag"
        senior={
          <View style={styles.seniorBadge}>
            <Text style={styles.seniorBadgeText}>Senior Seller</Text>
          </View>
        }
        standard={
          <View style={styles.standardBadge}>
            <Text style={styles.standardBadgeText}>Seller</Text>
          </View>
        }
      />
    </>
  );
}

/* ── Trading Sub-Tab ─────────────────────────────────────────────────────── */

const SELLER_RECHARGE_METHODS: RechargePaymentMethod[] = [
  "epay",
  "usdt_trc20",
  "usdt_bep20",
];

const PAYMENT_METHOD_LABELS: Record<RechargePaymentMethod, string> = {
  epay: "ePay",
  usdt_trc20: "USDT TRC20",
  usdt_bep20: "USDT BEP20 (Binance)",
};

const RECHARGE_METHOD_ICONS: Record<
  RechargePaymentMethod,
  React.ComponentType<{ width: number; height: number }>
> = {
  epay: EpayIcon,
  usdt_trc20: UsdtIcon,
  usdt_bep20: BinanceIcon,
};

function rechargeAddressLabel(method: RechargePaymentMethod): string {
  return method === "epay" ? "ePay email" : "Wallet address";
}

function rechargeCopyHint(method: RechargePaymentMethod): string {
  return method === "epay" ? "Tap to copy email" : "Tap to copy address";
}

function TradingTab({
  profile,
  tradingAction,
  setTradingAction,
  targetUserId,
  onTargetUserIdChange,
  resolvedTarget,
  checkingTarget,
  onCheckUser,
  transferAmount,
  setTransferAmount,
  targetType,
  setTargetType,
  exchangePoints,
  setExchangePoints,
  myPointBalance,
  exchangeRequests,
  onExchangeSubmit,
  onNavigateDetails,
  // Recharge props
  rechargePackages,
  rechargePaymentInfo,
  rechargeRequests,
  rechargeStep,
  setRechargeStep,
  selectedRechargeUsd,
  setSelectedRechargeUsd,
  customRechargeUsd,
  setCustomRechargeUsd,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  rechargeTxHash,
  setRechargeTxHash,
  rechargeProof,
  onPickProof,
  onSubmitRecharge,
  onTransferSubmit,
  submitting,
}: {
  profile: CoinSellerProfile;
  tradingAction: TradingAction;
  setTradingAction: (a: TradingAction) => void;
  targetUserId: string;
  onTargetUserIdChange: (v: string) => void;
  resolvedTarget: PublicUser | null;
  checkingTarget: boolean;
  onCheckUser: () => void;
  transferAmount: string;
  setTransferAmount: (v: string) => void;
  targetType: CoinSellerTargetType;
  setTargetType: (v: CoinSellerTargetType) => void;
  exchangePoints: string;
  setExchangePoints: (v: string) => void;
  /** Wallet bean balance — shown as “Available beans” in Exchange */
  myPointBalance: number;
  exchangeRequests: SellerExchangeRequest[];
  onExchangeSubmit: () => void;
  onNavigateDetails: () => void;
  rechargePackages: SellerRechargePackage[];
  rechargePaymentInfo: SellerRechargePaymentInfo | null;
  rechargeRequests: SellerRechargeRequest[];
  rechargeStep: 1 | 2 | 3;
  setRechargeStep: (s: 1 | 2 | 3) => void;
  selectedRechargeUsd: number | null;
  setSelectedRechargeUsd: (v: number | null) => void;
  customRechargeUsd: string;
  setCustomRechargeUsd: (v: string) => void;
  selectedPaymentMethod: RechargePaymentMethod | null;
  setSelectedPaymentMethod: (v: RechargePaymentMethod | null) => void;
  rechargeTxHash: string;
  setRechargeTxHash: (v: string) => void;
  rechargeProof: { uri: string; name: string; type: string } | null;
  onPickProof: () => void;
  onSubmitRecharge: () => void;
  onTransferSubmit: () => void;
  submitting: boolean;
}) {
  const p = profile as any;

  const amountNum = parseInt(transferAmount || "0", 10);
  const amountValid = !isNaN(amountNum) && amountNum > 0 && amountNum % 1 === 0;
  const transferCanSubmit =
    targetUserId.trim() !== "" && transferAmount.trim() !== "" && amountValid;

  const effectiveUsd =
    selectedRechargeUsd ??
    (customRechargeUsd ? parseFloat(customRechargeUsd) : null);
  const selectedPkg = rechargePackages.find(
    (pkg) => pkg.amountUsd === effectiveUsd,
  );

  const walletAddress =
    selectedPaymentMethod && rechargePaymentInfo
      ? rechargePaymentInfo[
          selectedPaymentMethod as keyof SellerRechargePaymentInfo
        ]
      : "";

  const rechargeMethodPreviewLabel = selectedPaymentMethod
    ? PAYMENT_METHOD_LABELS[selectedPaymentMethod]
    : "Epay";

  const EXCHANGE_RATE_SHOW = 10_000;
  const exchangePtsParsed = parseInt(
    exchangePoints.replace(/,/g, "").trim(),
    10,
  );
  const exchangePtsValid =
    exchangePoints.trim() !== "" &&
    !Number.isNaN(exchangePtsParsed) &&
    exchangePtsParsed > 0;
  const offlineCoinsPreview = exchangePtsValid
    ? exchangePtsParsed.toLocaleString()
    : "—";

  const levelDisplay = String(
    p.level_name ?? profile.seller_level ?? "Coin Seller",
  );

  return (
    <View style={styles.tabContent}>
      {/* ── Attention banner ── */}
      <View style={styles.attentionBanner}>
        <Text style={styles.attentionText}>
          Attention: Coin sellers with no sales for 15 consecutive days will be
          downgraded to Beginner Coin Seller.
        </Text>
      </View>

      {/* ── Available balance card ── */}
      <View style={styles.card}>
        <View style={styles.balanceHeaderRow}>
          <Text style={styles.balanceTitle}>Available balance</Text>
          <TouchableOpacity onPress={onNavigateDetails}>
            <Text style={styles.tradingDetailsLink}>Details &gt;</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tradingBalanceHeroRow}>
          <Image
            source={require("../../../assets/coin.png")}
            style={styles.tradingBalanceHeroCoin}
            contentFit="contain"
          />
          <Text style={styles.tradingBalanceHeroAmount}>
            {profile.available_balance.toLocaleString()}
          </Text>
        </View>

        <View style={styles.depositRow}>
          <Text style={styles.depositText}>Security Deposit:{"  "}</Text>
          <Image
            source={require("../../../assets/coin.png")}
            style={styles.coinIcon14}
            contentFit="contain"
          />
          <Text style={styles.depositText}>
            {profile.security_deposit.toLocaleString()}
          </Text>
          <TouchableOpacity hitSlop={8} onPress={() => {}}>
            <Ionicons name="help-circle-outline" size={16} color="#999" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Current level header + trading form (compound card, matches Trading tab design) ── */}
      <View style={styles.tradingCompoundCard}>
        <View style={styles.tradingCompoundHeader}>
          <View style={styles.tradingLevelHeaderRow}>
            <Text style={styles.tradingCompoundHeaderText} numberOfLines={1}>
              Current level: {levelDisplay}
            </Text>
            <View style={styles.tradingLevelBadge}>
              <Image
                source={require("../../../assets/coin.png")}
                style={styles.tradingLevelBadgeCoin}
                contentFit="contain"
              />
              <Text style={styles.tradingLevelBadgeText} numberOfLines={1}>
                {levelDisplay}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.tradingCompoundBody}>
          <View style={styles.tradingPillRow}>
            <View style={styles.tradingSegmentTrack}>
              {TRADING_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action}
                  style={[
                    styles.tradingSegmentOption,
                    tradingAction === action &&
                      styles.tradingSegmentOptionActive,
                  ]}
                  onPress={() => setTradingAction(action)}
                >
                  <Text
                    style={[
                      styles.tradingSegmentLabel,
                      tradingAction === action &&
                        styles.tradingSegmentLabelActive,
                    ]}
                  >
                    {action}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Transfer ── */}
          {tradingAction === "Transfer" && (
            <View style={styles.formSection}>
              <Text style={styles.formLabelBold}>Sales method:</Text>
              <View style={styles.radioRow}>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setTargetType("user")}
                >
                  <Ionicons
                    name={
                      targetType === "user"
                        ? "radio-button-on-outline"
                        : "radio-button-off-outline"
                    }
                    size={18}
                    color={targetType === "user" ? PRIMARY : "#999"}
                  />
                  <Text style={styles.radioLabel}>User</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setTargetType("coin_seller")}
                >
                  <Ionicons
                    name={
                      targetType === "coin_seller"
                        ? "radio-button-on-outline"
                        : "radio-button-off-outline"
                    }
                    size={18}
                    color={targetType === "coin_seller" ? PRIMARY : "#999"}
                  />
                  <Text style={styles.radioLabel}>Coin seller</Text>
                </TouchableOpacity>
              </View>
              {targetType === "coin_seller" ? (
                <Text style={styles.transferHelperText}>
                  The recipient must already be a registered coin seller. Check
                  confirms Haka ID or Special ID exists.
                </Text>
              ) : null}
              <Text style={styles.formLabelBold}>Haka ID or Special ID:</Text>
              <View style={styles.inputWithBtn}>
                <TextInput
                  style={styles.inputInner}
                  placeholder="Enter Haka ID or Special ID"
                  placeholderTextColor="#999"
                  value={targetUserId}
                  onChangeText={onTargetUserIdChange}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  onPress={onCheckUser}
                  disabled={checkingTarget}
                  hitSlop={8}
                >
                  <Text style={styles.checkBtn}>
                    {checkingTarget ? "..." : "Check"}
                  </Text>
                </TouchableOpacity>
              </View>
              {resolvedTarget && (
                <View style={styles.resolvedUserRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#22C97A" />
                  <Text style={styles.resolvedUserText}>
                    {resolvedTarget.displayName} {resolvedTarget.hakaId ?? ""}
                  </Text>
                </View>
              )}
              <Text style={styles.formLabelBold}>Amount:</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Please enter a multiple of 1"
                placeholderTextColor="#999"
                value={transferAmount}
                onChangeText={setTransferAmount}
                keyboardType="number-pad"
              />
              {transferAmount !== "" && !amountValid ? (
                <Text style={styles.amountError}>
                  Please enter a multiple of 1
                </Text>
              ) : null}
              <View style={styles.receiveRow}>
                <Text style={styles.receiveText}>Will receive coins. </Text>
                <Image
                  source={require("../../../assets/coin.png")}
                  style={styles.coinIcon14}
                  contentFit="contain"
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  styles.transferSubmitBtn,
                  (!transferCanSubmit || submitting) &&
                    styles.submitBtnDisabled,
                ]}
                onPress={onTransferSubmit}
                disabled={!transferCanSubmit || submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Transfer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Recharge ── */}
          {tradingAction === "Recharge" && (
            <View style={styles.formSection}>
              {/* Step indicator — hidden on step 1 to match reference layout */}
              {rechargeStep !== 1 && (
                <View style={styles.rechargeStepRow}>
                  {([1, 2, 3] as const).map((s) => (
                    <View key={s} style={styles.rechargeStepItem}>
                      <View
                        style={[
                          styles.rechargeStepDot,
                          rechargeStep >= s && styles.rechargeStepDotActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.rechargeStepNum,
                            rechargeStep >= s && styles.rechargeStepNumActive,
                          ]}
                        >
                          {s}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.rechargeStepLabel,
                          rechargeStep >= s && styles.rechargeStepLabelActive,
                        ]}
                      >
                        {s === 1 ? "Amount" : s === 2 ? "Method" : "Proof"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Step 1: amount grid (reference UI) */}
              {rechargeStep === 1 && (
                <>
                  <View style={styles.rechargeSellerRow}>
                    <View>
                      <Text style={styles.rechargeOfficialLabel}>
                        Official Seller
                      </Text>
                      <View style={styles.rechargeOfficialUnderline} />
                    </View>
                    <TouchableOpacity
                      style={styles.rechargeMethodPick}
                      onPress={() => setRechargeStep(2)}
                      hitSlop={8}
                    >
                      {selectedPaymentMethod === "usdt_trc20" ||
                      selectedPaymentMethod === "usdt_bep20" ? (
                        <UsdtIcon width={22} height={22} />
                      ) : (
                        <EpayIcon width={22} height={22} />
                      )}
                      <Text style={styles.rechargeMethodPickText}>
                        {rechargeMethodPreviewLabel}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#333" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.rechargeCustomizeBox}>
                    <Text style={styles.rechargeCustomizeTitle}>Customize</Text>
                    <TextInput
                      style={styles.rechargeCustomizeInput}
                      placeholder="Min $10 USD"
                      placeholderTextColor="#999"
                      value={customRechargeUsd}
                      onChangeText={(v) => {
                        setCustomRechargeUsd(v);
                        setSelectedRechargeUsd(null);
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {effectiveUsd !== null && (
                    <View style={styles.rechargeConversionRow}>
                      <Image
                        source={require("../../../assets/coin.png")}
                        style={styles.coinIcon14}
                        contentFit="contain"
                      />
                      <Text style={styles.rechargeConversionText}>
                        ≈{" "}
                        {selectedPkg
                          ? selectedPkg.coinsToCredit.toLocaleString()
                          : Math.floor(
                              effectiveUsd * 10000,
                            ).toLocaleString()}{" "}
                        coins
                      </Text>
                    </View>
                  )}

                  <View style={styles.rechargeTileGrid}>
                    {[...rechargePackages]
                      .sort((a, b) => a.amountUsd - b.amountUsd)
                      .map((pkg) => {
                        const selected = selectedRechargeUsd === pkg.amountUsd;
                        return (
                          <TouchableOpacity
                            key={pkg.id}
                            style={[
                              styles.rechargeTile,
                              selected && styles.rechargeTileActive,
                            ]}
                            onPress={() => {
                              setSelectedRechargeUsd(pkg.amountUsd);
                              setCustomRechargeUsd("");
                            }}
                          >
                            <Image
                              source={require("../../../assets/coin.png")}
                              style={styles.rechargeTileCoin}
                              contentFit="contain"
                            />
                            <Text
                              style={[
                                styles.rechargeTileCoins,
                                selected && styles.rechargeTileCoinsActive,
                              ]}
                            >
                              {pkg.coinsToCredit.toLocaleString()}
                            </Text>
                            <Text
                              style={[
                                styles.rechargeTileUsd,
                                selected && styles.rechargeTileUsdActive,
                              ]}
                            >
                              ${pkg.amountUsd}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.rechargeCtaBtn,
                      (!effectiveUsd || effectiveUsd < 10) &&
                        styles.rechargeBtnDisabled,
                    ]}
                    onPress={() =>
                      effectiveUsd && effectiveUsd >= 10 && setRechargeStep(2)
                    }
                    disabled={!effectiveUsd || effectiveUsd < 10}
                  >
                    <Text style={styles.rechargeCtaBtnText}>Recharge</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Step 2: Select payment method */}
              {rechargeStep === 2 && (
                <>
                  <Text style={styles.formLabelBold}>
                    Select payment method:
                  </Text>
                  {SELLER_RECHARGE_METHODS.map((method) => {
                    const MethodIcon = RECHARGE_METHOD_ICONS[method];
                    return (
                      <TouchableOpacity
                        key={method}
                        style={[
                          styles.rechargeMethodRow,
                          selectedPaymentMethod === method &&
                            styles.rechargeMethodRowActive,
                        ]}
                        onPress={() => setSelectedPaymentMethod(method)}
                      >
                        <Ionicons
                          name={
                            selectedPaymentMethod === method
                              ? "radio-button-on"
                              : "radio-button-off"
                          }
                          size={20}
                          color={
                            selectedPaymentMethod === method ? PRIMARY : "#999"
                          }
                        />
                        <MethodIcon width={22} height={22} />
                        <Text style={styles.rechargeMethodLabel}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {selectedPaymentMethod && walletAddress ? (
                    <View style={styles.walletAddressCard}>
                      <Text style={styles.walletAddressLabel}>
                        Send payment to ({rechargeAddressLabel(selectedPaymentMethod)}):
                      </Text>
                      <TouchableOpacity
                        onPress={() => Clipboard.setString(walletAddress)}
                        hitSlop={8}
                      >
                        <Text style={styles.walletAddressText}>
                          {walletAddress}
                        </Text>
                        <Text style={styles.walletAddressCopyHint}>
                          {rechargeCopyHint(selectedPaymentMethod)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : selectedPaymentMethod && !walletAddress ? (
                    <Text style={styles.rechargeHint}>
                      Payment info not configured yet. Contact support.
                    </Text>
                  ) : null}
                  <View style={styles.rechargeNavRow}>
                    <TouchableOpacity
                      style={styles.rechargeBackBtn}
                      onPress={() => setRechargeStep(1)}
                    >
                      <Text style={styles.rechargeBackBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.rechargeNextBtn,
                        !selectedPaymentMethod && styles.rechargeBtnDisabled,
                      ]}
                      onPress={() =>
                        selectedPaymentMethod && setRechargeStep(3)
                      }
                      disabled={!selectedPaymentMethod}
                    >
                      <Text style={styles.rechargeNextBtnText}>Next</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Step 3: Upload proof and submit */}
              {rechargeStep === 3 && (
                <>
                  <Text style={styles.formLabelBold}>
                    Transaction Hash (optional):
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Enter TX hash if available"
                    placeholderTextColor="#999"
                    value={rechargeTxHash}
                    onChangeText={setRechargeTxHash}
                  />
                  <Text style={styles.formLabelBold}>
                    Upload payment proof screenshot:
                  </Text>
                  <TouchableOpacity
                    style={styles.proofUploadBtn}
                    onPress={onPickProof}
                  >
                    {rechargeProof ? (
                      <Image
                        source={{ uri: rechargeProof.uri }}
                        style={styles.proofPreview}
                        contentFit="cover"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={28}
                          color={PRIMARY}
                        />
                        <Text style={styles.proofUploadText}>
                          Tap to select screenshot
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.rechargeSummaryCard}>
                    <Text style={styles.rechargeSummaryLine}>
                      Amount:{" "}
                      <Text style={styles.rechargeSummaryValue}>
                        ${effectiveUsd}
                      </Text>
                    </Text>
                    <Text style={styles.rechargeSummaryLine}>
                      Method:{" "}
                      <Text style={styles.rechargeSummaryValue}>
                        {selectedPaymentMethod
                          ? PAYMENT_METHOD_LABELS[selectedPaymentMethod]
                          : ""}
                      </Text>
                    </Text>
                    <Text style={styles.rechargeSummaryLine}>
                      Coins:{" "}
                      <Text style={styles.rechargeSummaryValue}>
                        {selectedPkg
                          ? selectedPkg.coinsToCredit.toLocaleString()
                          : effectiveUsd
                            ? Math.floor(effectiveUsd * 10000).toLocaleString()
                            : 0}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.rechargeNavRow}>
                    <TouchableOpacity
                      style={styles.rechargeBackBtn}
                      onPress={() => setRechargeStep(2)}
                    >
                      <Text style={styles.rechargeBackBtnText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.rechargeNextBtn,
                        (!rechargeProof || submitting) &&
                          styles.rechargeBtnDisabled,
                      ]}
                      onPress={onSubmitRecharge}
                      disabled={!rechargeProof || submitting}
                    >
                      <Text style={styles.rechargeNextBtnText}>
                        {submitting ? "Submitting..." : "Submit Request"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Recent requests */}
              {rechargeRequests.length > 0 && (
                <>
                  <Text
                    style={[styles.formLabelBold, { marginTop: Spacing.sm }]}
                  >
                    Recent requests:
                  </Text>
                  {rechargeRequests.slice(0, 5).map((req) => (
                    <View key={req.id} style={styles.rechargeRequestRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rechargeRequestAmt}>
                          ${Number(req.amountUsd).toFixed(2)} —{" "}
                          {req.coinsToCredit.toLocaleString()} coins
                        </Text>
                        <Text style={styles.rechargeRequestMeta}>
                          {PAYMENT_METHOD_LABELS[req.paymentMethod] ??
                            req.paymentMethod}{" "}
                          · {new Date(req.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.rechargeStatusBadge,
                          req.status === "approved"
                            ? styles.rechargeStatusApproved
                            : req.status === "rejected"
                              ? styles.rechargeStatusRejected
                              : styles.rechargeStatusPending,
                        ]}
                      >
                        <Text style={styles.rechargeStatusText}>
                          {req.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* ── Exchange ── */}
          {tradingAction === "Exchange" && (
            <View style={styles.exchangeSection}>
              <View style={styles.exchangeMyPointRow}>
                <Text style={styles.exchangeMyPointLabel}>
                  Available beans:
                </Text>
                <Image
                  source={BEAN_IMG}
                  style={styles.exchangeBeanIconMd}
                  contentFit="contain"
                />
                <Text style={styles.exchangeMyPointValue}>
                  {myPointBalance.toLocaleString()}
                </Text>
              </View>

              <View style={styles.exchangeConversionBanner}>
                <View style={styles.exchangeConversionSide}>
                  <Image
                    source={BEAN_IMG}
                    style={styles.exchangeConversionCoin}
                    contentFit="contain"
                  />
                  <Text style={styles.exchangeConversionCaption}>Beans</Text>
                </View>
                <View style={styles.exchangeArrowCluster}>
                  <Ionicons name="chevron-forward" size={14} color="#000" />
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={Colors.live}
                    style={styles.exchangeArrowOverlap}
                  />
                </View>
                <View style={styles.exchangeConversionSide}>
                  <Image
                    source={require("../../../assets/coin.png")}
                    style={styles.exchangeConversionCoin}
                    contentFit="contain"
                  />
                  <Text style={styles.exchangeOfflineCoinsLabel}>
                    Offline Coins
                  </Text>
                </View>
              </View>

              <View style={styles.exchangeRateBlock}>
                <View style={styles.exchangeRateRow}>
                  <Text style={styles.exchangeRateText}>Exchange rate:</Text>
                  <View style={styles.exchangeRateTokens}>
                    <Image
                      source={BEAN_IMG}
                      style={styles.exchangeRateBeanSm}
                      contentFit="contain"
                    />
                    <Text style={styles.exchangeRateNums}>
                      {EXCHANGE_RATE_SHOW.toLocaleString()} ={" "}
                    </Text>
                    <Image
                      source={require("../../../assets/coin.png")}
                      style={styles.exchangeRateCoinSm}
                      contentFit="contain"
                    />
                    <Text style={styles.exchangeRateNums}>
                      {EXCHANGE_RATE_SHOW.toLocaleString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.exchangeRateDivider} />
              </View>

              <View style={styles.exchangeInputShell}>
                <Image
                  source={BEAN_IMG}
                  style={styles.exchangeInputSideBean}
                  contentFit="contain"
                />
                <TextInput
                  style={styles.exchangeInputField}
                  placeholder="Enter Beans"
                  placeholderTextColor="#999"
                  value={exchangePoints}
                  onChangeText={setExchangePoints}
                  keyboardType="number-pad"
                />
                <View style={styles.exchangeInputRight}>
                  <Image
                    source={require("../../../assets/coin.png")}
                    style={styles.exchangeInputSideCoin}
                    contentFit="contain"
                  />
                  <Text style={styles.exchangeInputPreview}>
                    {offlineCoinsPreview}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.exchangeMintBtn,
                  (!exchangePtsValid || submitting) &&
                    styles.rechargeBtnDisabled,
                ]}
                onPress={onExchangeSubmit}
                disabled={!exchangePtsValid || submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.exchangeMintBtnText}>
                  {submitting ? "…" : "Exchange"}
                </Text>
              </TouchableOpacity>

              {exchangeRequests.length > 0 && (
                <>
                  <Text
                    style={[styles.formLabelBold, { marginTop: Spacing.md }]}
                  >
                    Recent exchange requests:
                  </Text>
                  {exchangeRequests.slice(0, 5).map((req) => (
                    <View key={req.id} style={styles.rechargeRequestRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rechargeRequestAmt}>
                          {req.pointsAmount.toLocaleString()} beans → seller
                          coins
                        </Text>
                        <Text style={styles.rechargeRequestMeta}>
                          {new Date(req.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.rechargeStatusBadge,
                          req.status === "approved"
                            ? styles.rechargeStatusApproved
                            : req.status === "rejected"
                              ? styles.rechargeStatusRejected
                              : styles.rechargeStatusPending,
                        ]}
                      >
                        <Text style={styles.rechargeStatusText}>
                          {req.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/* ── Customer Tab ────────────────────────────────────────────────────────── */

function CustomerTab({
  customerSub,
  customers,
  loading,
  onQuickMessage,
}: {
  customerSub: CustomerSub;
  customers: CoinSellerCustomer[];
  loading: boolean;
  onQuickMessage: () => void;
}) {
  const formatDate = (iso: string | null) => {
    if (!iso) return "N/A";
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${min}`;
  };

  return (
    <View style={styles.tabContent}>
      {/* Toolbar */}
      <View style={styles.customerToolbar}>
        <TouchableOpacity style={styles.allDropdown} onPress={() => {}}>
          <Text style={styles.allDropdownText}>All</Text>
          <Ionicons name="chevron-down" size={14} color="#333" />
        </TouchableOpacity>
        {customerSub === "Recommend" && (
          <TouchableOpacity style={styles.quickMsgBtn} onPress={onQuickMessage}>
            <Ionicons name="paper-plane-outline" size={16} color="#22C97A" />
            <Text style={styles.quickMsgText}>Edit Quick Message</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ListRowSkeleton rows={5} />
      ) : customers.length === 0 ? null : (
        <View style={styles.customerListCard}>
          {customers.map((cust, idx) => {
            const tradeCoins = (cust as any).trade_30d_coins ?? 0;
            const tradeCount = cust.trade_count ?? 0;
            const lastTrade = formatDate(cust.last_trade_at ?? null);
            return (
              <View
                key={cust.id}
                style={[
                  styles.customerRow,
                  idx < customers.length - 1 && styles.customerRowBorder,
                ]}
              >
                {/* Avatar */}
                {cust.avatar ? (
                  <Image
                    source={{ uri: cust.avatar }}
                    style={styles.custAvatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.custAvatar, styles.custAvatarFallback]}>
                    <Text style={styles.custAvatarText}>
                      {cust.displayName?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}

                {/* Info */}
                <View style={styles.custInfo}>
                  {/* Name + level badges */}
                  <View style={styles.custNameRow}>
                    <Text style={styles.custName}>{cust.displayName}</Text>
                    <Ionicons
                      name="diamond-outline"
                      size={13}
                      color={Colors.coin}
                    />
                    <Ionicons
                      name="diamond-outline"
                      size={13}
                      color={Colors.coin}
                    />
                  </View>

                  {/* User badge + ID */}
                  <View style={styles.custBadgeRow}>
                    <View style={styles.userBadge}>
                      <Text style={styles.userBadgeText}>User</Text>
                    </View>
                    <CopyableId
                      value={cust.activeSpecialId ?? cust.hakaId}
                      textStyle={styles.custIdText}
                    />
                  </View>

                  {/* Stats */}
                  <View style={styles.custStatsRow}>
                    <View style={styles.custStatCol}>
                      <Text style={styles.custStatLabel}>
                        Trade last 30 days
                      </Text>
                      <View style={styles.custStatValueRow}>
                        <Image
                          source={require("../../../assets/coin.png")}
                          style={styles.coinIcon12}
                          contentFit="contain"
                        />
                        <Text style={styles.custStatValue}>
                          {tradeCoins.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.custStatCol}>
                      <Text style={styles.custStatLabel}>Trade times</Text>
                      <Text style={styles.custStatValue}>{tradeCount}</Text>
                    </View>
                    <View style={styles.custStatCol}>
                      <Text style={styles.custStatLabel}>Last trade</Text>
                      <Text style={styles.custStatValue}>{lastTrade}</Text>
                    </View>
                  </View>
                </View>

                {/* Chat button */}
                <TouchableOpacity style={styles.chatBtn} onPress={() => {}}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  // Error / empty state
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  errorStateText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: PRIMARY,
    borderRadius: Radius.full,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: BG,
  },
  headerTabs: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
  },
  headerTabBtn: {
    alignItems: "center",
    paddingBottom: 4,
  },
  headerTabText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#666",
  },
  headerTabTextActive: {
    fontWeight: "700",
    color: "#000",
  },
  headerTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#000",
    borderRadius: 1,
  },

  // Pill toggle (sub tabs)
  pillToggleWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  pillToggle: {
    flexDirection: "row",
    backgroundColor: "#E0E0E0",
    borderRadius: Radius.full,
    padding: 3,
  },
  pillOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: Radius.full,
  },
  pillOptionActive: {
    backgroundColor: "#FFF",
    ...Shadows.card,
  },
  pillOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  pillOptionTextActive: {
    color: "#000",
    fontWeight: "600",
  },

  tabContent: {
    paddingHorizontal: Spacing.lg,
  },
  /** Coin Seller → Myself: compact horizontal inset + cards */
  myselfTabContent: {
    paddingHorizontal: Spacing.sm,
  },
  myselfCard: {
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // Card
  card: {
    backgroundColor: "#FFF",
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },

  // Profile card (Myself tab)
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  profileAvatarWrap: {},
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    backgroundColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#666",
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    marginBottom: Spacing.sm,
  },
  profileIdRow: { flexDirection: "row", alignItems: "center" },
  profileIdText: { fontSize: 12, color: "#999" },
  metaDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
    gap: Spacing.sm,
  },
  metaIcon: { width: 18, height: 18 },
  coinIcon16: { width: 16, height: 16 },
  coinIcon14: { width: 14, height: 14 },
  coinIcon12: { width: 12, height: 12 },
  metaLabel: { flex: 1, fontSize: 13, color: "#333" },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
  },
  metaValue: { fontSize: 13, color: "#000", fontWeight: "500", maxWidth: 140 },
  metaValueMuted: { color: "#999", fontWeight: "400" },

  paymentOverlayRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  paymentOverlaySheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  paymentOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  paymentOverlayCancel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#888",
    minWidth: 64,
  },
  paymentOverlayTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    flex: 1,
    textAlign: "center",
  },
  paymentOverlayConfirm: {
    fontSize: 15,
    fontWeight: "600",
    color: PRIMARY,
    minWidth: 64,
    textAlign: "right",
  },
  paymentOverlayConfirmDisabled: {
    opacity: 0.45,
  },
  paymentOverlayHint: {
    fontSize: 13,
    color: "#888",
    marginBottom: Spacing.md,
  },
  whatsappModalInput: {
    height: 52,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#FAFAFA",
    marginBottom: Spacing.lg,
  },
  paymentOverlayList: {
    gap: Spacing.sm,
  },
  paymentOverlayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  paymentOverlayIconWrap: {
    width: 44,
    height: 44,
    marginRight: Spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  paymentOverlayLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  paymentOverlayRadioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentOverlayRadioOuterSelected: {
    borderColor: PRIMARY,
  },
  paymentOverlayRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: PRIMARY,
  },
  assistantAvatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EEE",
    alignItems: "center",
    justifyContent: "center",
  },

  // Overview
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    marginBottom: Spacing.sm,
  },
  overviewInner: { flexDirection: "row", alignItems: "center" },
  overviewCol: { flex: 1, alignItems: "center", paddingVertical: Spacing.sm },
  overviewDivider: { width: 1, height: 40, backgroundColor: "#F0F0F0" },
  overviewLabel: { fontSize: 12, color: "#999", marginBottom: Spacing.sm },
  overviewValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  overviewValue: { fontSize: 18, fontWeight: "700", color: "#000" },

  // Commission
  commissionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  commissionHeaderTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  commissionHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    flexShrink: 1,
  },
  commissionHeaderValue: { fontSize: 15, fontWeight: "700", color: "#000" },
  commissionTooltipBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  commissionFormulaTooltip: {
    position: "absolute",
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.sm,
    padding: Spacing.md,
    ...Shadows.card,
  },
  commissionFormulaText: {
    fontSize: 12,
    color: "#FFFFFF",
    lineHeight: 18,
  },
  commissionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  commissionLabel: { fontSize: 13, color: "#666", flex: 1 },
  commissionValue: { fontSize: 13, fontWeight: "600", color: "#000" },
  levelUpRow: { paddingBottom: Spacing.sm },
  levelUpText: { fontSize: 12, color: PRIMARY },

  // Level rules
  levelRulesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  detailedRulesLink: { fontSize: 13, color: PRIMARY },
  levelRulesColHeader: {
    flexDirection: "row",
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    marginBottom: Spacing.sm,
  },
  levelRulesColHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },
  levelGroupHeader: {
    backgroundColor: PRIMARY,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginHorizontal: -Spacing.sm,
  },
  levelGroupHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFF",
  },
  levelRulesDataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  levelRulesCell: { fontSize: 12, color: "#444" },
  levelRulesSub: { fontSize: 10, color: "#999" },
  levelRulesSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  seniorBadge: {
    backgroundColor: "#FF8C00",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  seniorBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  standardBadge: {
    borderWidth: 1,
    borderColor: "#FF8C00",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  standardBadgeText: { fontSize: 10, fontWeight: "700", color: "#FF8C00" },

  // Quit
  quitBtn: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  quitText: { fontSize: 14, color: "#FF4444", fontWeight: "500" },

  // Trading — Attention banner
  attentionBanner: {
    backgroundColor: "#FFF9C4",
    borderWidth: 1,
    borderColor: "#E6AC00",
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  attentionText: { fontSize: 12, color: "#666", lineHeight: 18 },

  // My Balance card (Trading — available only)
  balanceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  balanceTitle: { fontSize: 15, fontWeight: "700", color: "#000" },
  tradingDetailsLink: { fontSize: 13, fontWeight: "500", color: "#000" },
  tradingBalanceHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tradingBalanceHeroCoin: { width: 32, height: 32 },
  tradingBalanceHeroAmount: {
    fontSize: 26,
    fontWeight: "700",
    color: "#E8A020",
  },
  depositRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  depositText: { fontSize: 12, color: "#999" },

  tradingCompoundCard: {
    borderRadius: 15,
    overflow: "hidden",
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  tradingCompoundHeader: {
    backgroundColor: TRADING_LEVEL_HEADER_BG,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: TRADING_LEVEL_HEADER_BORDER,
  },
  tradingLevelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  tradingCompoundHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    flexShrink: 1,
  },
  tradingLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FF8C00",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    maxWidth: "48%",
  },
  tradingLevelBadgeCoin: { width: 12, height: 12 },
  tradingLevelBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  tradingCompoundBody: {
    backgroundColor: "#FFF",
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  tradingPillRow: {
    marginBottom: Spacing.sm,
  },

  /** Segmented control — SVG: track #8C8C8C @ 10%, inner active pill white rx≈15.5 */
  tradingSegmentTrack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(140, 140, 140, 0.1)",
    borderRadius: 17.5,
    padding: Spacing.sm,
    minHeight: 35,
  },
  tradingSegmentOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    borderRadius: 15.5,
  },
  tradingSegmentOptionActive: {
    backgroundColor: "#FFF",
    ...Shadows.card,
  },
  tradingSegmentLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  tradingSegmentLabelActive: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000",
  },

  rechargeSellerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  rechargeOfficialLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  rechargeOfficialUnderline: {
    marginTop: Spacing.sm,
    width: 96,
    height: 3,
    backgroundColor: "#000",
    borderRadius: 2,
  },
  rechargeMethodPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rechargeMethodPickText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  rechargeCustomizeBox: {
    backgroundColor: "#EFEFEF",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rechargeCustomizeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: Spacing.sm,
  },
  rechargeCustomizeInput: {
    fontSize: 15,
    color: "#000",
    paddingVertical: Spacing.sm,
  },
  rechargeTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: RECHARGE_TILE_GAP,
    rowGap: RECHARGE_TILE_GAP,
    marginBottom: Spacing.sm,
    justifyContent: "flex-start",
  },
  rechargeTile: {
    width: RECHARGE_TILE_WIDTH,
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  rechargeTileActive: {
    backgroundColor: "#FFF",
    borderColor: PRIMARY,
    ...Shadows.card,
  },
  rechargeTileCoin: {
    width: 22,
    height: 22,
    marginBottom: Spacing.sm,
  },
  rechargeTileCoins: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: Spacing.sm,
  },
  rechargeTileCoinsActive: {
    fontWeight: "700",
    color: "#000",
  },
  rechargeTileUsd: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666",
  },
  rechargeTileUsdActive: {
    fontWeight: "700",
    color: "#000",
  },
  rechargeCtaBtn: {
    height: 52,
    backgroundColor: PRIMARY,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  rechargeCtaBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  /** Exchange — vertical rhythm matches reference (tabs → beans → yellow box → rate + divider → input → CTA) */
  exchangeSection: {
    paddingTop: Spacing.sm,
  },
  exchangeMyPointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  exchangeMyPointLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  exchangeBeanIconMd: {
    width: 22,
    height: 22,
  },
  exchangeMyPointValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    flex: 1,
  },
  exchangeConversionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF9E6",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  exchangeConversionSide: {
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  exchangeConversionCoin: {
    width: 40,
    height: 40,
  },
  exchangeConversionCaption: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  exchangeOfflineCoinsLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.gold,
    textAlign: "center",
  },
  exchangeArrowCluster: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  exchangeArrowOverlap: {
    marginLeft: -6,
  },
  exchangeRateBlock: {
    marginBottom: Spacing.sm,
  },
  exchangeRateRow: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  exchangeRateDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    width: "100%",
  },
  exchangeRateText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },
  exchangeRateTokens: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  exchangeRateCoinSm: {
    width: 16,
    height: 16,
  },
  exchangeRateBeanSm: {
    width: 16,
    height: 16,
  },
  exchangeRateNums: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000",
  },
  exchangeInputShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFEFEF",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    minHeight: 52,
  },
  exchangeInputSideCoin: {
    width: 22,
    height: 22,
  },
  exchangeInputSideBean: {
    width: 22,
    height: 22,
  },
  exchangeMintBtn: {
    height: 52,
    backgroundColor: EXCHANGE_MINT,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  exchangeMintBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  exchangeInputField: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#000",
    paddingVertical: Spacing.sm,
  },
  exchangeInputRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 0,
  },
  exchangeInputPreview: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    minWidth: 28,
  },

  // Trading form
  formSection: { gap: Spacing.sm },
  formLabelBold: { fontSize: 13, fontWeight: "700", color: "#333" },
  transferHelperText: {
    fontSize: 12,
    color: "#666",
    lineHeight: 17,
    marginBottom: Spacing.sm,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: 14,
    color: "#000",
    backgroundColor: "#FFF",
  },
  inputWithBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.sm,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    backgroundColor: "#FFF",
    gap: Spacing.sm,
  },
  inputInner: { flex: 1, fontSize: 14, color: "#000" },
  checkBtn: { fontSize: 14, fontWeight: "700", color: PRIMARY },
  resolvedUserRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  resolvedUserText: {
    fontSize: 12,
    color: "#22C97A",
    fontWeight: "600" as const,
  },
  amountError: { fontSize: 11, color: "#FF4444" },
  receiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  transferSubmitBtn: {
    alignSelf: "stretch",
  },
  receiveText: { fontSize: 13, color: "#999" },

  radioRow: { flexDirection: "row", gap: Spacing.sm },
  radioOption: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  radioLabel: { fontSize: 14, color: "#333" },

  // Package grid (recharge / legacy layouts)
  packageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  packageCard: {
    width: "31%",
    borderWidth: 1,
    borderColor: "#E8A020",
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FFF",
  },
  packageCoins: { fontSize: 14, fontWeight: "600", color: "#000" },
  packagePrice: { fontSize: 11, color: "#666" },

  // Recharge flow
  rechargeStepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  rechargeStepItem: { alignItems: "center", gap: Spacing.sm },
  rechargeStepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  rechargeStepDotActive: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  rechargeStepNum: { fontSize: 12, fontWeight: "700", color: "#CCC" },
  rechargeStepNumActive: { color: "#FFF" },
  rechargeStepLabel: { fontSize: 11, color: "#AAA" },
  rechargeStepLabelActive: { color: PRIMARY, fontWeight: "600" },

  rechargePackageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rechargePackageCard: {
    width: "31%",
    borderWidth: 1.5,
    borderColor: "#DDD",
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FFF",
  },
  rechargePackageCardActive: {
    borderColor: PRIMARY,
    backgroundColor: "#F3EEFF",
  },
  rechargePackageUsd: { fontSize: 16, fontWeight: "700", color: "#333" },
  rechargePackageUsdActive: { color: PRIMARY },
  rechargePackageCoins: { fontSize: 10, color: "#888" },

  rechargeConversionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rechargeConversionText: { fontSize: 13, color: "#555", fontWeight: "500" },

  rechargeNextBtn: {
    height: 46,
    backgroundColor: PRIMARY,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    flex: 1,
  },
  rechargeNextBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  rechargeBtnDisabled: { backgroundColor: "#CCC" },
  rechargeBackBtn: {
    height: 46,
    borderWidth: 1.5,
    borderColor: PRIMARY,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  rechargeBackBtnText: { fontSize: 15, fontWeight: "600", color: PRIMARY },
  rechargeNavRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },

  rechargeMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: "#EEE",
    marginBottom: Spacing.sm,
    backgroundColor: "#FFF",
  },
  rechargeMethodRowActive: { borderColor: PRIMARY, backgroundColor: "#F3EEFF" },
  rechargeMethodLabel: { fontSize: 15, fontWeight: "500", color: "#333" },

  walletAddressCard: {
    backgroundColor: "#F8F6FF",
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: "#DDD",
  },
  walletAddressLabel: { fontSize: 12, color: "#888", marginBottom: Spacing.sm },
  walletAddressText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    fontFamily: "monospace",
  },
  walletAddressCopyHint: {
    fontSize: 11,
    color: PRIMARY,
    marginTop: Spacing.sm,
  },
  rechargeHint: { fontSize: 12, color: "#999", marginTop: Spacing.sm },

  proofUploadBtn: {
    height: 120,
    borderWidth: 1.5,
    borderColor: "#CCC",
    borderRadius: Radius.md,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
    marginBottom: Spacing.sm,
  },
  proofUploadText: { fontSize: 13, color: "#888", marginTop: Spacing.sm },
  proofPreview: { width: "100%", height: "100%", borderRadius: Radius.md },

  rechargeSummaryCard: {
    backgroundColor: "#F8F6FF",
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rechargeSummaryLine: { fontSize: 13, color: "#666" },
  rechargeSummaryValue: { fontWeight: "700", color: "#333" },

  rechargeRequestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rechargeRequestAmt: { fontSize: 13, fontWeight: "600", color: "#333" },
  rechargeRequestMeta: { fontSize: 11, color: "#999", marginTop: Spacing.sm },
  rechargeStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  rechargeStatusPending: { backgroundColor: "#FFF3CD" },
  rechargeStatusApproved: { backgroundColor: "#D1FAE5" },
  rechargeStatusRejected: { backgroundColor: "#FEE2E2" },
  rechargeStatusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#555",
  },

  submitBtn: {
    height: 52,
    backgroundColor: PRIMARY,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },

  // Customer tab
  customerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  allDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: "#FFF",
  },
  allDropdownText: { fontSize: 13, fontWeight: "500", color: "#333" },
  quickMsgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quickMsgText: { fontSize: 13, color: "#22C97A", fontWeight: "500" },

  customerListCard: {
    backgroundColor: "#FFF",
    borderRadius: Radius.md,
    overflow: "hidden",
    ...Shadows.card,
  },
  customerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  customerRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  custAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  custAvatarFallback: {
    backgroundColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
  },
  custAvatarText: { fontSize: 24, fontWeight: "600", color: "#666" },
  custInfo: { flex: 1 },
  custNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  custName: { fontSize: 15, fontWeight: "700", color: "#000" },
  custBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 8,
  },
  userBadge: {
    backgroundColor: "#1E90FF",
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  userBadgeText: { fontSize: 10, fontWeight: "600", color: "#FFF" },
  custIdText: { fontSize: 12, color: "#999" },
  custStatsRow: { flexDirection: "row", gap: Spacing.md },
  custStatCol: { flex: 1 },
  custStatLabel: { fontSize: 11, color: "#999", marginBottom: 2 },
  custStatValueRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  custStatValue: { fontSize: 12, fontWeight: "700", color: "#000" },
  chatBtn: {
    width: 44,
    height: 44,
    backgroundColor: "#E8A020",
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
});
