import { Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';
import { ok } from '../../../utils/response';

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await dashboardService.getStats();
    ok(res, stats);
  } catch (err) { next(err); }
}

export async function getRecentUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await dashboardService.getRecentUsers();
    ok(res, users);
  } catch (err) { next(err); }
}

export async function getRecentRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const rooms = await dashboardService.getRecentRooms();
    ok(res, rooms);
  } catch (err) { next(err); }
}

export async function getTopHosts(req: Request, res: Response, next: NextFunction) {
  try {
    const hosts = await dashboardService.getTopHosts();
    ok(res, hosts);
  } catch (err) { next(err); }
}

export async function getTopAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const agents = await dashboardService.getTopAgents();
    ok(res, agents);
  } catch (err) { next(err); }
}
