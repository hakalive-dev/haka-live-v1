import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useDispatch, useSelector } from "react-redux";
import { RootStackParamList } from "./types";
import { AuthStack } from "./AuthStack";
import { MainStack } from "./MainStack";
import { RoomStack } from "./RoomStack";
import { TokenStorage } from "../storage";
import {
  warmRequestAuthCache,
  refreshSession,
  clearRequestAuthCache,
  isApiError,
} from "../api/client";
import { logDiagnostic, logAppInteractive } from "../diagnostics/releaseDiagnostics";
import { settingsApi } from "../api/settings";
import { applyLanguageFromSettings } from "../i18n/applyLanguage";
import { queryClient } from "../api/queryClient";
import { restoreQueryCache, clearQueryCache } from "../api/queryPersistence";
import { setAuth, clearAuth } from "../store/authSlice";
import { RootState, AppDispatch } from "../store";
import { useUserSocket } from "../hooks/useUserSocket";
import { useSessionRefreshOnResume } from "../hooks/useSessionRefreshOnResume";
import { BootSplash } from "@components/BootSplash";
import { useConnectivity } from "@components/Connectivity";
import { BackendUnreachable, ConnectionBanner } from "@components/ConnectionUI";
import type { User } from "../types";
import { RoomSessionProvider } from "@/room/RoomSessionProvider";
import { RoomSessionLogoutGuard } from "@/room/RoomSessionLogoutGuard";
import { KeptRoomOverlay } from "@/room/KeptRoomOverlay";
import { SessionMusicPlayer } from "@/room/SessionMusicPlayer";
import { navigationRef } from "./navigationRef";
import { usePushRegistration } from "../hooks/usePushRegistration";
import { usePushNotificationOpen } from "../hooks/usePushNotificationOpen";
import { useForegroundPush } from "../hooks/useForegroundPush";
import { useCallNotificationOpen } from "../hooks/useCallNotificationOpen";
import {
  DMConnectionProvider,
} from "../hooks/useDMConnection";
import { useMessagesBadgeQuery } from "../hooks/queries/useMessagesBadgeQuery";
import {
  useInviteLinkCapture,
  usePendingInviteAccept,
} from "../hooks/usePendingInviteAccept";

const Root = createNativeStackNavigator<RootStackParamList>();

function lazyScreen<T = any>(factory: () => T): () => any {
  // React Navigation supports getComponent for lazy screen loading.
  return () => factory() as any;
}

