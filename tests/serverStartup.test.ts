describe('server startup', () => {
  const listenMock = jest.fn((_port: number, callback?: () => void) => {
    callback?.();
    return { close: jest.fn() };
  });
  const appMock = { listen: listenMock };
  const runStartupMigrationsMock = jest.fn();
  const bootstrapSuperAdminMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../src/app', () => ({
      createApp: jest.fn(() => appMock),
    }));
    jest.doMock('../src/config', () => ({
      config: {
        port: 4321,
        nodeEnv: 'test',
        upload: { dir: 'uploads' },
        rateLimit: { aiPerHour: 20, authPer15Min: 10 },
        jwt: { secret: 'test-secret', expiresIn: '7d' },
        admin: { jwtSecret: 'test-admin-secret', jwtExpiresIn: '12h' },
      },
    }));
    jest.doMock('../src/utils/logger', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    }));
    jest.doMock('../src/utils/scheduler', () => ({
      startScheduler: jest.fn(),
    }));
    jest.doMock('../src/utils/startupMigration', () => ({
      runStartupMigrations: runStartupMigrationsMock,
    }));
    jest.doMock('../src/services/adminService', () => ({
      AdminService: {
        bootstrapSuperAdmin: bootstrapSuperAdminMock,
      },
    }));
  });

  it('opens the web port before startup migrations finish and bootstraps admin after guards', async () => {
    let migrationsFinished = false;
    let resolveMigrations: () => void = () => {};
    runStartupMigrationsMock.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveMigrations = () => {
          migrationsFinished = true;
          resolve();
        };
      }),
    );

    const { startServer } = await import('../src/index');
    await startServer();

    expect(listenMock).toHaveBeenCalledWith(4321, expect.any(Function));
    expect(runStartupMigrationsMock).toHaveBeenCalledTimes(1);
    expect(migrationsFinished).toBe(false);
    expect(bootstrapSuperAdminMock).not.toHaveBeenCalled();

    resolveMigrations();
    await new Promise(process.nextTick);

    expect(bootstrapSuperAdminMock).toHaveBeenCalledTimes(1);
  });

  it('starts the web process without blocking on prisma migrate deploy', () => {
    const packageJson = require('../package.json') as { scripts: { start: string } };

    expect(packageJson.scripts.start).toBe('node dist/index.js');
  });
});

describe('app health metadata', () => {
  it('exposes the current AI, SOS, and composer fix build id', async () => {
    jest.resetModules();
    const { BUILD_ID } = await import('../src/buildInfo');

    expect(BUILD_ID).toBe('pawpal-v04-render-pet-schema-fix-20260709');
  });
});

describe('app route registration', () => {
  it('imports the real app without route schema startup errors', async () => {
    jest.resetModules();
    jest.unmock('../src/app');
    jest.unmock('../src/routes');
    jest.unmock('../src/routes/petRoutes');
    jest.doMock('../src/config/database', () => ({
      prisma: {
        $queryRaw: jest.fn(),
      },
    }));
    jest.doMock('../src/utils/logger', () => ({
      logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    }));

    const { createApp } = await import('../src/app');

    expect(() => createApp()).not.toThrow();
  });
});
