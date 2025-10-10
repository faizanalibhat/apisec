import express from 'express';
import { TransformedRequestsController } from "../controllers/transformed-requests.controller" 

const router = express.Router();

router
  .get('/', TransformedRequestsController.getRequests);

export default router;