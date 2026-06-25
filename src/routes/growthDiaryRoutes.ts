import { Router } from 'express';
import { GrowthDiaryController } from '../controllers/growthDiaryController';
import { requireAuth } from '../middleware/auth';
import { uploadMedia } from '../middleware/upload';

/**
 * Growth diary routes — mounted at /pets
 * All paths are relative: /:petId/entries, /:petId/entries/:entryId
 */
export const growthDiaryRoutes = Router();

growthDiaryRoutes.use(requireAuth);

// List entries for a pet
growthDiaryRoutes.get('/:petId/entries', GrowthDiaryController.listEntries);

// Create entry with media upload (multipart/form-data)
growthDiaryRoutes.post('/:petId/entries', uploadMedia, GrowthDiaryController.createEntry);

// Delete an entry
growthDiaryRoutes.delete('/:petId/entries/:entryId', GrowthDiaryController.deleteEntry);
