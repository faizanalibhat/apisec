import express from 'express';
import { TransformedRequestsController } from "../controllers/" 

const router = express.Router();

router
  .get('/', TransformedRequestsController.getRequests);

export default router;