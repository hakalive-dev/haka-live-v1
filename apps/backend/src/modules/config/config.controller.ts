import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { ok } from '../../utils/response';

/** Split the '|'-separated release-notes env into trimmed, non-empty bullets. */
function parseReleaseNotes(raw: string): string[] {
  return raw
    .split('|')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export const configController = {
  /**
   * Public app config consumed by the mobile client on launch. Currently drives
   * the Android in-app "Update available" gate; structured per-platform so iOS
   * can be added later without breaking older clients.
   */
  get(_req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, {
        android: {
          latest_version_code: env.ANDROID_LATEST_VERSION_CODE,
          latest_version_name: env.ANDROID_LATEST_VERSION_NAME,
          min_supported_version_code: env.ANDROID_MIN_VERSION_CODE,
          store_url: env.ANDROID_STORE_URL,
          release_notes: parseReleaseNotes(env.ANDROID_RELEASE_NOTES),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
