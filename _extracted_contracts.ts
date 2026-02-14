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
       
