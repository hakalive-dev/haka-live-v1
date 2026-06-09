import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { invitesApi } from "../api/invites";
import { TokenStorage } from "../storage";
import { extractInviteCodeFromUrl } from "../invite/inviteDeepLink";

/**
 * Captures `?code=` from invite URLs (cold start + while running) into secure storage.
 */
export function useInviteLinkCapture(): void {
  useEffect(() => {
    const persist = async (url: string | null) => {
      const code = extractInviteCodeFromUrl(url);
      if (code) await TokenStorage.setPendingInviteCode(code);
    };

    void Linking.getInitialURL().then((url) => persist(url));

    const sub = Linking.addEventListener("url", (ev) => {
      void persist(ev.url);
    });
    return () => sub.remove();
  }, []);
}

/**
 * After the user is authenticated and onboarding is complete, redeem a pending invite code once.
 */
export function usePendingInviteAccept(
  accessToken: string | null | undefined,
  canAcceptInvites: boolean,
): void {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!accessToken || !canAcceptInvites) {
      attemptedRef.current = false;
      return;
    }

    let cancelled = false;

    (async () => {
      const code = await TokenStorage.getPendingInviteCode();
      if (!code || attemptedRef.current) return;
      attemptedRef.current = true;
      try {
        await invitesApi.accept(code);
        if (!cancelled) {
          await TokenStorage.clearPendingInviteCode();
          Alert.alert(
            "Invite applied",
            "Your friend’s invite code was applied successfully.",
          );
        }
      } catch (e: unknown) {
        const msg =
          e &&
          typeof e === "object" &&
          "message" in e &&
          typeof (e as Error).message === "string"
            ? (e as Error).message
            : "Could not apply this invite code.";
        if (!cancelled) {
          await TokenStorage.clearPendingInviteCode();
          Alert.alert("Invite code", msg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canAcceptInvites]);
}
