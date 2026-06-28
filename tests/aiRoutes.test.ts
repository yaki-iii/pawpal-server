import { aiImageUploadMaxCount } from '../src/routes/aiRoutes';

describe('AI routes', () => {
  it('should allow up to 9 images', () => {
    expect(aiImageUploadMaxCount).toBe(9);
  });
});
