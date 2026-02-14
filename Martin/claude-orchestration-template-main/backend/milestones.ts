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
        const tokenRelease = await db('token_release_schedule')
            .where('milestone_id', id)
            .first();

        res.json({
            success: true,
            data: {
                ...milestone,
                token_release: tokenRelease || null
            }
        });

    } catch (error) {
        logger.error('Error fetching milestone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch milestone',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// POST /api/milestones
// Create a new milestone
router.post('/',
    sanitizeBody(),
    async (req, res) => {
        const {
            agreement_id,
            council_member_id,
            title,
            description,
            milestone_order,
            target_date,
            token_amount
        } = req.body;

        try {
            // Validation
            if (!agreement_id || !council_member_id || !title) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: agreement_id, council_member_id, title',
                    code: 'MISSING_FIELDS'
                });
            }

            // Verify agreement exists
            const agreement = await db('agreements').where('id', agreement_id).first();
            if (!agreement) {
                return res.status(404).json({
                    success: false,
                    error: 'Agreement not found',
                    code: 'AGREEMENT_NOT_FOUND'
                });
            }

            // Verify council member exists
            const member = await db('council_members').where('id', council_member_id).first();
            if (!member) {
                return res.status(404).json({
                    success: false,
                    error: 'Council member not found',
                    code: 'MEMBER_NOT_FOUND'
                });
            }

            // Get the next milestone order if not provided
            let order = milestone_order;
            if (!order) {
                const maxOrder = await db('milestones')
                    .where('council_member_id', council_member_id)
                    .max('milestone_order as max')
                    .first();
                order = (maxOrder?.max || 0) + 1;
            }

            // Validate milestone order (max 12)
            if (order > 12) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 12 milestones allowed per member',
                    code: 'MAX_MILESTONES_EXCEEDED'
                });
            }

            const [milestoneId] = await db('milestones').insert({
                agreement_id,
                council_member_id,
                title,
                description: description || null,
                milestone_order: order,
                target_date: target_date || null,
                token_amount: token_amount || null,
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).returning('id');

            logger.info(`Milestone created: id=${milestoneId}, title=${title}, member=${council_member_id}`);

            res.status(201).json({
                success: true,
                data: {
                    id: milestoneId,
                    title,
                    milestone_order: order,
                    status: 'pending'
                }
            });

        } catch (error) {
            logger.error('Error creating milestone:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create milestone',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// PUT /api/milestones/:id
// Update a milestone
router.put('/:id',
    sanitizeBody(),
    async (req, res) => {
        const { id } = req.params;
        const { title, description, target_date, token_amount, milestone_order } = req.body;

        try {
            const milestone = await db('milestones').where('id', id).first();

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    error: 'Milestone not found',
                    code: 'NOT_FOUND'
                });
            }

            // Don't allow editing completed milestones
            if (milestone.status === 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot edit a completed milestone',
                    code: 'MILESTONE_COMPLETED'
                });
            }

            const updateData: any = {
                updated_at: new Date().toISOString()
            };

            if (title !== undefined) updateData.title = title;
            if (description !== undefined) updateData.description = description;
            if (target_date !== undefined) updateData.target_date = target_date;
            if (token_amount !== undefined) updateData.token_amount = token_amount;
            if (milestone_order !== undefined) updateData.milestone_order = milestone_order;

            await db('milestones').where('id', id).update(updateData);

            const updated = await db('milestones').where('id', id).first();

            logger.info(`Milestone updated: id=${id}`);

            res.json({
                success: true,
                data: updated
            });

        } catch (error) {
            logger.error('Error updating milestone:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update milestone',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// PUT /api/milestones/:id/complete
// Mark a milestone as complete (special endpoint)
router.put('/:id/complete',
    sanitizeBody(),
    async (req, res) => {
        const { id } = req.params;
        const { verified_by, completion_notes } = req.body;

        try {
            if (!verified_by) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required field: verified_by',
                    code: 'MISSING_FIELDS'
                });
            }

            const milestone = await db('milestones').where('id', id).first();

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    error: 'Milestone not found',
                    code: 'NOT_FOUND'
                });
            }

            if (milestone.status === 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Milestone already completed',
                    code: 'ALREADY_COMPLETED'
                });
            }

            const completedDate = new Date().toISOString();

            await db.transaction(async (trx) => {
                // Update milestone
                await trx('milestones').where('id', id).update({
                    status: 'completed',
                    completed_date: completedDate,
                    verified_by,
                    completion_notes: completion_notes || null,
                    updated_at: completedDate
                });

                // Create token release record if tokens assigned
                if (milestone.token_amount && milestone.token_amount > 0) {
                    await trx('token_release_schedule').insert({
                        council_member_id: milestone.council_member_id,
                        agreement_id: milestone.agreement_id,
                        milestone_id: id,
                        release_type: 'milestone_based',
                        token_amount: milestone.token_amount,
                        release_date: completedDate.split('T')[0],
                        status: 'unlocked',
                        created_at: completedDate,
                        updated_at: completedDate
                    });
                }

                // Log in workflow
                await trx('agreement_workflow_log').insert({
                    agreement_id: milestone.agreement_id,
                    council_member_id: milestone.council_member_id,
                    from_status: 'active',
                    to_status: 'milestone_completed',
                    transition_reason: `Milestone "${milestone.title}" completed`,
                    changed_by: verified_by,
                    changed_by_role: 'admin',
                    additional_data: JSON.stringify({
                        milestone_id: id,
                        milestone_title: milestone.title,
                        token_amount: milestone.token_amount,
                        completion_notes
                    }),
                    created_at: completedDate
                });
            });

            // Check if all milestones are complete
            const remaining = await db('milestones')
                .where('council_member_id', milestone.council_member_id)
                .where('status', '!=', 'completed')
                .count('* as count')
                .first();

            logger.info(`Milestone completed: id=${id}, verified_by=${verified_by}, tokens_released=${milestone.token_amount || 0}`);

            res.json({
                success: true,
                data: {
                    milestone_id: id,
                    status: 'completed',
                    completed_date: completedDate,
                    tokens_released: milestone.token_amount || 0,
                    all_milestones_complete: (remaining?.count || 0) === 0
                }
            });

        } catch (error) {
            logger.error('Error completing milestone:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to complete milestone',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// DELETE /api/milestones/:id
// Delete a milestone
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const milestone = await db('milestones').where('id', id).first();

        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found',
                code: 'NOT_FOUND'
            });
        }

        // Don't allow deleting completed milestones
        if (milestone.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete a completed milestone',
                code: 'MILESTONE_COMPLETED'
            });
        }

        await db('milestones').where('id', id).delete();

        // Reorder remaining milestones
        const remaining = await db('milestones')
            .where('council_member_id', milestone.council_member_id)
            .orderBy('milestone_order', 'asc');

        for (let i = 0; i < remaining.length; i++) {
            await db('milestones')
                .where('id', remaining[i].id)
                .update({ milestone_order: i + 1 });
        }

        logger.info(`Milestone deleted: id=${id}, title=${milestone.title}`);

        res.json({
            success: true,
            data: { deleted_id: id }
        });

    } catch (error) {
        logger.error('Error deleting milestone:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete milestone',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// GET /api/milestones/member/:memberId
// Get all milestones for a specific council member
router.get('/member/:memberId', async (req, res) => {
    const { memberId } = req.params;

    try {
        const member = await db('council_members').where('id', memberId).first();

        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Council member not found',
                code: 'MEMBER_NOT_FOUND'
            });
        }

        const milestones = await db('milestones')
            .where('council_member_id', memberId)
            .orderBy('milestone_order', 'asc');

        // Check for overdue milestones
        const today = new Date().toISOString().split('T')[0];
        const milestonesWithOverdue = milestones.map(m => ({
            ...m,
            is_overdue: m.status !== 'completed' && m.target_date && m.target_date < today
        }));

        res.json({
            success: true,
            data: milestonesWithOverdue,
            count: milestones.length
        });

    } catch (error) {
        logger.error('Error fetching member milestones:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch member milestones',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// GET /api/milestones/stats/:memberId
// Get milestone progress stats for a member
router.get('/stats/:memberId', async (req, res) => {
    const { memberId } = req.params;

    try {
        const member = await db('council_members').where('id', memberId).first();

        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Council member not found',
                code: 'MEMBER_NOT_FOUND'
            });
        }

        const milestones = await db('milestones')
            .where('council_member_id', memberId)
            .orderBy('milestone_order', 'asc');

        const completed = milestones.filter(m => m.status === 'completed');
        const pending = milestones.filter(m => m.status !== 'completed');

        const tokensReleased = completed.reduce((sum, m) => sum + (m.token_amount || 0), 0);
        const tokensRemaining = pending.reduce((sum, m) => sum + (m.token_amount || 0), 0);

        const today = new Date().toISOString().split('T')[0];
        const overdue = milestones.filter(m =>
            m.status !== 'completed' &&
            m.target_date &&
            m.target_date < today
        );

        const nextMilestone = milestones.find(m => m.status !== 'completed');

        res.json({
            success: true,
            data: {
                total: milestones.length,
                completed: completed.length,
                pending: pending.length,
                overdue: overdue.length,
                percentage: milestones.length > 0
                    ? Math.round((completed.length / milestones.length) * 100)
                    : 0,
                tokens_released: tokensReleased,
                tokens_remaining: tokensRemaining,
                tokens_total: tokensReleased + tokensRemaining,
                next_milestone: nextMilestone || null,
                overdue_milestones: overdue
            }
        });

    } catch (error) {
        logger.error('Error fetching milestone stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch milestone stats',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// PUT /api/milestones/reorder
// Reorder milestones for a member
router.put('/reorder',
    sanitizeBody(),
    async (req, res) => {
        const { council_member_id, milestone_ids } = req.body;

        try {
            if (!council_member_id || !milestone_ids || !Array.isArray(milestone_ids)) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: council_member_id, milestone_ids (array)',
                    code: 'MISSING_FIELDS'
                });
            }

            // Verify all milestones belong to this member
            const existing = await db('milestones')
                .where('council_member_id', council_member_id)
                .select('id');

            const existingIds = existing.map(m => m.id);
            const allBelong = milestone_ids.every(id => existingIds.includes(id));

            if (!allBelong) {
                return res.status(400).json({
                    success: false,
                    error: 'Some milestone IDs do not belong to this member',
                    code: 'INVALID_MILESTONE_IDS'
                });
            }

            // Update order
            await db.transaction(async (trx) => {
                for (let i = 0; i < milestone_ids.length; i++) {
                    await trx('milestones')
                        .where('id', milestone_ids[i])
                        .update({
                            milestone_order: i + 1,
                            updated_at: new Date().toISOString()
                        });
                }
            });

            logger.info(`Milestones reordered for member: ${council_member_id}`);

            res.json({
                success: true,
                data: { reordered: milestone_ids.length }
            });

        } catch (error) {
            logger.error('Error reordering milestones:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to reorder milestones',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

export default router;
