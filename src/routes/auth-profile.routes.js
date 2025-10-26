import express from 'express';
import { AuthProfileController } from '../controllers/auth-profile.controller';

const router = express.Router();

router.get('/', AuthProfileController.getAuthProfiles);
router.get('/:id', AuthProfileController.getAuthProfile);
router.post('/', AuthProfileController.createAuthProfile);
router.put('/:id', AuthProfileController.updateAuthProfile);
router.delete('/:id', AuthProfileController.deleteAuthProfile);

export default router;