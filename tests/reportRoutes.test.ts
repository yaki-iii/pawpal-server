jest.mock('../src/services/reportService', () => ({
  ReportService: {
    createReport: jest.fn(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import type { Request, Response } from 'express';
import { ReportController } from '../src/controllers/reportController';
import { ReportService } from '../src/services/reportService';

function mockResponse(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('ReportController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a report for an authenticated user', async () => {
    (ReportService.createReport as jest.Mock).mockResolvedValue({
      id: 'report-1',
      targetType: 'POST',
      targetId: 'post-1',
      status: 'PENDING',
    });
    const req = {
      userId: 'user-1',
      body: { targetType: 'POST', targetId: 'post-1', reason: 'SPAM' },
    } as unknown as Request;
    const res = mockResponse();

    await ReportController.createReport(req, res);

    expect(ReportService.createReport).toHaveBeenCalledWith('user-1', {
      targetType: 'POST',
      targetId: 'post-1',
      reason: 'SPAM',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      data: { id: 'report-1', targetType: 'POST', targetId: 'post-1', status: 'PENDING' },
      message: '举报已提交',
    });
  });
});
