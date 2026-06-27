import { UploadController } from '../src/controllers/uploadController';

describe('UploadController', () => {
  describe('uploadedImageUrls', () => {
    it('should return cloud URLs unchanged', () => {
      const files = [
        { path: 'https://cdn.example.com/uploads/a.jpg' },
      ] as Express.Multer.File[];

      expect(UploadController.uploadedImageUrls(files)).toEqual([
        'https://cdn.example.com/uploads/a.jpg',
      ]);
    });

    it('should return existing API upload paths unchanged', () => {
      const files = [
        { path: '/api/v1/uploads/2026-06-27/a.jpg' },
      ] as Express.Multer.File[];

      expect(UploadController.uploadedImageUrls(files)).toEqual([
        '/api/v1/uploads/2026-06-27/a.jpg',
      ]);
    });

    it('should build API URLs for disk uploaded files', () => {
      const files = [
        {
          filename: 'local-a.jpg',
          destination: '/server/uploads/2026-06-27',
        },
      ] as Express.Multer.File[];

      expect(UploadController.uploadedImageUrls(files)).toEqual([
        '/api/v1/uploads/2026-06-27/local-a.jpg',
      ]);
    });

    it('should return an empty array when no files are provided', () => {
      expect(UploadController.uploadedImageUrls(undefined)).toEqual([]);
      expect(UploadController.uploadedImageUrls([])).toEqual([]);
    });
  });

  describe('uploadedMediaUrls', () => {
    it('should separate uploaded image and video URLs by mimetype', () => {
      const files = [
        {
          path: '/api/v1/uploads/2026-06-27/a.jpg',
          mimetype: 'image/jpeg',
        },
        {
          path: '/api/v1/uploads/2026-06-27/run.mp4',
          mimetype: 'video/mp4',
        },
      ] as Express.Multer.File[];

      expect(UploadController.uploadedMediaUrls(files)).toEqual({
        images: ['/api/v1/uploads/2026-06-27/a.jpg'],
        videos: ['/api/v1/uploads/2026-06-27/run.mp4'],
      });
    });
  });
});
