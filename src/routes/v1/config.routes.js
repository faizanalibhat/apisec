import express from 'express';
import { ConfigController } from '../controllers/config.controller.js';

const router = express.Router();

router.get('/', ConfigController.getConfig);
router.put('/', ConfigController.updateConfig);

export default router;