import { runStartupMigrations } from '../src/utils/startupMigration';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: { $executeRawUnsafe: jest.fn().mockResolvedValue(0) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('runStartupMigrations V06 guards', () => {
  it('creates bookmark and feedback tables and post/moment privacy columns', async () => {
    await runStartupMigrations();
    const sql = (prisma.$executeRawUnsafe as jest.Mock).mock.calls.map(([value]) => String(value)).join('\n');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "post_bookmarks"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "moment_bookmarks"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "user_feedback"');
    expect(sql).toContain('ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "visibility"');
    expect(sql).toContain('ALTER TABLE "moments" ADD COLUMN IF NOT EXISTS "allowComments"');
  });
});
