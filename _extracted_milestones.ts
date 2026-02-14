import { Router } from 'express';
import db from '../database';
import { sanitizeBody } from '../utils/sanitize';
import logger from '../utils/logger';

const router = Router();

// Valid milestone statuses
const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed'];

// GET /api/milestones
// List all milestones with optional filters
router.get('/', async (req, res) => {
    try {
        const { agreement_id, council_member_id, status, dao_id } = req.query;

        let query = db('milestones')
            .select(
                'milestones.*',
                'council_members.name as member_name',
                'council_members.surname as member_surname',
                'agreements.title as agreement_title'
            )
            .leftJoin('council_members', 'milestones.council_member_id', 'council_members.id')
            .leftJoin('agreements', 'milestones.agreement_id', 'agreements.id');

        if (agreement_id) {
            query = query.where('milestones.agreement_id', agreement_id);
        }

        if (council_member_id) {
            query = query.where('milestones.council_member_id', council_member_id);
        }

        if (status) {
            query = query.where('milestones.status', status);
        }

        if (dao_id) {
            query = query.where('council_members.dao_id', dao_id);
        }

        const milestones = await query.orderBy('milestones.milestone_order', 'asc');

        res.json({
            success: true,
            data: milestones,
            count: milestones.length
        });

    } catch (error) {
        logger.error('Error fetching milestones:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch milestones',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// GET /api/milestones/:id
// Get a single milestone by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const milestone = await db('milestones')
            .select(
                'milestones.*',
                'council_members.name as member_name',
                'council_members.surname as member_surname',
                'council_members.wallet_address',
                'agreements.title as agreement_title',
                'agreements.status as agreement_status'
            )
            .leftJoin('council_members', 'milestones.council_member_id', 'council_members.id')
            .leftJoin('agreements', 'milestones.agreement_id', 'agreements.id')
            .where('milestones.id', id)
            .first();

        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found',
                code: 'NOT_FOUND'
            });
        }

        // Get related token release if exists
        const tokenRelease = await db('token_release_schedu
