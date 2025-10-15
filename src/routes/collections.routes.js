import express from 'express';
import { CollectionsController } from '../controllers/collections.controller.js';

const router = express.Router();

router.get('/', CollectionsController.getCollections);

export default router;