import type { Request, Response, NextFunction } from 'express';
import { uploadToStorage } from '../../utils/storage';
import { storageFilename } from '../../utils/upload';
import { ok, fail } from '../../utils/response';
import {
  getUserMusicLibrary,
  addToUserMusicLibrary,
  deleteFromUserMusicLibrary,
} from './music.service';

export async function listLibrary(req: Request, res: Response, next: NextFunction) {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q : undefined;
    const tracks = await getUserMusicLibrary(req.user!.id, search);
    ok(res, { tracks, total: tracks.length });
  } catch (err) { next(err); }
}

export async function uploadToLibrary(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) { fail(res, 'No audio file uploaded', 400); return; }
    const filename = `user-music/user-${req.user!.id}-${storageFilename(req.file.originalname)}`;
    const url = await uploadToStorage(
      req.file.buffer,
      filename,
      req.file.mimetype,
      undefined,
      undefined,
      { cacheControl: '31536000', immutable: true },
    );
    const name = req.file.originalname?.trim() || 'Untitled';
    const track = await addToUserMusicLibrary(req.user!.id, url, name, req.file.mimetype);
    ok(res, { track }, 'Track added to library');
  } catch (err) { next(err); }
}

export async function deleteFromLibrary(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteFromUserMusicLibrary(req.user!.id, req.params.trackId);
    ok(res, null, 'Track deleted');
  } catch (err) { next(err); }
}
