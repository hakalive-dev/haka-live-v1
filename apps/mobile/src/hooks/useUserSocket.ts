/**
 * useUserSocket
 *
 * Persistent Socket.io connection scoped to the logged-in user. Listens for
 * admin-driven events that affect the session:
 *   - user:force_logout → tokens revoked (ban, security action); log out now
 *   - user:profile_updated → account data changed (e.g. tag assigned/revoked);
 *     refetch /auth/me and update Redux in place, staying logged in
 *
 * Also handles real-time balance updates:
 *   - commission:credited  → increments bean balance in Redux + shows toast
 *   - agency:gift_stats_updated → bumps agency summary refresh (rolling income / gift bonus tiers when no bean row)
 *   - seller:rates_updated → live commission % on Coin Seller screen
 *   - seller:recharge_approved → shows toast to coin sellers
 *   - seller:exchange_approved → syncs bean balance; toast unless payload.silent (instant seller exchange)
 *
 * Mount this once at the authenticated app root.
 */

import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { io as ioClient, Socket as SocketIOClient } from "socket.io-client";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../store";
import { TokenStorage } from "../storage";
import {
  clearAuth,
  setUser,
  bumpCommission,
  bumpAgencyGiftStats,
  bumpHostCenter,
  bumpSellerStats,
  bumpSupportTicketReply,
  setLiveSellerRates,
  setChatMuted,
  type LiveSellerRates,
} from "../store/authSlice";
import { authApi } from "../api/auth";
import { clearProfile, setPendingVisitor } from "../store/profileSlice";
import {
  incrementBeanBalance,
  setBeanBalance,
  clearWallet,
} from "../store/walletSlice";
import type { VisitorEntry } from "../types";
import { useToast } from "../components/Toast";
import { usePurchaseSuccess } from "../components/PurchaseSuccessModal";
import {
  useSeatInvitePrompt,
  type SeatInvitationPayload,
} from "../components/SeatInvitePrompt";
import { normalizeSeatInvitationPayload } from "../utils/seatInvitePayload";
import { getActiveRoomIdFromNavigation } from "../navigation/roomNavigation";
import { promptIncomingVideoCallFromSocket } from "../utils/incomingVideoCall";
import { leaveVideoCallIfActive } from "../utils/videoCall";
import { CALL_EVENTS } from "@haka-live/shared-types/events";
import { queryClient } from "../api/queryClient";
import { queryKeys } from "../api/queryKeys";
import { invalidateChatUnreadQueries } from "./useDMConnection";

interface ForceLogoutPayload {
  reason?: string;
}

interface CommissionCreditedPayload {
  commissionType:
    | "direct"
    | "parent_delta"
    | "gift_bonus"
    | "cs_total_commission"
    | "cs_gift_commission"
    | "cs_income_reward"
    | "cs_gift_bonus";
  amount: number;
  hostName: string;
  giftName: string;
  giftIcon: string;
  sellerRates?: LiveSellerRates;
}

interface SellerRechargeApprovedPayload {
  rechargeId: string;
  coinsAdded: number;
  amountUsd: number;
  newBalance: number;
}

interface CoinsReceivedPayload {
  coinsAmount: number;
  newBalance: number;
  reference?: string;
  source?: string;
}

function walletCoinsReceivedModalTitle(payload: CoinsReceivedPayload): string {
  if (
    payload.reference === "coin_seller_transfer" ||
    payload.source === "offline_recharge"
  ) {
    return "Transfer complete";
  }
  if (payload.reference === "top_up" || payload.source === "official_recharge") {
    return "Purchase Success";
  }
  return "Coins received";
}

interface SellerExchangeApprovedPayload {
  exchangeId: string;
  pointsAmount: number;
  newSellerBalance: number;
  newBeanBalance: number;
  /** When true, only sync Redux — caller already showed UI (e.g. instant self-service exchange). */
  silent?: boolean;
}

const COMMISSION_TYPE_LABEL: Record<
  CommissionCreditedPayload["commissionType"],
  string
> = {
  direct: "Commission",
  parent_delta: "Parent commission",
  gift_bonus: "Agency gift bonus",
  cs_total_commission: "Total commission",
  cs_gift_commission: "Gift commission",
  cs_income_reward: "Income reward",
  cs_gift_bonus: "Gift bonus",
};

