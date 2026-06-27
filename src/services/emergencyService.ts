import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { EmergencyHelp, VetClinic } from '@prisma/client';
import type { EmergencyHelpDTO, ManualLocationDTO, VetClinicDTO } from '../types';
import { AuthService } from './authService';
import { NotificationService } from './notificationService';

interface AMapPoi {
  id?: string;
  name?: string;
  address?: string;
  cityname?: string | string[];
  adname?: string | string[];
  location?: string;
  tel?: string;
  distance?: string | number;
  business_area?: string | string[];
  biz_ext?: {
    rating?: string | number;
    open_time?: string;
    open_status?: string;
  };
  type?: string;
  tag?: string;
}

interface AMapAroundResponse {
  status?: string;
  info?: string;
  pois?: AMapPoi[];
}

interface AMapGeocode {
  formatted_address?: string;
  province?: string;
  city?: string | string[];
  district?: string | string[];
  location?: string;
}

interface AMapGeocodeResponse {
  status?: string;
  info?: string;
  geocodes?: AMapGeocode[];
}

/**
 * EmergencyHelpService — emergency help requests for pet owners.
 *
 * Flow:
 *  1. Owner posts emergency (SYMPTOM/ACCIDENT/LOST/OTHER) with location + urgency
 *  2. We notify nearby pet owners (same city) about the emergency
 *  3. Other users can "respond" to offer help
 *  4. Owner can resolve/close the emergency
 *
 * Vet clinic search:
 *  - LBS query (Haversine distance) against the vet_clinics table
 *  - Returns nearest clinics sorted by distance
 */
export class EmergencyHelpService {
  /**
   * Create an emergency help request.
   * Notifies users in the same city as the requester.
   */
  static async createHelp(
    userId: string,
    data: {
      petId?: string;
      type: 'SYMPTOM' | 'ACCIDENT' | 'LOST' | 'OTHER';
      description: string;
      urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      location?: string;
      lat?: number;
      lng?: number;
    },
  ): Promise<EmergencyHelpDTO> {
    const help = await prisma.emergencyHelp.create({
      data: {
        userId,
        petId: data.petId || null,
        type: data.type,
        description: data.description,
        urgency: data.urgency,
        location: data.location || '',
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        status: 'ACTIVE',
      },
      include: { user: true, pet: true },
    });

    // Notify users in the same city (best-effort, non-blocking)
    try {
      const owner = await prisma.user.findUnique({ where: { id: userId } });
      if (owner && owner.city) {
        const nearbyUsers = await prisma.user.findMany({
          where: {
            city: owner.city,
            id: { not: userId },
            deletedAt: null,
          },
          select: { id: true },
        });

        const urgencyLabel = EmergencyHelpService.urgencyLabel(data.urgency);
        for (const u of nearbyUsers) {
          await NotificationService.create({
            userId: u.id,
            type: 'SYSTEM',
            content: `【紧急求助·${urgencyLabel}】同城的${owner.nickname}需要帮助：${data.description.substring(0, 50)}`,
            linkUrl: `/emergency/${help.id}`,
          });
        }
        logger.info(`Emergency help ${help.id}: notified ${nearbyUsers.length} nearby users`);
      }
    } catch (error) {
      logger.warn(`Failed to notify nearby users for emergency ${help.id}: ${(error as Error).message}`);
    }

    logger.info(`Emergency help created: ${help.id} by user ${userId} urgency=${data.urgency}`);

    const dto = EmergencyHelpService.toDTO(help);
    if (help.user) dto.author = AuthService.toDTO(help.user);
    return dto;
  }

  /**
   * Respond to an emergency help request.
   * Increments the responders count and notifies the original poster.
   */
  static async respondToHelp(
    helpId: string,
    userId: string,
    message: string,
  ): Promise<{ responders: number }> {
    const help = await prisma.emergencyHelp.findUnique({ where: { id: helpId } });
    if (!help) throw new Error('求助不存在');
    if (help.status !== 'ACTIVE') throw new Error('该求助已结束，无法响应');

    const updated = await prisma.emergencyHelp.update({
      where: { id: helpId },
      data: { responders: { increment: 1 } },
    });

    // Notify the original poster
    if (help.userId !== userId) {
      const responder = await prisma.user.findUnique({ where: { id: userId } });
      await NotificationService.create({
        userId: help.userId,
        type: 'SYSTEM',
        content: `${responder?.nickname || '有人'}响应了您的紧急求助：${message.substring(0, 50)}`,
        linkUrl: `/emergency/${helpId}`,
      });
    }

    logger.info(`Emergency help ${helpId}: user ${userId} responded`);
    return { responders: updated.responders };
  }

