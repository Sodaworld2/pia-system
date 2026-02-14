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
            .where('council_member_id', id)
            .orderBy('contract_version', 'desc');

        // Parse agreement details if exists
        let agreementDetails = null;
        if (councilMember.agreement_details) {
            try {
                agreementDetails = JSON.parse(councilMember.agreement_details);
            } catch (e) {
                logger.warn(`Failed to parse agreement details for member ${id}`);
            }
        }

        res.json({
            success: true,
            data: {
                ...councilMember,
                agreement_details: agreementDetails,
                milestones,
                contracts
            }
        });

    } catch (error) {
        logger.error('Error fetching founder agreement:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch founder agreement',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// POST /api/agreements/founder
// Create a new founder agreement
router.post('/',
    sanitizeBody(),
    async (req, res) => {
        const {
            dao_id,
            member_id,
            personal_details,
            role_details,
            token_details,
            milestones,
            rules_terms,
            legal_framework
        } = req.body;

        try {
            // Basic input validation
            if (!dao_id || !personal_details || !role_details || !token_details || !legal_framework) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    code: 'MISSING_FIELDS'
                });
            }

            if (!personal_details.name || !personal_details.surname || !personal_details.email || !personal_details.wallet_address) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required personal details',
                    code: 'MISSING_PERSONAL_DETAILS'
                });
            }

            if (!role_details.role_category) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing role category',
                    code: 'MISSING_ROLE_CATEGORY'
                });
            }

            if (token_details.token_allocation === undefined || token_details.firestarter_period_months === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing token details',
                    code: 'MISSING_TOKEN_DETAILS'
                });
            }

            // FR17: Enforce maximum 7 Founders per DAO
            const existingFounders = await db('council_members')
                .where('dao_id', dao_id)
                .where('role_type', 'founder')
                .whereNotIn('status', ['cancelled'])
                .count('* as count')
                .first();

            const founderCount = Number(existingFounders?.count || 0);

            if (founderCount >= 7) {
                return res.status(403).json({
                    success: false,
                    error: 'Maximum 7 founders per DAO exceeded',
                    code: 'MAX_FOUNDERS_EXCEEDED',
                    details: {
                        current_founders: founderCount,
                        max_allowed: 7
                    }
                });
            }

            // FR78: Validate email format (done by express-validator)
            // FR79: Validate wallet address format
            if (personal_details.wallet_address.length < 32) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid wallet address format',
                    code: 'INVALID_WALLET_ADDRESS'
                });
            }

            // FR80: Validate unique email within DAO
            const existingEmail = await db('council_members')
                .where('dao_id', dao_id)
                .where('email', personal_details.email)
                .whereNotIn('status', ['cancelled'])
                .first();

            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already exists for this DAO',
                    code: 'EMAIL_DUPLICATE',
                    details: {
                        existing_member_id: existingEmail.id
                    }
                });
            }

            // Validate token allocation within available Founders pool
            const dao = await db('daos').where('id', dao_id).first();
            if (!dao) {
                return res.status(404).json({
                    success: false,
                    error: 'DAO not found',
                    code: 'DAO_NOT_FOUND'
                });
            }

            // Calculate total allocated to existing founders
            const allocatedTokens = await db('council_members')
                .where('dao_id', dao_id)
                .where('role_type', 'founder')
                .whereNotIn('status', ['cancelled'])
                .sum('token_allocation_total as total')
                .first();

            const currentlyAllocated = allocatedTokens?.total || 0;
            const totalSupply = dao.total_supply || 0;
            const foundersPool = totalSupply * 0.40; // 40% for founders (as per architecture)
            const remaining = foundersPool - currentlyAllocated;

            if (token_details.token_allocation > remaining) {
                return res.status(400).json({
                    success: false,
                    error: 'Token allocation exceeds available Founders pool',
                    code: 'INSUFFICIENT_TOKENS',
                    details: {
                        requested: token_details.token_allocation,
                        available: remaining,
                        founders_pool: foundersPool,
                        already_allocated: currentlyAllocated
                    }
                });
            }

            // Validate milestones if provided
            if (milestones && milestones.length > 12) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 12 milestones allowed',
                    code: 'MAX_MILESTONES_EXCEEDED'
                });
            }

            // Start transaction
            const result = await db.transaction(async (trx) => {
                // Create council_member record
                const [councilMemberId] = await trx('council_members').insert({
                    dao_id,
                    name: personal_details.name,
                    surname: personal_details.surname,
                    email: personal_details.email,
                    phone: personal_details.phone || null,
                    wallet_address: personal_details.wallet_address,
                    photo_url: personal_details.photo_url || null,
                    role_type: 'founder',
                    role_category: role_details.role_category,
                    custom_role_description: role_details.custom_role_description || null,
                    token_allocation_total: token_details.token_allocation,
                    firestarter_period_months: token_details.firestarter_period_months,
                    term_months: null, // Founders don't have fixed terms
                    status: 'draft',
                    created_by: 'system', // TODO: Get from auth context
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).returning('id');

                // Create agreement record
                const [agreementId] = await trx('agreements').insert({
                    dao_id,
                    title: `Founder Agreement - ${personal_details.name} ${personal_details.surname}`,
                    description: role_details.custom_role_description || `${role_details.role_category} Founder`,
                    type: 'Founder Agreement',
                    status: 'Draft',
                    party: JSON.stringify({
                        name: personal_details.name,
                        surname: personal_details.surname,
                        email: personal_details.email,
                        walletAddress: personal_details.wallet_address
                    }),
                    details: JSON.stringify({
                        role_category: role_details.role_category,
                        custom_role_description: role_details.custom_role_description,
                        token_allocation: token_details.token_allocation,
                        firestarter_period_months: token_details.firestarter_period_months,
                        rules_terms,
                        legal_framework,
                        milestone_count: milestones?.length || 0
                    }),
                    created_at: new Date().toISOString()
                }).returning('id');

                // Link agreement to council_member
                await trx('council_members')
                    .where('id', councilMemberId)
                    .update({ agreement_id: agreementId });

                // Create milestones if provided
                if (milestones && milestones.length > 0) {
                    const milestoneRecords = milestones.map((milestone: any, index: number) => ({
                        agreement_id: agreementId,
                        council_member_id: councilMemberId,
                        title: milestone.title,
                        description: milestone.description || null,
                        milestone_order: milestone.milestone_order || (index + 1),
                        target_date: milestone.target_date || null,
                        token_amount: milestone.token_amount || null,
                        status: 'pending',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }));

                    await trx('milestones').insert(milestoneRecords);
                }

                // Create workflow log entry
                await trx('agreement_workflow_log').insert({
                    agreement_id: agreementId,
                    council_member_id: councilMemberId,
                    from_status: null,
                    to_status: 'draft',
                    transition_reason: 'Agreement created',
                    changed_by: 'system', // TODO: Get from auth context
                    changed_by_role: 'system',
                    additional_data: JSON.stringify({
                        founder_count: founderCount + 1,
                        token_allocation: token_details.token_allocation
                    }),
                    created_at: new Date().toISOString()
                });

                return { agreement_id: agreementId, member_id: councilMemberId };
            });

            logger.info(`Founder agreement created: agreement_id=${result.agreement_id}, member_id=${result.member_id}`);

            // Return success response
            res.status(201).json({
                success: true,
                data: {
                    agreement_id: result.agreement_id,
                    member_id: result.member_id,
                    contract_generation_status: 'queued',
                    next_step: 'contract_generation'
                }
            });

        } catch (error) {
            logger.error('Error creating founder agreement:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create founder agreement',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// POST /api/agreements/founder/:agreementId/generate-contract
// Generate AI contract using Gemini
router.post('/:agreementId/generate-contract',
    sanitizeBody(),
    async (req, res) => {
        const { agreementId } = req.params;
        const { custom_terms } = req.body;

        try {
            // Get agreement and council member details
            const agreement = await db('agreements')
                .where('id', agreementId)
                .first();

            if (!agreement) {
                return res.status(404).json({
                    success: false,
                    error: 'Agreement not found',
                    code: 'AGREEMENT_NOT_FOUND'
                });
            }

            const councilMember = await db('council_members')
                .where('agreement_id', agreementId)
                .first();

            if (!councilMember) {
                return res.status(404).json({
                    success: false,
                    error: 'Council member not found',
                    code: 'MEMBER_NOT_FOUND'
                });
            }

            // Get milestones
            const milestones = await db('milestones')
                .where('agreement_id', agreementId)
                .orderBy('milestone_order');

            // Parse details
            const details = JSON.parse(agreement.details);

            // Build contract generation prompt
            const prompt = `Generate a professional Founder Agreement contract for a DAO with the following details:

**Founder Information:**
- Name: ${councilMember.name} ${councilMember.surname}
- Email: ${councilMember.email}
- Wallet Address: ${councilMember.wallet_address}
- Role Category: ${details.role_category}
- Custom Role Description: ${details.custom_role_description || 'N/A'}

**Token Allocation:**
- Total Token Allocation: ${details.token_allocation} tokens
- Firestarter Period: ${details.firestarter_period_months} months

**Milestones:**
${milestones.length > 0 ? milestones.map((m: any, idx: number) =>
    `${idx + 1}. ${m.title}${m.description ? ' - ' + m.description : ''}${m.target_date ? ' (Target: ' + m.target_date + ')' : ''}`
).join('\n') : 'No milestones defined'}

**Custom Terms:**
${custom_terms || details.rules_terms || 'No custom terms specified'}

**Legal Framework:** ${details.legal_framework}

Please generate a comprehensive, legally-binding Founder Agreement contract that includes:
1. Parties involved
2. Role and responsibilities
3. Token allocation and vesting schedule
4. Firestarter period details
5. Milestones and deliverables
6. Rights and obligations
7. Termination clauses
8. Governing law (${details.legal_framework})

Format the contract professionally with appropriate sections and legal language.`;

            // Generate contract using Gemini
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(prompt);
            const response = result.response;
            const contract_text = response.text();

            // Check for existing contracts
            const existingContracts = await db('generated_contracts')
                .where('agreement_id', agreementId)
                .orderBy('contract_version', 'desc')
                .first();

            const newVersion = existingContracts ? Number(existingContracts.contract_version) + 1 : 1;

            // Store generated contract
            const [contractId] = await db('generated_contracts').insert({
                agreement_id: agreementId,
                council_member_id: councilMember.id,
                contract_text,
                contract_version: newVersion,
                generation_params: JSON.stringify({
                    custom_terms,
                    prompt_length: prompt.length
                }),
                legal_framework: details.legal_framework,
                agreement_type: 'founder',
                status: 'generated',
                generated_at: new Date().toISOString(),
                generated_by: 'gemini-pro'
            }).returning('id');

            logger.info(`Contract generated: contract_id=${contractId}, agreement_id=${agreementId}, version=${newVersion}`);

            res.status(201).json({
                success: true,
                data: {
                    contract_id: contractId,
                    status: 'generated',
                    contract_version: newVersion,
                    estimated_time_seconds: 0 // Already generated
                }
            });

        } catch (error) {
            logger.error('Error generating contract:', error);

            // Try to save failed generation record
            try {
                const councilMember = await db('council_members')
                    .where('agreement_id', agreementId)
                    .first();

                if (councilMember) {
                    await db('generated_contracts').insert({
                        agreement_id: agreementId,
                        council_member_id: councilMember.id,
                        contract_text: '',
                        contract_version: 1,
                        legal_framework: 'USA',
                        agreement_type: 'founder',
                        status: 'failed',
                        error_message: error instanceof Error ? error.message : 'Unknown error',
                        generated_at: new Date().toISOString(),
                        generated_by: 'gemini-pro'
                    });
                }
            } catch (dbError) {
                logger.error('Error saving failed contract record:', dbError);
            }

            res.status(500).json({
                success: false,
                error: 'Failed to generate contract',
                code: 'CONTRACT_GENERATION_FAILED',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

// PUT /api/agreements/founder/:id/status
// Update agreement workflow status
router.put('/:id/status',
    sanitizeBody(),
    async (req, res) => {
        const { id } = req.params;
        const { status, reason, changed_by } = req.body;

        try {
            // Validate required fields
            if (!status || !changed_by) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: status, changed_by',
                    code: 'MISSING_FIELDS'
                });
            }

            // Valid status transitions
            const validStatuses = ['draft', 'pending', 'signed', 'active', 'cancelled'];
            if (!validStatuses.includes(status.toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
                    code: 'INVALID_STATUS'
                });
            }

            // Get current member and agreement
            const member = await db('council_members')
                .where('id', id)
                .where('role_type', 'founder')
                .first();

            if (!member) {
                return res.status(404).json({
                    success: false,
                    error: 'Founder not found',
                    code: 'NOT_FOUND'
                });
            }

            const agreement = await db('agreements')
                .where('id', member.agreement_id)
                .first();

            if (!agreement) {
                return res.status(404).json({
                    success: false,
                    error: 'Agreement not found',
                    code: 'NOT_FOUND'
                });
            }

            const fromStatus = member.status;
            const toStatus = status.toLowerCase();

            // Update member and agreement status
            await db.transaction(async (trx) => {
                await trx('council_members')
                    .where('id', id)
                    .update({
                        status: toStatus,
                        updated_at: new Date().toISOString()
                    });

                await trx('agreements')
                    .where('id', member.agreement_id)
                    .update({
                        status: toStatus.charAt(0).toUpperCase() + toStatus.slice(1)
                    });

                // Create workflow log entry
                await trx('agreement_workflow_log').insert({
                    agreement_id: member.agreement_id,
                    council_member_id: id,
                    from_status: fromStatus,
                    to_status: toStatus,
                    transition_reason: reason || `Status updated to ${toStatus}`,
                    changed_by,
                    changed_by_role: 'admin',
                    additional_data: JSON.stringify({
                        changed_at: new Date().toISOString()
                    }),
                    created_at: new Date().toISOString()
                });
            });

            logger.info(`Agreement status updated: member_id=${id}, from=${fromStatus}, to=${toStatus}, by=${changed_by}`);

            res.json({
                success: true,
                data: {
                    member_id: id,
                    agreement_id: member.agreement_id,
                    from_status: fromStatus,
                    to_status: toStatus,
                    updated_at: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Error updating agreement status:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update agreement status',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// POST /api/agreements/founder/:id/submit
// Submit agreement for signatures (Draft → Pending)
router.post('/:id/submit',
    sanitizeBody(),
    async (req, res) => {
        const { id } = req.params;
        const { submitted_by } = req.body;

        try {
            if (!submitted_by) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required field: submitted_by',
                    code: 'MISSING_FIELDS'
                });
            }

            // Get member and agreement
            const member = await db('council_members')
                .where('id', id)
                .where('role_type', 'founder')
                .first();

            if (!member) {
                return res.status(404).json({
                    success: false,
                    error: 'Founder not found',
                    code: 'NOT_FOUND'
                });
            }

            // Validate status is draft
            if (member.status !== 'draft') {
                return res.status(400).json({
                    success: false,
                    error: 'Agreement must be in draft status to submit',
                    code: 'INVALID_STATUS',
                    details: {
                        current_status: member.status
                    }
                });
            }

            // Check if contract exists
            const contract = await db('generated_contracts')
                .where('council_member_id', id)
                .where('status', 'generated')
                .orWhere('status', 'approved')
                .first();

            if (!contract) {
                return res.status(400).json({
                    success: false,
                    error: 'Agreement must have a generated contract before submission',
                    code: 'CONTRACT_REQUIRED'
                });
            }

            // Update to pending status
            await db.transaction(async (trx) => {
                await trx('council_members')
                    .where('id', id)
                    .update({
                        status: 'pending',
                        updated_at: new Date().toISOString()
                    });

                await trx('agreements')
                    .where('id', member.agreement_id)
                    .update({
                        status: 'Pending'
                    });

                // Create workflow log
                await trx('agreement_workflow_log').insert({
                    agreement_id: member.agreement_id,
                    council_member_id: id,
                    from_status: 'draft',
                    to_status: 'pending',
                    transition_reason: 'Agreement submitted for signatures',
                    changed_by: submitted_by,
                    changed_by_role: 'admin',
                    additional_data: JSON.stringify({
                        contract_id: contract.id,
                        submitted_at: new Date().toISOString()
                    }),
                    created_at: new Date().toISOString()
                });
            });

            logger.info(`Agreement submitted: member_id=${id}, submitted_by=${submitted_by}`);

            res.json({
                success: true,
                data: {
                    member_id: id,
                    agreement_id: member.agreement_id,
                    status: 'pending',
                    contract_id: contract.id,
                    next_step: 'signature_collection'
                }
            });

        } catch (error) {
            logger.error('Error submitting agreement:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to submit agreement',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

// PUT /api/agreements/founder/milestones/:milestoneId
// Update a milestone
router.put('/milestones/:milestoneId',
    sanitizeBody(),
    async (req, res) => {
        const { milestoneId } = req.params;
        const { title, description, target_date, token_amount } = req.body;

        try {
            const milestone = await db('milestones')
                .where('id', milestoneId)
                .first();

            if (!milestone) {
                return res.status(404).json({
                    success: false,
                    error: 'Milestone not found',
                    code: 'NOT_FOUND'
                });
            }

            // Cannot update completed milestones
            if (milestone.status === 'completed') {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot update completed milestone',
                    code: 'MILESTONE_COMPLETED'
                });
            }

            const updates: any = {
                updated_at: new Date().toISOString()
            };

            if (title !== undefined) updates.title = title;
            if (description !== undefined) updates.description = description;
            if (target_date !== undefined) updates.target_date = target_date;
            if (token_amount !== undefined) updates.token_amount = token_amount;

            await db('milestones')
                .where('id', milestoneId)
                .update(updates);

            const updatedMilestone = await db('milestones')
                .where('id', milestoneId)
                .first();

            logger.info(`Milestone updated: milestone_id=${milestoneId}`);

            res.json({
                success: true,
                data: updatedMilestone
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

// PATCH /api/agreements/founder/milestones/:milestoneId/complete
// Mark milestone as complete
router.patch('/milestones/:milestoneId/complete',
    sanitizeBody(),
    async (req, res) => {
        const { milestoneId } = req.params;
        const { completed_by, completion_notes } = req.body;

        try {
            if (!completed_by) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required field: completed_by',
                    code: 'MISSING_FIELDS'
                });
            }

            const milestone = await db('milestones')
                .where('id', milestoneId)
                .first();

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

            await db('milestones')
                .where('id', milestoneId)
                .update({
                    status: 'completed',
                    completion_notes: completion_notes || null,
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            const updatedMilestone = await db('milestones')
                .where('id', milestoneId)
                .first();

            logger.info(`Milestone completed: milestone_id=${milestoneId}, by=${completed_by}`);

            res.json({
                success: true,
                data: updatedMilestone
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

// DELETE /api/agreements/founder/milestones/:milestoneId
// Delete a milestone
router.delete('/milestones/:milestoneId', async (req, res) => {
    const { milestoneId } = req.params;

    try {
        const milestone = await db('milestones')
            .where('id', milestoneId)
            .first();

        if (!milestone) {
            return res.status(404).json({
                success: false,
                error: 'Milestone not found',
                code: 'NOT_FOUND'
            });
        }

        // Cannot delete completed milestones
        if (milestone.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete completed milestone',
                code: 'MILESTONE_COMPLETED'
            });
        }

        await db('milestones')
            .where('id', milestoneId)
            .delete();

        logger.info(`Milestone deleted: milestone_id=${milestoneId}`);

        res.json({
            success: true,
            data: {
                milestone_id: milestoneId,
                deleted: true
            }
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

export default router;
