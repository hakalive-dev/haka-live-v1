import { Request, Response, NextFunction } from "express";
import { coinSellerService } from "./coinSeller.service";
import { uploadToStorage } from "../../utils/storage";
import { storageFilename } from "../../utils/upload";
import { ok, fail } from "../../utils/response";

export const coinSellerController = {
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const profile = await coinSellerService.getOrCreateProfile(userId);
      return ok(res, profile);
    } catch (err) {
      next(err);
    }
  },

  async getBootstrap(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const data = await coinSellerService.getBootstrap(user.id, user.role ?? '');
      return ok(res, data);
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const profile = await coinSellerService.updateProfile(userId, req.body);
      return ok(res, profile);
    } catch (err) {
      next(err);
    }
  },

  async getBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const balance = await coinSellerService.getBalance(userId);
      return ok(res, balance);
    } catch (err) {
      next(err);
    }
  },

  async transfer(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { target_user_id, coins_amount, target_type } = req.body;
      if (!target_user_id || !coins_amount)
        return fail(res, "target_user_id and coins_amount required");
      const tx = await coinSellerService.transfer(
        userId,
        target_user_id,
        coins_amount,
        target_type ?? "user",
      );
      return ok(res, tx, "", 201);
    } catch (err: any) {
      if (
        [
          "Insufficient balance",
          "Invalid coins amount",
          "User not found",
          "Cannot transfer to your own seller balance",
          "Target is not a coin seller",
        ].includes(err.message)
      ) {
        return fail(res, err.message, 400);
      }
      next(err);
    }
  },

  async recharge(req: Request, res: Response, next: NextFunction) {
    return fail(
      res,
      "Instant recharge is disabled. Submit a recharge request with payment proof on the Recharge tab.",
      403,
    );
  },

  async exchange(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { points_amount } = req.body;
      if (!points_amount) return fail(res, "points_amount required");
      const request = await coinSellerService.submitExchangeRequest(
        userId,
        Number(points_amount),
      );
      return ok(res, request, "Exchange completed", 201);
    } catch (err: any) {
      if (
        [
          "Invalid amount",
          "Insufficient points",
          "Insufficient beans",
        ].includes(err.message)
      )
        return fail(res, err.message, 400);
      next(err);
    }
  },

  async getMyExchangeRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const requests = await coinSellerService.getMyExchangeRequests(userId);
      return ok(res, requests);
    } catch (err) {
      next(err);
    }
  },

  async getTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const type = req.query.type as string | undefined;
      const txs = await coinSellerService.getTransactions(userId, type);
      return ok(res, txs);
    } catch (err) {
      next(err);
    }
  },

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const type = req.query.type as string | undefined;
      const customers = await coinSellerService.getCustomers(userId, type);
      return ok(res, customers);
    } catch (err) {
      next(err);
    }
  },

  async getQuickMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await coinSellerService.getQuickMessage(userId);
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },

  async updateQuickMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { quick_message } = req.body;
      if (quick_message === undefined)
        return fail(res, "quick_message required");
      const result = await coinSellerService.updateQuickMessage(
        userId,
        quick_message,
      );
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  },

  async getRechargePackages(_req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, coinSellerService.getRechargePackages());
    } catch (err) {
      next(err);
    }
  },

  async getRechargePaymentInfo(
    _req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const info = await coinSellerService.getRechargePaymentInfo();
      return ok(res, info);
    } catch (err) {
      next(err);
    }
  },

  async submitRechargeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { amount_usd, payment_method, tx_hash } = req.body;
      const amountUsd = parseFloat(amount_usd);

      if (!amount_usd || isNaN(amountUsd))
        return fail(res, "amount_usd required");
      if (!payment_method) return fail(res, "payment_method required");
      if (!req.file) return fail(res, "proof image required");

      const filename = storageFilename(req.file.originalname);
      const proofUrl = await uploadToStorage(
        req.file.buffer,
        `seller-proofs/${filename}`,
        req.file.mimetype,
      );

      const request = await coinSellerService.submitRechargeRequest(
        userId,
        amountUsd,
        payment_method,
        proofUrl,
        tx_hash,
      );
      return ok(res, request, "Recharge request submitted", 201);
    } catch (err: any) {
      if (err.message?.startsWith("Minimum recharge"))
        return fail(res, err.message, 400);
      if (err.statusCode === 400) return fail(res, err.message, 400);
      next(err);
    }
  },

  async getMyRechargeRequests(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const requests = await coinSellerService.getMyRechargeRequests(userId);
      return ok(res, requests);
    } catch (err) {
      next(err);
    }
  },

  async getLevelRules(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await coinSellerService.getLevelRules();
      return ok(res, rules);
    } catch (err) {
      next(err);
    }
  },

  async listSellers(req: Request, res: Response, next: NextFunction) {
    try {
      const country = req.query.country as string | undefined;
      const list = await coinSellerService.listSellers(country);
      return ok(res, list);
    } catch (err) {
      next(err);
    }
  },

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const stateCode = typeof req.query.stateCode === 'string' ? req.query.stateCode : undefined;
      const list = await coinSellerService.getLeaderboard(stateCode);
      return ok(res, { items: list });
    } catch (err) {
      next(err);
    }
  },
};
