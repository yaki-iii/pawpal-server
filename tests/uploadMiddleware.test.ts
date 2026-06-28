import { uploadFile } from '../src/services/storageService';

jest.mock('../src/services/storageService', () => ({
  uploadFile: jest.fn(),
}));

describe('upload middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process files from multer fields objects', async () => {
    process.env.RENDER = 'true';
    const { convertHeicIfNeeded } = require('../src/middleware/upload') as typeof import('../src/middleware/upload');
    (uploadFile as jest.Mock)
      .mockResolvedValueOnce('https://cdn.example.com/image.jpg')
      .mockResolvedValueOnce('https://cdn.example.com/video.mp4');

    const imageFile = {
      fieldname: 'images',
      originalname: 'image.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('image'),
    } as Express.Multer.File;
    const videoFile = {
      fieldname: 'videos',
      originalname: 'video.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('video'),
    } as Express.Multer.File;
    const req = {
      userId: 'user-1',
      files: {
        images: [imageFile],
        videos: [videoFile],
      },
    } as unknown as Express.Request;
    const next = jest.fn();

    await convertHeicIfNeeded(req, {} as Express.Response, next);

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(imageFile.path).toBe('https://cdn.example.com/image.jpg');
    expect(videoFile.path).toBe('https://cdn.example.com/video.mp4');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('should allow up to 9 images for moment uploads', () => {
    const { momentImageUploadMaxCount } = require('../src/middleware/upload') as typeof import('../src/middleware/upload');

    expect(momentImageUploadMaxCount).toBe(9);
  });
});
