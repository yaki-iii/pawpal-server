import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/trending', requireAuth, SearchController.trendingKeywords);
router.get('/', requireAuth, SearchController.globalSearch);

export default router;
