import { EmergencyHelpService } from '../src/services/emergencyService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    emergencyHelp: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    vetClinic: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    encryption: { key: 'test-encryption-key-32bytes-ok!!!' },
    amap: {
      webServiceKey: 'test-amap-key',
      geocodeUrl: 'https://restapi.amap.com/v3/geocode/geo',
      regeoUrl: 'https://restapi.amap.com/v3/geocode/regeo',
    },
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock NotificationService
jest.mock('../src/services/notificationService', () => ({
  NotificationService: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  nickname: '煤球麻麻',
  avatar: '',
  bio: '',
  city: '杭州',
  membershipLevel: 'FREE',
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockHelp = {
  id: 'help-1',
  userId: 'user-1',
  petId: null,
  type: 'SYMPTOM',
  description: '煤球突然呕吐不止',
  urgency: 'HIGH',
  location: '杭州西湖区',
  lat: 30.2741,
  lng: 120.1551,
  status: 'ACTIVE',
  responders: 0,
  createdAt: new Date('2026-06-01'),
  resolvedAt: null,
};

describe('EmergencyHelpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('createHelp', () => {
    it('should create an emergency help request', async () => {
      (prisma.emergencyHelp.create as jest.Mock).mockResolvedValue({
        ...mockHelp,
        user: mockUser,
        pet: null,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const help = await EmergencyHelpService.createHelp('user-1', {
        type: 'SYMPTOM',
        description: '煤球突然呕吐不止',
        urgency: 'HIGH',
        location: '杭州西湖区',
        lat: 30.2741,
        lng: 120.1551,
      });

      expect(help.type).toBe('SYMPTOM');
      expect(help.urgency).toBe('HIGH');
      expect(help.status).toBe('ACTIVE');
      expect(prisma.emergencyHelp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            type: 'SYMPTOM',
            description: '煤球突然呕吐不止',
            urgency: 'HIGH',
            lat: 30.2741,
            lng: 120.1551,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should notify users in the same city', async () => {
      (prisma.emergencyHelp.create as jest.Mock).mockResolvedValue({
        ...mockHelp,
        user: mockUser,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user-2' },
        { id: 'user-3' },
      ]);

      await EmergencyHelpService.createHelp('user-1', {
        type: 'ACCIDENT',
        description: 'test',
        urgency: 'CRITICAL',
        location: '杭州',
      });

      // NotificationService.create should have been called for each nearby user
      const { NotificationService } = require('../src/services/notificationService');
      expect(NotificationService.create).toHaveBeenCalledTimes(2);
    });

    it('should still create help even if notification fails', async () => {
      (prisma.emergencyHelp.create as jest.Mock).mockResolvedValue({
        ...mockHelp,
        user: mockUser,
      });
      // user.findUnique returns null (owner has no city set)
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        city: '',
      });

      const help = await EmergencyHelpService.createHelp('user-1', {
        type: 'LOST',
        description: 'test',
        urgency: 'HIGH',
      });

      expect(help.id).toBe('help-1');
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('respondToHelp', () => {
    it('should increment responders count', async () => {
      (prisma.emergencyHelp.findUnique as jest.Mock).mockResolvedValue(mockHelp);
      (prisma.emergencyHelp.update as jest.Mock).mockResolvedValue({
        ...mockHelp,
        responders: 1,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await EmergencyHelpService.respondToHelp(
        'help-1',
        'user-2',
        '我马上到',
      );

      expect(result.responders).toBe(1);
      expect(prisma.emergencyHelp.update).toHaveBeenCalledWith({
        where: { id: 'help-1' },
        data: { responders: { increment: 1 } },
      });
    });

    it('should throw error if help does not exist', async () => {
      (prisma.emergencyHelp.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        EmergencyHelpService.respondToHelp('nonexistent', 'user-1', 'x'),
      ).rejects.toThrow('求助不存在');
    });

    it('should throw error if help is no longer ACTIVE', async () => {
      (prisma.emergencyHelp.findUnique as jest.Mock).mockResolvedValue({
        ...mockHelp,
        status: 'RESOLVED',
      });

      await expect(
        EmergencyHelpService.respondToHelp('help-1', 'user-1', 'x'),
      ).rejects.toThrow('该求助已结束');
    });
  });

  describe('resolveHelp', () => {
    it('should resolve help when requester is the original poster', async () => {
      (prisma.emergencyHelp.findUnique as jest.Mock).mockResolvedValue(mockHelp);
      (prisma.emergencyHelp.update as jest.Mock).mockResolvedValue({
        ...mockHelp,
        status: 'RESOLVED',
        resolvedAt: new Date('2026-06-02'),
      });

      const result = await EmergencyHelpService.resolveHelp('help-1', 'user-1');

      expect(result.status).toBe('RESOLVED');
      expect(prisma.emergencyHelp.update).toHaveBeenCalledWith({
        where: { id: 'help-1' },
        data: { status: 'RESOLVED', resolvedAt: expect.any(Date) },
      });
    });

    it('should throw error if requester is not the original poster', async () => {
      (prisma.emergencyHelp.findUnique as jest.Mock).mockResolvedValue(mockHelp);

      await expect(EmergencyHelpService.resolveHelp('help-1', 'other-user')).rejects.toThrow(
        '只有发起人才能结束求助',
      );
    });
  });

  describe('listNearbyVets', () => {
    it('should geocode a manual city and address with AMap', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          geocodes: [
            {
              formatted_address: '广东省佛山市顺德区北滘镇',
              province: '广东省',
              city: '佛山市',
              district: '顺德区',
              location: '113.217200,22.932600',
            },
          ],
        }),
      });

      const result = await EmergencyHelpService.geocodeManualLocation('佛山', '顺德区北滘镇');

      expect(result).toEqual({
        latitude: 22.9326,
        longitude: 113.2172,
        displayName: '广东省佛山市顺德区北滘镇',
        city: '佛山市',
        district: '顺德区',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('address=%E9%A1%BA%E5%BE%B7%E5%8C%BA%E5%8C%97%E6%BB%98%E9%95%87'),
      );
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('city=%E4%BD%9B%E5%B1%B1'));
    });

    it('should throw when manual location cannot be geocoded', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          geocodes: [],
        }),
      });

      await expect(
        EmergencyHelpService.geocodeManualLocation('未知城市', '未知位置'),
      ).rejects.toThrow('未找到该位置');
    });

    it('should reverse geocode coordinates with AMap place names', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          regeocode: {
            formatted_address: '广东省广州市天河区体育西路',
            addressComponent: {
              city: '广州市',
              district: '天河区',
            },
          },
        }),
      });

      const result = await EmergencyHelpService.reverseGeocodeLocation(23.1322, 113.3202);

      expect(result).toEqual({
        latitude: 23.1322,
        longitude: 113.3202,
        displayName: '广东省广州市天河区体育西路',
        city: '广州市',
        district: '天河区',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('location=113.3202%2C23.1322'),
      );
    });

    it('should throw instead of returning raw coordinates when reverse geocode has no name', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          regeocode: {},
        }),
      });

      await expect(EmergencyHelpService.reverseGeocodeLocation(23.1322, 113.3202)).rejects.toThrow(
        '未找到当前位置名称',
      );
    });

    it('should return normalized AMap vets when AMap search succeeds', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          pois: [
            {
              id: 'B001',
              name: '24小时宠物医院',
              address: '上海市黄浦区测试路1号',
              cityname: '上海市',
              adname: '黄浦区',
              location: '121.4737,31.2304',
              tel: '021-12345678',
              distance: '450',
              business_area: '北滘',
              biz_ext: { rating: '4.8', open_time: '00:00-24:00', open_status: '营业中' },
            },
          ],
        }),
      });

      const result = await EmergencyHelpService.listNearbyVets(31.2304, 121.4737, 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'amap-B001',
          name: '24小时宠物医院',
          city: '上海市 黄浦区',
          phone: '021-12345678',
          lat: 31.2304,
          lng: 121.4737,
          is24Hour: true,
          rating: 4.8,
          distance: 0.45,
          businessHours: '00:00-24:00',
          openStatus: '营业中',
        }),
      );
      expect(prisma.vetClinic.findMany).not.toHaveBeenCalled();
    });

    it('should mark AMap vets as 24h from business hours', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: '1',
          pois: [
            {
              id: 'B002',
              name: '安心动物医院',
              address: '测试路2号',
              cityname: '佛山市',
              adname: '顺德区',
              location: '113.2172,22.9326',
              tel: '0757-12345678',
              distance: '300',
              biz_ext: { rating: '4.6', open_time: '00:00-24:00', open_status: '营业中' },
            },
          ],
        }),
      });

      const result = await EmergencyHelpService.listNearbyVets(22.9326, 113.2172, 10);

      expect(result[0]).toEqual(
        expect.objectContaining({
          name: '安心动物医院',
          is24Hour: true,
          businessHours: '00:00-24:00',
        }),
      );
    });

    it('should fall back to local DB vets when AMap search fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('amap unavailable'));
      (prisma.vetClinic.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'vet-local',
          name: '本地兽医',
          address: 'addr',
          phone: '110',
          lat: 31.23,
          lng: 121.47,
          is24Hour: false,
          rating: 4.0,
        },
      ]);

      const result = await EmergencyHelpService.listNearbyVets(31.2304, 121.4737, 10);

      expect(result[0].id).toBe('vet-local');
      expect(prisma.vetClinic.findMany).toHaveBeenCalled();
    });

    it('should return vets sorted by distance', async () => {
      // Two clinics: one 1km away, one 5km away
      (prisma.vetClinic.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'vet-1',
          name: '近的兽医',
          address: 'addr1',
          phone: '110',
          lat: 30.28, // ~2km from 30.2741
          lng: 120.16,
          is24Hour: true,
          rating: 4.5,
        },
        {
          id: 'vet-2',
          name: '远的兽医',
          address: 'addr2',
          phone: '120',
          lat: 30.32, // ~5km away
          lng: 120.20,
          is24Hour: false,
          rating: 4.0,
        },
      ]);

      const result = await EmergencyHelpService.listNearbyVets(30.2741, 120.1551, 10);

      expect(result).toHaveLength(2);
      // Closer vet should come first
      expect(result[0].name).toBe('近的兽医');
      expect(result[0].distance).toBeDefined();
      expect(result[0].distance).toBeLessThan(result[1].distance);
    });

    it('should apply bounding-box filter in DB query', async () => {
      (prisma.vetClinic.findMany as jest.Mock).mockResolvedValue([]);

      await EmergencyHelpService.listNearbyVets(30.2741, 120.1551, 10);

      const where = (prisma.vetClinic.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.lat).toBeDefined();
      expect(where.lng).toBeDefined();
      // Roughly ±0.5 degree bounding box
      expect(where.lat.gte).toBe(30.2741 - 0.5);
      expect(where.lat.lte).toBe(30.2741 + 0.5);
    });

    it('should limit results', async () => {
      const vets = Array.from({ length: 15 }, (_, i) => ({
        id: `vet-${i}`,
        name: `Vet ${i}`,
        address: 'a',
        phone: 'p',
        lat: 30.27,
        lng: 120.15,
        is24Hour: false,
        rating: 4.0,
      }));
      (prisma.vetClinic.findMany as jest.Mock).mockResolvedValue(vets);

      const result = await EmergencyHelpService.listNearbyVets(30.2741, 120.1551, 5);

      expect(result).toHaveLength(5);
    });
  });

  describe('haversineDistance', () => {
    it('should return 0 for the same point', () => {
      const d = EmergencyHelpService.haversineDistance(30.0, 120.0, 30.0, 120.0);
      expect(d).toBe(0);
    });

    it('should compute distance between two known points', () => {
      // Beijing (39.9, 116.4) to Shanghai (31.2, 121.5) ≈ 1067 km
      const d = EmergencyHelpService.haversineDistance(39.9, 116.4, 31.2, 121.5);
      expect(d).toBeGreaterThan(1000);
      expect(d).toBeLessThan(1100);
    });
  });

  describe('urgencyLabel', () => {
    it('should map urgencies to Chinese labels', () => {
      expect(EmergencyHelpService.urgencyLabel('LOW')).toBe('低');
      expect(EmergencyHelpService.urgencyLabel('MEDIUM')).toBe('中');
      expect(EmergencyHelpService.urgencyLabel('HIGH')).toBe('高');
      expect(EmergencyHelpService.urgencyLabel('CRITICAL')).toBe('危急');
    });

    it('should return the input for unknown urgency', () => {
      expect(EmergencyHelpService.urgencyLabel('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('toDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = EmergencyHelpService.toDTO(mockHelp);
      expect(dto.id).toBe('help-1');
      expect(dto.type).toBe('SYMPTOM');
      expect(dto.urgency).toBe('HIGH');
      expect(dto.status).toBe('ACTIVE');
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
      expect(dto.resolvedAt).toBeNull();
    });
  });
});