  /**
   * Resolve an emergency help request. Only the original poster can resolve.
   */
  static async resolveHelp(helpId: string, userId: string): Promise<EmergencyHelpDTO> {
    const help = await prisma.emergencyHelp.findUnique({ where: { id: helpId } });
    if (!help) throw new Error('求助不存在');
    if (help.userId !== userId) throw new Error('只有发起人才能结束求助');

    const updated = await prisma.emergencyHelp.update({
      where: { id: helpId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });

    logger.info(`Emergency help resolved: ${helpId}`);
    return EmergencyHelpService.toDTO(updated);
  }

  /**
   * List nearby vet clinics, sorted by distance from the given lat/lng.
   * Uses the Haversine formula to compute distance.
   */
  static async listNearbyVets(
    lat: number,
    lng: number,
    limit: number = 10,
  ): Promise<VetClinicDTO[]> {
    const amapVets = await EmergencyHelpService.listNearbyVetsFromAMap(lat, lng, limit);
    if (amapVets.length > 0) {
      return amapVets;
    }

    return EmergencyHelpService.listNearbyVetsFromDB(lat, lng, limit);
  }

  static async geocodeManualLocation(city: string, address: string): Promise<ManualLocationDTO> {
    const cleanCity = city.trim();
    const cleanAddress = address.trim();
    if (!cleanCity || !cleanAddress) {
      throw new Error('请填写城市和具体位置');
    }
    if (!config.amap.webServiceKey) {
      throw new Error('位置搜索服务暂不可用');
    }

    const params = new URLSearchParams({
      key: config.amap.webServiceKey,
      city: cleanCity,
      address: cleanAddress,
    });

    try {
      const response = await fetch(`${config.amap.geocodeUrl}?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as AMapGeocodeResponse;
      if (data.status !== '1') {
        logger.warn(`AMap geocode failed: ${data.info || 'unknown error'}`);
        throw new Error('位置搜索失败，请稍后再试');
      }

      const geocode = data.geocodes?.[0];
      const [longitude, latitude] = EmergencyHelpService.parseAMapLocation(geocode?.location);
      if (!geocode || latitude == null || longitude == null) {
        throw new Error('未找到该位置，请补充更具体的地址');
      }

      return {
        latitude,
        longitude,
        displayName: geocode.formatted_address || `${cleanCity}${cleanAddress}`,
        city: EmergencyHelpService.firstAMapText(geocode.city) || cleanCity,
        district: EmergencyHelpService.firstAMapText(geocode.district),
      };
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('未找到') || message.includes('请填写') || message.includes('暂不可用')) {
        throw error;
      }
      logger.warn(`AMap geocode unavailable: ${message}`);
      throw new Error('位置搜索失败，请稍后再试');
    }
  }

  private static async listNearbyVetsFromAMap(
    lat: number,
    lng: number,
    limit: number,
  ): Promise<VetClinicDTO[]> {
    if (!config.amap.webServiceKey) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        key: config.amap.webServiceKey,
        location: `${lng},${lat}`,
        keywords: '宠物医院',
        radius: '10000',
        sortrule: 'distance',
        offset: String(Math.min(Math.max(limit, 1), 25)),
        page: '1',
        extensions: 'all',
      });

      const response = await fetch(`${config.amap.placeAroundUrl}?${params.toString()}`);
      if (!response.ok) {
        logger.warn(`AMap vet search failed: HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as AMapAroundResponse;
      if (data.status !== '1') {
        logger.warn(`AMap vet search failed: ${data.info || 'unknown error'}`);
        return [];
      }

      return (data.pois || [])
        .map((poi) => EmergencyHelpService.toAMapVetDTO(poi))
        .filter((vet): vet is VetClinicDTO => vet !== null)
        .slice(0, limit);
    } catch (error) {
      logger.warn(`AMap vet search unavailable: ${(error as Error).message}`);
      return [];
    }
  }

  private static async listNearbyVetsFromDB(
    lat: number,
    lng: number,
    limit: number,
  ): Promise<VetClinicDTO[]> {
    // Fetch candidates within a rough bounding box first (for DB-side filtering).
    // 1 degree ≈ 111 km, so a 50km radius ≈ 0.45 degree.
    const clinics = await prisma.vetClinic.findMany({
      where: {
        lat: { gte: lat - 0.5, lte: lat + 0.5 },
        lng: { gte: lng - 0.5, lte: lng + 0.5 },
      },
      take: 200,
    });

    // Compute precise distance and sort
    const withDistance = clinics
      .map((c) => ({
        ...c,
        distance: EmergencyHelpService.haversineDistance(lat, lng, c.lat, c.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return withDistance.map((c) => EmergencyHelpService.toVetDTO(c));
  }

  /**
   * List active emergencies (optional city filter).
   */
  static async listActiveEmergencies(
    userId?: string,
    city?: string,
  ): Promise<EmergencyHelpDTO[]> {
    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (city) {
      // Match by the user's city (not the location string, which is free-form)
      where.user = { city };
    }

    const helps = await prisma.emergencyHelp.findMany({
      where,
      orderBy: [
        { urgency: 'desc' }, // CRITICAL first (alphabetical desc = CRITICAL > HIGH > MEDIUM > LOW)
        { createdAt: 'desc' },
      ],
      take: 50,
      include: { user: true },
    });

    return helps.map((h) => {
      const dto = EmergencyHelpService.toDTO(h);
      if (h.user) dto.author = AuthService.toDTO(h.user);
      return dto;
    });
  }

  // ---- Helpers ----

  /**
   * Compute the Haversine distance between two lat/lng points (in km).
   */
  static haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static urgencyLabel(urgency: string): string {
    const map: Record<string, string> = {
      LOW: '低',
      MEDIUM: '中',
      HIGH: '高',
      CRITICAL: '危急',
    };
    return map[urgency] || urgency;
  }

  // ---- DTO Converters ----

  static toDTO(help: EmergencyHelp): EmergencyHelpDTO {
    return {
      id: help.id,
      userId: help.userId,
      petId: help.petId,
      type: help.type,
      description: help.description,
      urgency: help.urgency,
      location: help.location,
      lat: help.lat,
      lng: help.lng,
      status: help.status,
      responders: help.responders,
      createdAt: help.createdAt.toISOString(),
      resolvedAt: help.resolvedAt ? help.resolvedAt.toISOString() : null,
    };
  }

  static toVetDTO(clinic: VetClinic & { distance?: number }): VetClinicDTO {
    const distance = (clinic as { distance?: number }).distance;
    return {
      id: clinic.id,
      name: clinic.name,
      address: clinic.address,
      phone: clinic.phone,
      lat: clinic.lat,
      lng: clinic.lng,
      is24Hour: clinic.is24Hour,
      rating: clinic.rating,
      distance,
      distanceMeters: typeof distance === 'number' ? Math.round(distance * 1000) : undefined,
    };
  }

  private static toAMapVetDTO(poi: AMapPoi): VetClinicDTO | null {
    const [lng, lat] = EmergencyHelpService.parseAMapLocation(poi.location);
    if (!poi.id || !poi.name || lat == null || lng == null) {
      return null;
    }

    const distanceMeters = EmergencyHelpService.parseNumber(poi.distance);
    return {
      id: `amap-${poi.id}`,
      name: poi.name,
      address: poi.address || '',
      city: EmergencyHelpService.formatAMapCity(poi),
      phone: poi.tel || '',
      lat,
      lng,
      is24Hour: EmergencyHelpService.isLikely24HourVet(poi),
      rating: EmergencyHelpService.parseNumber(poi.biz_ext?.rating) ?? 0,
      distance: distanceMeters != null ? distanceMeters / 1000 : undefined,
      distanceMeters,
      businessHours: EmergencyHelpService.cleanAMapText(poi.biz_ext?.open_time),
      openStatus: EmergencyHelpService.cleanAMapText(poi.biz_ext?.open_status),
    };
  }

  private static parseAMapLocation(location?: string): [number | null, number | null] {
    if (!location) return [null, null];
    const [lngRaw, latRaw] = location.split(',');
    const lng = EmergencyHelpService.parseNumber(lngRaw);
    const lat = EmergencyHelpService.parseNumber(latRaw);
    return [lng ?? null, lat ?? null];
  }

  private static parseNumber(value?: string | number): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private static formatAMapCity(poi: AMapPoi): string | undefined {
    const city = EmergencyHelpService.firstAMapText(poi.cityname);
    const district = EmergencyHelpService.firstAMapText(poi.adname);
    return [city, district].filter(Boolean).join(' ') || undefined;
  }

  private static firstAMapText(value?: string | string[]): string | undefined {
    return EmergencyHelpService.cleanAMapText(Array.isArray(value) ? value[0] : value);
  }

  private static cleanAMapText(value?: string): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === '[]') return undefined;
    return trimmed;
  }

  private static isLikely24HourVet(poi: AMapPoi): boolean {
    const text = [poi.name, poi.type, poi.tag].filter(Boolean).join(' ');
    return /24\s*(小时|h|H)|全天|夜间急诊/.test(text);
  }
}
