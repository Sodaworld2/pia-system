import { Router } from 'express';
import db from '../database';
import { validate, validators } from '../middleware/validation';
import { sanitizeBody } from '../utils/sanitize';
import logger from '../utils/logger';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// GET /api/agreements/founder
// Get all founder agreements
router.get('/', async (req, res) => {
    try {
        const { dao_id } = req.query;

        let query = db('council_members')
            .where('role_type', 'founder')
            .select(
                'council_members.*',
                'agreements.id as agreement_id',
                'agreements.title as agreement_title',
                'agreements.status as agreement_status',
                'agreements.created_at as agreement_created_at'
            )
            .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id');

        if (dao_id) {
            query = query.where('council_members.dao_id', dao_id);
        }

        const founders = await query.orderBy('council_members.created_at', 'desc');

        res.json({
            success: true,
            data: founders,
            count: founders.length
        });

    } catch (error) {
        logger.error('Error fetching founder agreements:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch founder agreements',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// GET /api/agreements/founder/:id
// Get a specific founder agreement by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const councilMember = await db('council_members')
            .where('council_members.id', id)
            .where('role_type', 'founder')
            .select(
                'council_members.*',
                'agreements.id as agreement_id',
                'agreements.title as agreement_title',
                'agreements.description as agreement_description',
                'agreements.status as agreement_status',
                'agreements.details as agreement_details',
                'agreements.created_at as agreement_created_at'
            )
            .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id')
            .first();

        if (!councilMember) {
            return res.status(404).json({
                success: false,
                error: 'Founder agreement not found',
                code: 'NOT_FOUND'
            });
        }

        // Get milestones
        const milestones = await db('milestones')
            .where('council_member_id', id)
            .orderBy('milestone_order');

        // Get generated contracts
        const contracts = await db('generated_contracts')
            .where('council_member
