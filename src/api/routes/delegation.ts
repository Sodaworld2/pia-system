/**
 * Delegation API Routes
 *
 * POST /api/delegation/validate - Validate a delegation context
 * GET  /api/delegation/rules    - List all delegation rules
 */

import { Router, Request, Response } from 'express';
import { validateDelegation, getDelegationRules } from '../../hooks/delegation.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('DelegationAPI');

// POST /api/delegation/validate - Validate a delegation
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { agentId, agentType, toolName, toolInput, sessionId } = req.body;

    if (!agentId || !agentType || !toolName) {
      res.status(400).json({ error: 'agentId, agentType, and toolName are required' });
      return;
    }

    const result = validateDelegation({
      agentId,
      agentType,
      toolName,
      toolInput: toolInput || {},
      sessionId,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Validation failed: ${error}`);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// GET /api/delegation/rules - List all rules
router.get('/rules', (_req: Request, res: Response) => {
  try {
    const rules = getDelegationRules().map(r => ({
      name: r.name,
      description: r.description,
    }));
    res.json(rules);
  } catch (error) {
    logger.error(`Failed to get rules: ${error}`);
    res.status(500).json({ error: 'Failed to get rules' });
  }
});

export default router;