const REASON_MESSAGE: Record<string, string> = {
  banned: "Your account has been suspended.",
  session_revoked: "Your session was ended by an administrator.",
  // Tag assign/revoke no longer forces a logout — it pushes `user:profile_updated`
  // so the client refreshes badges/permissions live (see handler below).
};

export function useUserSocket(enabled: boolean) {
  const dispatch = useDispatch();
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const toast = useToast();
  const purchaseSuccess = usePurchaseSuccess();
  const seatInvitePrompt = useSeatInvitePrompt();
  const socket = useRef<SocketIOClient | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) return;

    socket.current?.disconnect();
    socket.current = null;

    const baseUrl = (
      process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3010/api/v1"
    ).replace("/api/v1", "");

    const client = ioClient(baseUrl, {
      transports: ["websocket"],
      auth: { token: accessToken },
    });
    socket.current = client;

    client.on("user:force_logout", async (payload: ForceLogoutPayload) => {
        const message =
          REASON_MESSAGE[payload?.reason ?? ""] ?? "You have been signed out.";
        await TokenStorage.clear();
        queryClient.clear();
        dispatch(clearAuth());
        dispatch(clearProfile());
        dispatch(clearWallet());
        Alert.alert("Signed Out", message);
      });

      // Admin changed something on the account (e.g. a tag was assigned/revoked)
      // that should reflect now WITHOUT logging the user out. Refetch the canonical
      // user and update Redux in place so badges/permissions update live. Tokens
      // are untouched; the next session refresh reconciles if this best-effort
      // fetch fails.
      client.on("user:profile_updated", async () => {
        try {
          const user = await authApi.getMe();
          await TokenStorage.setUserJson(JSON.stringify(user));
          dispatch(setUser(user));
        } catch {
          /* best-effort — leave cached user until the next refresh */
        }
      });

      // Commission earned (agent/agency) — increment bean balance immediately
      // so the wallet UI updates without a manual refresh.
      client.on("commission:credited", (payload: CommissionCreditedPayload) => {
        const label =
          COMMISSION_TYPE_LABEL[payload.commissionType] ?? "Commission";
        const icon = payload.giftIcon ? ` ${payload.giftIcon}` : "";
        dispatch(incrementBeanBalance(payload.amount));
        dispatch(bumpCommission());
        void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agency.center() });
        if (payload.sellerRates) {
          dispatch(setLiveSellerRates(payload.sellerRates));
        }

        const isCs = payload.commissionType.startsWith("cs_");
        if (isCs) {
          if (
            payload.commissionType === "cs_total_commission" ||
            !payload.sellerRates
          ) {
            dispatch(bumpSellerStats());
          }
        } else if (!payload.sellerRates) {
          dispatch(bumpSellerStats());
        }
        toast.show(
          `+${payload.amount} beans ${label}${icon} from ${payload.hostName}`,
          "success",
        );
      });

      /** Rolling agency income / gift-bonus tier inputs changed without a credited bean row (floored commission). */
      client.on("agency:gift_stats_updated", () => {
        dispatch(bumpAgencyGiftStats());
        void queryClient.invalidateQueries({ queryKey: queryKeys.agency.center() });
      });

      /** Host Centre income/mic/tier — gift to host or agency request resolved */
      client.on("host:stats_tick", (payload?: { reason?: string; beansAdded?: number }) => {
        dispatch(bumpHostCenter());
        if (payload?.beansAdded) {
          dispatch(incrementBeanBalance(payload.beansAdded));
        }
      });

      /** Agent: a host submitted leave/change request (refresh pending list in Agency Centre) */
      client.on("agency:host_change_request", () => {
        dispatch(bumpHostCenter());
      });

      // Coin seller recharge approved by admin
      client.on(
        "seller:recharge_approved",
        (payload: SellerRechargeApprovedPayload) => {
          dispatch(bumpSellerStats());
          void queryClient.invalidateQueries({ queryKey: queryKeys.coinSeller.bootstrap() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
          toast.show(
            `✅ Recharge approved! +${payload.coinsAdded.toLocaleString()} coins credited ($${payload.amountUsd})`,
            "success",
          );
        },
      );

      client.on(
        "seller:exchange_approved",
        (payload: SellerExchangeApprovedPayload) => {
          dispatch(setBeanBalance(payload.newBeanBalance));
          dispatch(bumpSellerStats());
          void queryClient.invalidateQueries({ queryKey: queryKeys.coinSeller.bootstrap() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
          if (!payload.silent) {
            toast.show(
              `✅ Point exchange approved! ${payload.pointsAmount.toLocaleString()} pts → seller balance (+${payload.pointsAmount.toLocaleString()} offline coins)`,
              "success",
            );
          }
        },
      );

      client.on("wallet:coins_received", (payload: CoinsReceivedPayload) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
        invalidateChatUnreadQueries(queryClient);
        purchaseSuccess.show(
          payload.coinsAmount,
          payload.newBalance,
          walletCoinsReceivedModalTitle(payload),
        );
      });

      client.on(
        "wallet:beans_updated",
        (payload: { beansAdded: number; newBalance: number; reference?: string }) => {
          dispatch(setBeanBalance(payload.newBalance));
          void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.balance() });
          if (payload.beansAdded > 0) {
            toast.show(
              `+${payload.beansAdded.toLocaleString()} beans credited to your wallet`,
              "success",
            );
          }
        },
      );

      client.on("seller:stats_updated", () => {
        dispatch(bumpSellerStats());
        void queryClient.invalidateQueries({ queryKey: queryKeys.coinSeller.bootstrap() });
      });

      client.on("seller:rates_updated", (payload: LiveSellerRates) => {
        dispatch(setLiveSellerRates(payload));
      });

      // Someone visited the current user's profile
      client.on("profile:new_visitor", (payload: VisitorEntry) => {
        dispatch(setPendingVisitor(payload));
      });

      // Admin muted/unmuted the user — lock or release the chat composer
      // immediately. Server still enforces the rule; this is for UX only.
      client.on("user:muted", () => {
        dispatch(setChatMuted(true));
        toast.show("You have been muted by an administrator", "error");
      });
      client.on("user:unmuted", () => {
        dispatch(setChatMuted(false));
        toast.show("You can chat again", "success");
      });

      client.on(
        "support:ticket_replied",
        (payload: { adminReply?: string }) => {
          dispatch(bumpSupportTicketReply());
          const preview = payload?.adminReply?.trim();
          const msg = preview
            ? `Support replied: ${preview.length > 80 ? `${preview.slice(0, 79)}…` : preview}`
            : "Support replied to your request. Open Haka Team chat to read the full reply.";
          toast.show(msg, "success");
        },
      );

      client.on(
        "notification:new",
        (payload: { type?: string; title?: string; body?: string }) => {
          if (payload?.type === "support_reply") {
            dispatch(bumpSupportTicketReply());
          } else if (payload?.type === "invite_accepted") {
            // Someone accepted this user's invite — surface it live and refresh
            // the coin balance (reward was credited server-side on accept).
            toast.show(payload?.body ?? "Your invite was accepted!", "success");
            void queryClient.invalidateQueries({
              queryKey: queryKeys.wallet.balance(),
            });
          }
        },
      );

      // Host/admin invited this user to take a mic seat — show centered popup.
      client.on("seat.invitation", (payload: SeatInvitationPayload) => {
        const normalized = normalizeSeatInvitationPayload(payload);
        if (!normalized) return;
        const activeRoomId = getActiveRoomIdFromNavigation();
        if (activeRoomId === normalized.roomId) return;
        seatInvitePrompt.show(normalized);
      });

      client.on(
        CALL_EVENTS.INCOMING,
        (payload: {
          callerId: string;
          callerDisplayName: string;
          channelId: string;
          agoraToken: string;
          appId: string;
          uid: number;
        }) => {
          if (!payload?.callerId || !payload?.channelId || !payload?.agoraToken)
            return;
          promptIncomingVideoCallFromSocket({
            callerId: payload.callerId,
            callerDisplayName: payload.callerDisplayName ?? "Someone",
            channelId: payload.channelId,
            agoraToken: payload.agoraToken,
            appId: payload.appId,
            uid: payload.uid,
          });
        },
      );

      const onCallPeerSignal = (payload: { peerId?: string }) => {
        leaveVideoCallIfActive(payload?.peerId);
      };
    client.on(CALL_EVENTS.DECLINED, onCallPeerSignal);
    client.on(CALL_EVENTS.ENDED, onCallPeerSignal);
    client.on(CALL_EVENTS.CANCELLED, onCallPeerSignal);

    return () => {
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [enabled, accessToken, dispatch, toast, purchaseSuccess, seatInvitePrompt]);
}