export function RootNavigator() {
  const dispatch = useDispatch<AppDispatch>();
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const user = useSelector((state: RootState) => state.auth.user);
  const [isReady, setIsReady] = useState(false);
  const { reachable, checking, recheck } = useConnectivity();

  // Safety net: never let the boot splash hang. Flip isReady after a hard cap
  // even if some startup step stalls, so the user always reaches a real screen
  // (or the connection gate) rather than a blank splash.
  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // On launch: restore session from secure storage.
  // Always refresh on startup because the 15-min access token expires during
  // normal app closure. The 30-day refresh token keeps the session alive.
  useEffect(() => {
    async function restoreSession() {
      try {
        const [refresh, access, cachedUserJson] = await Promise.all([
          TokenStorage.getRefresh(),
          TokenStorage.getAccess(),
          TokenStorage.getUserJson(),
          // Hydrate the query cache before screens mount so they paint warm data.
          // Runs in parallel with the token reads — adds no serial latency.
          restoreQueryCache(queryClient),
        ]);

        if (!refresh) {
          clearRequestAuthCache();
          return; // No stored session — show auth screen.
        }

        await warmRequestAuthCache();

        // Fast path: if we have cached user + last access token, render immediately.
        // We'll still refresh tokens + /me in the background to keep state canonical.
        if (access && cachedUserJson) {
          try {
            const cachedUser = JSON.parse(cachedUserJson) as User;
            if (cachedUser?.id) {
              dispatch(
                setAuth({
                  user: cachedUser,
                  accessToken: access,
                  refreshToken: refresh,
                }),
              );
            }
          } catch (parseErr) {
            // Corrupted SecureStore blob (rare; OS update / disk issue).
            // Drop the bad cache so we don't retry parsing it on every cold start.
            logDiagnostic('session', 'cached_user_parse_failed', { error: String(parseErr) });
            void TokenStorage.setUserJson('').catch(() => {});
          }
        }

        // Background canonicalization (Render free tier cold starts can be slow).
        // Do not block first paint on this.
        setIsReady(true);

        // Go through the shared, deduped refresh path. Screens mounted by the fast
        // path above may 401 on the stale access token and trigger refreshSession()
        // too; sharing the in-flight mutex means both converge on ONE rotation
        // instead of racing the same refresh token (which logged testers out).
        // refreshSession() also rotates tokens, persists them, and re-dispatches
        // setAuth with the canonical /auth/me user on success.
        const outcome = await refreshSession();
        if (outcome.status === 'auth_failed') {
          logDiagnostic('session', 'restore_auth_rejected', { reason: outcome.status });
          clearRequestAuthCache();
          await TokenStorage.clear();
          dispatch(clearAuth());
          return;
        }
        // 'network' → keep the cached session; a later request retries the refresh.

        // Apply notification sound/vibrate prefs (creates Android channel too)
        // and the saved language preference so the UI loads in the right language.
        settingsApi
          .getSettings()
          .then((s) => applyLanguageFromSettings(s))
          .catch(() => {});
      } catch (err: unknown) {
        const httpStatus = isApiError(err) ? err.status : undefined;
        const message = err instanceof Error ? err.message : String(err);
        if (httpStatus === 401 || httpStatus === 403) {
          logDiagnostic('session', 'restore_auth_rejected', { httpStatus, message });
          clearRequestAuthCache();
          await TokenStorage.clear();
          dispatch(clearAuth());
        } else {
          logDiagnostic('session', 'restore_failed_keep_tokens', { httpStatus, message });
        }
      } finally {
        setIsReady(true);
      }
    }
    restoreSession();
  }, [dispatch]);

  useSessionRefreshOnResume(Boolean(accessToken));

  // Persistent socket for admin-driven session events (force_logout, etc.)
  useUserSocket(Boolean(accessToken));
  usePushRegistration(Boolean(accessToken));
  usePushNotificationOpen(Boolean(accessToken));
  useForegroundPush(Boolean(accessToken));
  useCallNotificationOpen(Boolean(accessToken));
  useMessagesBadgeQuery(Boolean(accessToken));

  useInviteLinkCapture();
  usePendingInviteAccept(
    accessToken,
    Boolean(accessToken && user && user.onboardingComplete),
  );

  // Baseline metric: time from JS boot to first interactive render.
  useEffect(() => {
    if (isReady) logAppInteractive({ authed: Boolean(accessToken) });
  }, [isReady, accessToken]);

  // On logout (token goes truthy → falsy) wipe the query cache, in-memory and
  // on disk, so a different user can't see the previous user's cached data.
  const prevTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevTokenRef.current && !accessToken) {
      queryClient.clear();
      void clearQueryCache();
    }
    prevTokenRef.current = accessToken;
  }, [accessToken]);

  if (!isReady) return <BootSplash />;

  // Hybrid offline handling: when the backend is unreachable AND there's no
  // cached user to render, show a full-screen retry gate instead of letting
  // screens paint blank white. With a cached session we still render the app
  // and surface a retry banner (below).
  if (reachable === false && !user) {
    return <BackendUnreachable checking={checking} onRetry={recheck} />;
  }

  return (
    <DMConnectionProvider enabled={Boolean(accessToken)}>
      <RoomSessionProvider>
        <RoomSessionLogoutGuard />
        <View style={{ flex: 1 }}>
          {reachable === false ? (
            <ConnectionBanner checking={checking} onRetry={recheck} />
          ) : null}
          <NavigationContainer ref={navigationRef}>
          <Root.Navigator screenOptions={{ headerShown: false }}>
            {accessToken && user && !user.onboardingComplete ? (
              <Root.Screen
                name="Onboarding"
                getComponent={lazyScreen(
                  () =>
                    require("@screens/auth/OnboardingScreen").OnboardingScreen,
                )}
              />
            ) : accessToken ? (
              <>
                <Root.Screen name="Main" component={MainStack} />
                <Root.Screen
                  name="RoomModal"
                  component={RoomStack}
                  options={{ presentation: "modal" }}
                />
                <Root.Screen
                  name="PublicProfile"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/profile/PublicProfileScreen")
                        .PublicProfileScreen,
                  )}
                />
                <Root.Screen
                  name="Followers"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/profile/FollowersScreen")
                        .FollowersScreen,
                  )}
                />
                <Root.Screen
                  name="Following"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/profile/FollowingScreen")
                        .FollowingScreen,
                  )}
                />
                <Root.Screen
                  name="Social"
                  getComponent={lazyScreen(
                    () => require("@screens/profile/SocialScreen").SocialScreen,
                  )}
                />
                <Root.Screen
                  name="DMConversation"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/chat/DMConversationScreen")
                        .DMConversationScreen,
                  )}
                />
                <Root.Screen
                  name="VideoCall"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/chat/VideoCallScreen").VideoCallScreen,
                  )}
                  options={{
                    presentation: "fullScreenModal",
                    animation: "fade",
                  }}
                />
                <Root.Screen
                  name="IncomingCall"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/chat/IncomingCallScreen")
                        .IncomingCallScreen,
                  )}
                  options={{
                    presentation: "fullScreenModal",
                    animation: "fade",
                    gestureEnabled: false,
                  }}
                />

                <Root.Screen
                  name="Level"
                  getComponent={lazyScreen(
                    () => require("@screens/level/LevelScreen").LevelScreen,
                  )}
                />
                <Root.Screen
                  name="AgencyCenter"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/AgencyCenterScreen")
                        .AgencyCenterScreen,
                  )}
                />
                <Root.Screen
                  name="AgencyCommissionGuide"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/AgencyCommissionGuideScreen")
                        .AgencyCommissionGuideScreen,
                  )}
                />
                <Root.Screen
                  name="HostManagement"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/HostManagementScreen")
                        .HostManagementScreen,
                  )}
                />
                <Root.Screen
                  name="HostStatDetail"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/HostStatDetailScreen")
                        .HostStatDetailScreen,
                  )}
                />
                <Root.Screen
                  name="NewLevelTask"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/NewLevelTaskScreen")
                        .NewLevelTaskScreen,
                  )}
                />
                <Root.Screen
                  name="FemaleHostTask"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/FemaleHostTaskScreen")
                        .FemaleHostTaskScreen,
                  )}
                />
                <Root.Screen
                  name="BecomeAgent"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/BecomeAgentScreen")
                        .BecomeAgentScreen,
                  )}
                />
                <Root.Screen
                  name="HostAgent"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/HostAgentScreen")
                        .HostAgentScreen,
                  )}
                />
                <Root.Screen
                  name="AgencyInvitations"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/agency/AgencyInvitationsScreen")
                        .AgencyInvitationsScreen,
                  )}
                />
                <Root.Screen
                  name="FamilyHub"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/family/FamilyHubScreen")
                        .FamilyHubScreen,
                  )}
                />
                <Root.Screen
                  name="FamilyDetail"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/family/FamilyDetailScreen")
                        .FamilyDetailScreen,
                  )}
                />
                <Root.Screen
                  name="CreateFamily"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/family/CreateFamilyScreen")
                        .CreateFamilyScreen,
                  )}
                />
                <Root.Screen
                  name="FamilySearch"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/family/FamilySearchScreen")
                        .FamilySearchScreen,
                  )}
                />
                <Root.Screen
                  name="Shop"
                  getComponent={lazyScreen(
                    () => require("@screens/payments/ShopScreen").ShopScreen,
                  )}
                />
                <Root.Screen
                  name="TopUp"
                  getComponent={lazyScreen(
                    () => require("@screens/payments/TopUpScreen").TopUpScreen,
                  )}
                />
                <Root.Screen
                  name="Checkout"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/CheckoutScreen")
                        .CheckoutScreen,
                  )}
                />
                <Root.Screen
                  name="ManualPaymentConfirm"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/ManualPaymentConfirmScreen")
                        .ManualPaymentConfirmScreen,
                  )}
                />
                <Root.Screen
                  name="PaymentHistory"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/PaymentHistoryScreen")
                        .PaymentHistoryScreen,
                  )}
                />
                <Root.Screen
                  name="Withdraw"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/WithdrawScreen")
                        .WithdrawScreen,
                  )}
                />
                <Root.Screen
                  name="WithdrawalHistory"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/WithdrawalHistoryScreen")
                        .WithdrawalHistoryScreen,
                  )}
                />
                <Root.Screen
                  name="WithdrawalDetail"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/WithdrawalDetailScreen")
                        .WithdrawalDetailScreen,
                  )}
                />
                <Root.Screen
                  name="AgentTopUp"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/AgentTopUpScreen")
                        .AgentTopUpScreen,
                  )}
                />
                <Root.Screen
                  name="BindPaymentMethod"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindPaymentMethodScreen")
                        .BindPaymentMethodScreen,
                  )}
                />
                <Root.Screen
                  name="BindMobileWallet"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindMobileWalletScreen")
                        .BindMobileWalletScreen,
                  )}
                />
                <Root.Screen
                  name="BindUpi"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindUpiScreen").BindUpiScreen,
                  )}
                />
                <Root.Screen
                  name="BindBankAccount"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindBankAccountScreen")
                        .BindBankAccountScreen,
                  )}
                />
                <Root.Screen
                  name="BindEpay"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindEpayScreen")
                        .BindEpayScreen,
                  )}
                />
                <Root.Screen
                  name="BindBinance"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindBinanceScreen")
                        .BindBinanceScreen,
                  )}
                />
                <Root.Screen
                  name="BindUsdtTrc20"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/BindUsdtTrc20Screen")
                        .BindUsdtTrc20Screen,
                  )}
                />
                <Root.Screen
                  name="PaymentMethodList"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payments/PaymentMethodListScreen")
                        .PaymentMethodListScreen,
                  )}
                />
                <Root.Screen
                  name="BecomeHost"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/BecomeHostScreen")
                        .BecomeHostScreen,
                  )}
                />
                <Root.Screen
                  name="HostCenter"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/HostCenterScreen")
                        .HostCenterScreen,
                  )}
                />
                <Root.Screen
                  name="HostData"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/HostDataScreen").HostDataScreen,
                  )}
                />
                <Root.Screen
                  name="HostApplicationStatus"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/host/HostApplicationStatusScreen")
                        .HostApplicationStatusScreen,
                  )}
                />
                <Root.Screen
                  name="Activity"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/activity/ActivityScreen")
                        .ActivityScreen,
                  )}
                />
                <Root.Screen
                  name="IncomeAnalysis"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/activity/IncomeAnalysisScreen")
                        .IncomeAnalysisScreen,
                  )}
                />
                <Root.Screen
                  name="Settings"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/SettingsScreen")
                        .SettingsScreen,
                  )}
                />
                <Root.Screen
                  name="DiagnosticsLog"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/DiagnosticsLogScreen")
                        .DiagnosticsLogScreen,
                  )}
                />
                <Root.Screen
                  name="Account"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/AccountScreen").AccountScreen,
                  )}
                />
                <Root.Screen
                  name="AccountSecurity"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/AccountSecurityScreen")
                        .AccountSecurityScreen,
                  )}
                />
                <Root.Screen
                  name="DeviceManagement"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/DeviceManagementScreen")
                        .DeviceManagementScreen,
                  )}
                />
                <Root.Screen
                  name="LanguageSetting"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/LanguageSettingScreen")
                        .LanguageSettingScreen,
                  )}
                />
                <Root.Screen
                  name="Blocklist"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/BlocklistScreen")
                        .BlocklistScreen,
                  )}
                />
                <Root.Screen
                  name="PrivilegeSetting"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/PrivilegeSettingScreen")
                        .PrivilegeSettingScreen,
                  )}
                />
                <Root.Screen
                  name="NewMessageNotification"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/NewMessageNotificationScreen")
                        .NewMessageNotificationScreen,
                  )}
                />
                <Root.Screen
                  name="PrivacySetting"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/PrivacyScreen").PrivacyScreen,
                  )}
                />
                <Root.Screen
                  name="ExchangeCoin"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/wallet/ExchangeCoinsScreen")
                        .ExchangeCoinsScreen,
                  )}
                />
                <Root.Screen
                  name="LiveData"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/activity/LiveDataScreen")
                        .LiveDataScreen,
                  )}
                />
                <Root.Screen
                  name="Search"
                  getComponent={lazyScreen(
                    () => require("@screens/search/SearchScreen").SearchScreen,
                  )}
                />
                <Root.Screen
                  name="CoinSeller"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/coinSeller/CoinSellerScreen")
                        .CoinSellerScreen,
                  )}
                />
                <Root.Screen
                  name="Payroll"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/payroll/PayrollScreen").PayrollScreen,
                  )}
                />
                <Root.Screen
                  name="SupporterList"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/profile/SupporterListScreen")
                        .SupporterListScreen,
                  )}
                />
                <Root.Screen
                  name="GiftGallery"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/profile/GiftGalleryScreen")
                        .GiftGalleryScreen,
                  )}
                />
                <Root.Screen
                  name="CoinSellerRank"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/coinSeller/CoinSellerRankScreen")
                        .CoinSellerRankScreen,
                  )}
                />
                <Root.Screen
                  name="CoinSellerDetails"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/coinSeller/CoinSellerDetailsScreen")
                        .CoinSellerDetailsScreen,
                  )}
                />
                <Root.Screen
                  name="CoinSellerQuickMessage"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/coinSeller/CoinSellerQuickMessageScreen")
                        .CoinSellerQuickMessageScreen,
                  )}
                />
                <Root.Screen
                  name="Authentication"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/AuthenticationScreen")
                        .AuthenticationScreen,
                  )}
                />
                <Root.Screen
                  name="FaceLiveness"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/settings/FaceLivenessScreen")
                        .FaceLivenessScreen,
                  )}
                />
                <Root.Screen
                  name="Store"
                  getComponent={lazyScreen(
                    () => require("@screens/store/StoreScreen").StoreScreen,
                  )}
                />
                <Root.Screen
                  name="StoreModal"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/store/StoreScreen")
                        .StoreScreen as never,
                  )}
                  options={{ presentation: "modal" }}
                />
                <Root.Screen
                  name="Ranking"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/ranking/RankingScreen").RankingScreen,
                  )}
                />
                <Root.Screen
                  name="StateQueen"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/ranking/StateQueenScreen")
                        .StateQueenScreen,
                  )}
                />
                <Root.Screen
                  name="CreateRoom"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/main/CreateRoomScreen")
                        .CreateRoomScreen,
                  )}
                />
                <Root.Screen
                  name="CreateMoment"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/main/CreateMomentScreen")
                        .CreateMomentScreen,
                  )}
                />
                <Root.Screen
                  name="InviteCreator"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/invite/InviteCreatorScreen")
                        .InviteCreatorScreen,
                  )}
                />
                <Root.Screen
                  name="InviteFriends"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/invite/InviteFriendsScreen")
                        .InviteFriendsScreen,
                  )}
                />
                <Root.Screen
                  name="InviteRewardDetails"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/invite/InviteRewardDetailsScreen")
                        .InviteRewardDetailsScreen,
                  )}
                />
                <Root.Screen
                  name="Notifications"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/main/NotificationsScreen")
                        .NotificationsScreen,
                  )}
                />
                <Root.Screen
                  name="EditProfile"
                  getComponent={lazyScreen(
                    () => require("@screens/EditProfileScreen").default,
                  )}
                />
                <Root.Screen
                  name="HelpCenter"
                  getComponent={lazyScreen(
                    () =>
                      require("@screens/support/HelpCenterScreen")
                        .HelpCenterScreen,
                  )}
                />
              </>
            ) : (
              <Root.Screen name="Auth" component={AuthStack} />
            )}
          </Root.Navigator>
        </NavigationContainer>
        <KeptRoomOverlay />
        <SessionMusicPlayer />
        </View>
      </RoomSessionProvider>
    </DMConnectionProvider>
  );
}
