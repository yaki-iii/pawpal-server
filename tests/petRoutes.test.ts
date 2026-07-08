import { petUpdateSchema } from '../src/routes/petRoutes';

jest.mock('../src/controllers/petController', () => ({
  PetController: {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../src/controllers/albumController', () => ({
  AlbumController: {
    getPetAlbum: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
}));

describe('pet route schemas', () => {
  it('normalizes avatarUrl to photo on pet update', () => {
    const result = petUpdateSchema.safeParse({
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        photo: 'https://cdn.example.com/avatar.jpg',
      });
    }
  });

  it('does not clear photo when updating unrelated pet fields', () => {
    const result = petUpdateSchema.safeParse({
      name: '煤球',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: '煤球',
      });
    }
  });
});
