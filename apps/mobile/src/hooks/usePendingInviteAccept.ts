import { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { invitesApi } from "../api/invites";
import { TokenStorage } from "../storage";
import {
  extractInviteCodeFromText,
  extractInviteCodeFromUrl,
} from "../invite/inviteDeepLink";

/**
 * Captures `?code=` from invite URLs (cold start + while running) into secure storage.
 * Also performs a one-time clipboard check on first launch so an invite code copied
 * from the web /invite fallback page survives a store install (deferred deep link).
 */
export function useInviteLinkCapture(): void {
  useEffect(() => {
    const persist = async (url: string | null) => {
      const code = extractInviteCodeFromUrl(url);
      if (code) await TokenStorage.setPendingInviteCode(code);
    };

    void Linking.getInitialURL().then(async (url) => {
      await persist(url);
      await checkClipboardForInviteCodeOnce();
    });

    const sub = Linking.addEventListener("url", (ev) => {
      void persist(ev.url);
    });
    return () => sub.remove();
  }, []);
}

/**
 * One-time, best-effort deferred-deep-link capture: if no invite link opened the
 * app and we haven't checked before, read the clipboard once and, if it holds a
 * valid invite code (e.g. copied from the web /invite page before installing),
 * store it as the pending code. Runs at most once per install.
 */
async function checkClipboardForInviteCodeOnce(): Promise<void> {
  try {
    if (await TokenStorage.wasInviteClipboardChecked()) return;
    // A link already captured a code — don't read the clipboard at all.
    if (await TokenStorage.getPendingInviteCode()) {
      await TokenStorage.markInviteClipboardChecked();
      return;
    }
    const clip = await Clipboard.getStringAsync();
    const code = extractInviteCodeFromText(clip);
    if (code) await TokenStorage.setPendingInviteCode(code);
  } catch {
    /* clipboard unavailable */
  } finally {
    await TokenStorage.markInviteClipboardChecked().catch(() => {});
  }
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
