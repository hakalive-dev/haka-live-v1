import { Dispatch } from '@reduxjs/toolkit';
import { setCachedAccessToken } from '../api/client';
import { AuthResult } from '../api/auth';
import { TokenStorage } from '../storage';
import { setAuth } from '../store/authSlice';
import { logAuthTiming } from './authTiming';

export type PersistAuthSessionOptions = {
  /** When true, only persist tokens — e.g. phone verify before onboarding screen. */
  skipDispatch?: boolean;
};

/**
 * Apply a successful login: Redux first for fast navigation, persist tokens in parallel.
 */
export async function persistAuthSession(
  dispatch: Dispatch,
  result: AuthResult,
  phase = 'persist',
  options?: PersistAuthSessionOptions,
): Promise<void> {
  const { accessToken, refreshToken } = result.tokens;
  setCachedAccessToken(accessToken);

  if (!options?.skipDispatch) {
    dispatch(
      setAuth({
        user: result.user,
        accessToken,
        refreshToken,
      }),
    );
    logAuthTiming(`${phase}_setAuth_done`);
  }

  await Promise.all([
    TokenStorage.setAccess(accessToken),
    TokenStorage.setRefresh(refreshToken),
    TokenStorage.setUserJson(JSON.stringify(result.user)),
  ]);
  logAuthTiming(`${phase}_persist_done`);
}
