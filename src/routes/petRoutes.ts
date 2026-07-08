import { Router } from 'express';
import { PetController } from '../controllers/petController';
import { AlbumController } from '../controllers/albumController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All pet routes require authentication
router.use(requireAuth);

// Validation schema for pet creation/update
const petCreateBaseSchema = z.object({
  name: z.string().min(1, '请输入宠物名称').max(20, '名称最多20字'),
  species: z.enum(['DOG', 'CAT']),
  breed: z.string().min(1, '请选择品种'),
  gender: z.enum(['MALE', 'FEMALE']),
  birthday: z.string().optional().default(''),
  weight: z.number().min(0, '体重不能为负').max(200, '体重数值过大'),
  photo: z.string().optional().default(''),
  avatarUrl: z.string().optional(),
  neutered: z.boolean().default(false),
});

const petUpdateBaseSchema = z.object({
  name: z.string().min(1, '请输入宠物名称').max(20, '名称最多20字').optional(),
  species: z.enum(['DOG', 'CAT']).optional(),
  breed: z.string().min(1, '请选择品种').optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  birthday: z.string().optional(),
  weight: z.number().min(0, '体重不能为负').max(200, '体重数值过大').optional(),
  photo: z.string().optional(),
  avatarUrl: z.string().optional(),
  neutered: z.boolean().optional(),
});

const normalizeCreatePetPhoto = <T extends { photo?: string; avatarUrl?: string }>(data: T) => {
  const { avatarUrl, ...pet } = data;
  return {
    ...pet,
    photo: pet.photo || avatarUrl || '',
  };
};

const normalizeUpdatePetPhoto = <T extends { photo?: string; avatarUrl?: string }>(data: T) => {
  const { avatarUrl, ...pet } = data;
  if (pet.photo === undefined && avatarUrl !== undefined) {
    return { ...pet, photo: avatarUrl };
  }
  return pet;
};

export const petSchema = petCreateBaseSchema.transform(normalizeCreatePetPhoto);
export const petUpdateSchema = petUpdateBaseSchema.transform(normalizeUpdatePetPhoto);

// Routes
router.get('/', PetController.list);
router.get('/:petId/album', AlbumController.getPetAlbum);
router.get('/:id', PetController.getById);
router.post('/', validateBody(petSchema), PetController.create);
router.put('/:id', validateBody(petUpdateSchema), PetController.update);
router.delete('/:id', PetController.delete);

export default router;
