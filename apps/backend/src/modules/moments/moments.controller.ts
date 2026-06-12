import { Request, Response, NextFunction } from 'express';
import { momentsService } from './moments.service';
import { ok, fail } from '../../utils/response';
import { assertNoRiskBlock } from '../../utils/risk-control';
import { uploadToStorage } from '../../utils/storage';
import { storageFilename } from '../../utils/upload';

export const momentController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const type = req.query.type as 'moment' | 'video' | undefined;
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.page_size ?? '20'), 10)));
      const feed = await momentsService.list(callerId, type, page, pageSize);
      return ok(res, feed);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const postType = String(req.body.post_type ?? 'moment');
      const caption = typeof req.body.caption === 'string' ? req.body.caption : '';
      const hashtag = typeof req.body.hashtag === 'string' ? req.body.hashtag : '';
      let mediaUrl = typeof req.body.media_url === 'string' ? req.body.media_url : undefined;

      const file = req.file;
      if (file) {
        const isVideoFile = /^video\//i.test(file.mimetype);
        if (postType === 'video' && !isVideoFile) {
          return fail(res, 'Video posts require a video file', 400);
        }
        if (postType === 'moment' && isVideoFile) {
          return fail(res, 'Moment posts require an image file', 400);
        }
        const isVideo = isVideoFile || postType === 'video';
        const folder = isVideo ? 'moments/videos' : 'moments/images';
        const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
        mediaUrl = await uploadToStorage(
          file.buffer,
          `${folder}/${storageFilename(file.originalname)}`,
          file.mimetype,
          undefined,
          requestBaseUrl,
          isVideo
            ? { cacheControl: '31536000', immutable: true }
            : { resize: { maxDim: 1920, format: 'jpeg', quality: 85 } },
        );
      }

      const moment = await momentsService.create(callerId, {
        postType,
        mediaUrl,
        caption,
        hashtag,
      });
      return ok(res, moment, '', 201);
    } catch (err) {
      next(err);
    }
  },

  async listByUser(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const userId = req.params.userId;
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.page_size ?? '20'), 10)));
      const feed = await momentsService.listByUser(callerId, userId, page, pageSize);
      return ok(res, feed);
    } catch (err) {
      next(err);
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const moment = await momentsService.get(callerId, req.params.id);
      if (!moment) return fail(res, 'Moment not found', 404);
      return ok(res, moment);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const deleted = await momentsService.delete(callerId, req.params.id);
      if (!deleted) return fail(res, 'Moment not found or not yours', 404);
      return ok(res, null, 'Moment deleted');
    } catch (err) {
      next(err);
    }
  },

  async toggleLike(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const result = await momentsService.toggleLike(callerId, req.params.id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },

  async getComments(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const comments = await momentsService.getComments(callerId, req.params.id);
      return ok(res, comments);
    } catch (err) {
      next(err);
    }
  },

  async toggleCommentLike(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      const result = await momentsService.toggleCommentLike(callerId, req.params.commentId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },

  async postComment(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      await assertNoRiskBlock(callerId, 'blockChat');
      const { text } = req.body;
      if (!text?.trim()) return fail(res, 'Comment text required');
      const comment = await momentsService.postComment(callerId, req.params.id, text.trim());
      return ok(res, comment, '', 201);
    } catch (err) {
      next(err);
    }
  },

  async share(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await momentsService.share(req.params.id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },

  async sendGift(req: Request, res: Response, next: NextFunction) {
    try {
      const callerId = (req as any).user.id;
      await assertNoRiskBlock(callerId, 'freezeCoins', 'disableGifts');
      const { gift_id } = req.body;
      if (!gift_id) return fail(res, 'gift_id required');
      const result = await momentsService.sendGift(callerId, req.params.id, gift_id);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },
};
