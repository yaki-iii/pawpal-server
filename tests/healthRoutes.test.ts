import { weightRecordSchema } from '../src/routes/healthRoutes';

jest.mock('../src/controllers/healthController', () => ({
  HealthController: {
    getHealthReport: jest.fn(),
    listHealthRecords: jest.fn(),
    createHealthRecord: jest.fn(),
    updateHealthRecord: jest.fn(),
    deleteHealthRecord: jest.fn(),
    listWeightRecords: jest.fn(),
    createWeightRecord: jest.fn(),
    deleteWeightRecord: jest.fn(),
    listReminders: jest.fn(),
    listAllReminders: jest.fn(),
    markReminderDone: jest.fn(),
    updateReminder: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
}));

describe('health route schemas', () => {
  it('accepts current weight/date payloads', () => {
    const result = weightRecordSchema.safeParse({
      weight: 11,
      date: '2026-06-15',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        weight: 11,
        date: '2026-06-15',
      });
    }
  });

  it('normalizes legacy weightKg/measuredAt payloads', () => {
    const result = weightRecordSchema.safeParse({
      weightKg: 11,
      measuredAt: '2026-06-15T00:00:00Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        weight: 11,
        date: '2026-06-15T00:00:00Z',
      });
    }
  });
});
