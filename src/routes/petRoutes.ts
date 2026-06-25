import { Router } from 'express';
import { PetController } from '../controllers/petController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All pet routes require authentication
router.use(requireAuth);

// Validation schema for pet creation/update
const petSchema = z.object({
  name: z.string().min(1, '请输入宠物名称').max(20, '名称最多20字'),
  species: z.enum(['DOG', 'CAT']),
  breed: z.string().min(1, '请选择品种'),
  gender: z.enum(['MALE', 'FEMALE']),
  birthday: z.string().optional().default(''),
  weight: z.number().min(0, '体重不能为负').max(200, '体重数值过大'),
  photo: z.string().optional().default(''),
  neutered: z.boolean().default(false),
});

// Routes
router.get('/', PetController.list);
router.get('/:id', PetController.getById);
router.post('/', validateBody(petSchema), PetController.create);
router.put('/:id', validateBody(petSchema.partial()), PetController.update);
router.delete('/:id', PetController.delete);

export default router;
