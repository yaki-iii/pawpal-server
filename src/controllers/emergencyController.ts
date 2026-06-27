import type { Request, Response } from 'express';
import { EmergencyHelpService } from '../services/emergencyService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * EmergencyController — handles emergency help requests.
 *
 * Routes:
 *  - POST   /emergency/help
 *  - GET    /emergency/vets
 *  - POST   /emergency/:id/respond
 *  - POST   /emergency/:id/resolve
 *  - GET    /emergency/active
 */
export class EmergencyController {
  /**
   * POST /emergency/help — create an emergency help request
   */
  static async createHelp(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { petId, type, description, urgency, location, lat, lng } = req.body;
      const help = await EmergencyHelpService.createHelp(req.userId, {
        petId,
        type,
        description,
        urgency,
        location,
        lat,
        lng,
      });
      sendSuccess(res, help, '紧急求助已发布', 201);
    } catch (error) {
      sendError(res, 400, (error as Error).message || '发布失败');
    }
  }

  /**
   * GET /emergency/vets — list nearby vet clinics
   */
  static async listVets(req: Request, res: Response): Promise<void> {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      if (isNaN(lat) || isNaN(lng)) {
        sendError(res, 400, '请提供有效的 lat 和 lng 参数');
        return;
      }

      const vets = await EmergencyHelpService.listNearbyVets(lat, lng, limit);
      sendSuccess(res, vets);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /emergency/geocode — resolve a user-entered city/address to coordinates
   */
  static async geocode(req: Request, res: Response): Promise<void> {
    try {
      const city = String(req.query.city || '').trim();
      const address = String(req.query.address || '').trim();

      if (!city || !address) {
        sendError(res, 400, '请填写城市和具体位置');
        return;
      }

      const location = await EmergencyHelpService.geocodeManualLocation(city, address);
      sendSuccess(res, location);
    } catch (error) {
      const message = (error as Error).message;
      const statusCode = message.includes('未找到') || message.includes('请填写') ? 400 : 500;
      sendError(res, statusCode, message);
    }
  }

  /**
   * POST /emergency/:id/respond — respond to an emergency
   */
  static async respond(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { message = '' } = req.body;
      const result = await EmergencyHelpService.respondToHelp(
        req.params.id,
        req.userId,
        message,
      );
      sendSuccess(res, result, '响应成功');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * POST /emergency/:id/resolve — resolve (close) an emergency
   */
  static async resolve(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const help = await EmergencyHelpService.resolveHelp(req.params.id, req.userId);
      sendSuccess(res, help, '求助已结束');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else if (message.includes('只有')) {
        sendError(res, 403, message, undefined, 403);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * GET /emergency/active — list active emergencies (optional city filter)
   */
  static async listActive(req: Request, res: Response): Promise<void> {
    try {
      const { city } = req.query;
      const helps = await EmergencyHelpService.listActiveEmergencies(
        req.userId,
        city as string | undefined,
      );
      sendSuccess(res, helps);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }
}
