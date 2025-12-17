import express from 'express';
import { TransformedRequestsController } from "../../controllers/requests-controller/transformed-requests.controller.js" 

const router = express.Router();

router
  .get('/', TransformedRequestsController.getRequests);

export default router;