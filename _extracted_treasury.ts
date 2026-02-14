import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { TreasuryTransaction } from '../types';
import { validate, validators } from '../middleware/validation';
import { sanitizeBody } from '../utils/sanitize';

const router = Router();

// Helper function to calculate treasury balance
async function calculateTreasuryBalance(): Promise<number> {
    // Starting balance (could be moved to a config table later)
    const INITIAL_BALANCE = 1000000;

    // Get all executed withdrawals (recipient is NOT treasury)
    const executedWithdrawals = await db('treasury_transactions')
        .where('status', 'Executed')
        .whereNot('recipient', 'treasury')
        .whereNot('recipient', 'treasury_deposit')
        .sum('amount as total')
        .first();

    // Get all deposits (recipient is treasury or treasury_deposit, status is Executed/Completed)
    const deposits = await db('treasury_transactions')
        .where(function() {
            this.where('recipient', 'treasury')
                .orWhere('recipient', 'treasury_deposit');
        })
        .where(function() {
            this.where('status', 'Executed')
                .orWhere('status', 'Completed');
        })
        .sum('amount as total')
        .first();

    const totalWithdrawals = executedWithdrawals?.total || 0;
    const totalDeposits = deposits?.total || 0;
    const currentBalance = INITIAL_BALANCE + totalDeposits - totalWithdrawals;

    return currentBalance;
}

// GET /api/treasury/vitals
router.get('/vitals', async (req, res) => {
    try {
        const policy = await db('treasury_policies').first();
        const signers = await db('treasury_signers').select();

        // Calculate actual balance from transaction history
        const balance = await calculateTreasuryBalance();

        res.json({
            balance,
            policy: {
                requiredSignatures: policy.required_signatures,
                totalSigners: signers.length,
            },
            signers,
        });
    } catch (error) {
        console.error('Error fetching treasury vitals:', error);
        res.status(500).json({ error: 'Failed to fetch treasury vitals' });
    }
});

// GET /api/treasury/transactions
router.get('/transactions', async (req, res) => {
    try {
        const transactions = await db('treasury_transactions').select('*').orderBy('created_at', 'desc');

        const transactionsWithApprovals = await Promise.all(transactions.map(async (tx) => {
            const approvals = await db('treasury_approvals')
                .where('transaction_id', tx.id)
                .select('signer_address');
            return {
                ...tx,
                approvals: approvals.map(a => a.signer_address),
            };
        }));

        res.json(transactionsWithApprovals);
    } catch (error) {
        console.error('Err
