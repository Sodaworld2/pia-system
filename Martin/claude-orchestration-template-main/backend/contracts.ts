import { Router } from 'express';
import db from '../database';
import logger from '../utils/logger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sanitizeBody } from '../utils/sanitize';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// GET /api/contracts/:contractId
// Get generated contract details
router.get('/:contractId', async (req, res) => {
    const { contractId } = req.params;

    try {
        const contract = await db('generated_contracts')
            .where('id', contractId)
            .first();

        if (!contract) {
            return res.status(404).json({
                success: false,
                error: 'Contract not found',
                code: 'CONTRACT_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: {
                contract_id: contract.id,
                status: contract.status,
                contract_text: contract.contract_text,
                contract_version: contract.contract_version,
                agreement_type: contract.agreement_type,
                legal_framework: contract.legal_framework,
                generated_at: contract.generated_at,
                generated_by: contract.generated_by,
                approved_by: contract.approved_by,
                approved_at: contract.approved_at,
                error_message: contract.error_message
            }
        });

    } catch (error) {
        logger.error('Error fetching contract:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch contract',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

// POST /api/contracts/:contractId/regenerate
// Regenerate contract with new version
router.post('/:contractId/regenerate',
    sanitizeBody(),
    async (req, res) => {
        const { contractId } = req.params;
        const { custom_terms } = req.body;

        try {
            // Get existing contract
            const existingContract = await db('generated_contracts')
                .where('id', contractId)
                .first();

            if (!existingContract) {
                return res.status(404).json({
                    success: false,
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }

            // Get agreement and council member details
            const agreement = await db('agreements')
                .where('id', existingContract.agreement_id)
                .first();

            const councilMember = await db('council_members')
                .where('id', existingContract.council_member_id)
                .first();

            if (!agreement || !councilMember) {
                return res.status(404).json({
                    success: false,
                    error: 'Agreement or member not found',
                    code: 'DATA_NOT_FOUND'
                });
            }

            // Get milestones
            const milestones = await db('milestones')
                .where('agreement_id', agreement.id)
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

Format the contract professionally with appropriate sections and legal language.
Generate a DIFFERENT version from previous attempts - vary the structure and wording.`;

            // Generate contract using Gemini
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(prompt);
            const response = result.response;
            const contract_text = response.text();

            // Get next version number
            const latestContract = await db('generated_contracts')
                .where('agreement_id', agreement.id)
                .orderBy('contract_version', 'desc')
                .first();

            const newVersion = latestContract ? Number(latestContract.contract_version) + 1 : 1;

            // Store new contract version
            const [newContractId] = await db('generated_contracts').insert({
                agreement_id: agreement.id,
                council_member_id: councilMember.id,
                contract_text,
                contract_version: newVersion,
                generation_params: JSON.stringify({
                    custom_terms,
                    regenerated_from: contractId,
                    prompt_length: prompt.length
                }),
                legal_framework: details.legal_framework,
                agreement_type: existingContract.agreement_type,
                status: 'generated',
                generated_at: new Date().toISOString(),
                generated_by: 'gemini-pro'
            }).returning('id');

            logger.info(`Contract regenerated: new_contract_id=${newContractId}, old_contract_id=${contractId}, version=${newVersion}`);

            res.status(201).json({
                success: true,
                data: {
                    contract_id: newContractId,
                    contract_version: newVersion,
                    status: 'generated',
                    previous_contract_id: contractId
                }
            });

        } catch (error) {
            logger.error('Error regenerating contract:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to regenerate contract',
                code: 'CONTRACT_REGENERATION_FAILED',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

// POST /api/contracts/:contractId/approve
// Approve a generated contract
router.post('/:contractId/approve',
    sanitizeBody(),
    async (req, res) => {
        const { contractId } = req.params;
        const { approved_by } = req.body;

        try {
            const contract = await db('generated_contracts')
                .where('id', contractId)
                .first();

            if (!contract) {
                return res.status(404).json({
                    success: false,
                    error: 'Contract not found',
                    code: 'CONTRACT_NOT_FOUND'
                });
            }

            if (contract.status === 'approved') {
                return res.status(400).json({
                    success: false,
                    error: 'Contract already approved',
                    code: 'ALREADY_APPROVED'
                });
            }

            await db('generated_contracts')
                .where('id', contractId)
                .update({
                    status: 'approved',
                    approved_by: approved_by || 'system',
                    approved_at: new Date().toISOString()
                });

            logger.info(`Contract approved: contract_id=${contractId}, approved_by=${approved_by}`);

            res.json({
                success: true,
                data: {
                    contract_id: contractId,
                    status: 'approved',
                    approved_at: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Error approving contract:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to approve contract',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
);

export default router;
