describe('server startup', () => {
  const listenMock = jest.fn((_port: number, callback?: () => void) => {
    callback?.();
    return { close: jest.fn() };
  });
  const appMock = { listen: listenMock };
  const runStartupMigrationsMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../src/app', () => ({
      createApp: jest.fn(() => appMock),
    }));
    jest.doMock('../src/config', () => ({
      config: { port: 4321, nodeEnv: 'test' },
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
  });

  it('opens the web port before startup migrations finish', async () => {
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

    resolveMigrations();
  });

  it('starts the web process without blocking on prisma migrate deploy', () => {
    const packageJson = require('../package.json') as { scripts: { start: string } };

    expect(packageJson.scripts.start).toBe('node dist/index.js');
  });
});

describe('app health metadata', () => {
  it('exposes the current v0.4 reverse geocode build id', async () => {
    jest.resetModules();
    const { BUILD_ID } = await import('../src/buildInfo');

    expect(BUILD_ID).toBe('pawpal-v04-reverse-geocode-20260628');
  });
});
