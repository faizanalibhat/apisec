import express from 'express';
import * as controller from '../controllers/rule.controller.js';

const router = express.Router();

// Search endpoint
router.get('/search', controller.searchRules);

router
    .get("/", controller.getRules)
    .post("/", controller.createRule)
    .get("/:ruleId", controller.getRule)
    .put("/:ruleId", controller.updateRule)
    .delete("/:ruleId", controller.deleteRule);

export default router;