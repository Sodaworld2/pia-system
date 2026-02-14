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
        console.error('Error fetching treasury transactions:', error);
        res.status(500).json({ error: 'Failed to fetch treasury transactions' });
    }
});

// POST /api/treasury/transactions
router.post('/transactions',
    sanitizeBody({ maxLength: 500 }),
    validate([
        validators.ethereumAddress('recipient'),
        validators.positiveAmount('amount'),
        {
            field: 'recipientName',
            type: 'string',
            required: false,
            minLength: 1,
            maxLength: 100
        },
        {
            field: 'memo',
            type: 'string',
            required: true,
            minLength: 3,
            maxLength: 500
        }
    ]),
    async (req, res) => {
    const { recipient, recipientName, amount, memo } = req.body;

    // Check if transaction amount exceeds available balance
    try {
        const currentBalance = await calculateTreasuryBalance();

        if (amount > currentBalance) {
            return res.status(400).json({
                error: 'Insufficient treasury balance',
                requested: amount,
                available: currentBalance,
                message: `Cannot create transaction for ${amount} tokens. Only ${currentBalance} tokens available.`
            });
        }
    } catch (error) {
        console.error('Error checking treasury balance:', error);
        // Continue anyway - don't block transaction creation if balance check fails
    }

    const newTxData = {
        id: uuidv4(),
        recipient,
        recipientName: recipientName || 'Unknown Address',
        amount: parseFloat(amount),
        memo,
        status: 'Pending',
        dateInitiated: new Date().toISOString(),
    };

    try {
        await db('treasury_transactions').insert(newTxData);
        const newTx = await db('treasury_transactions').where('id', newTxData.id).first();
        res.status(201).json({ ...newTx, approvals: [] });
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

// POST /api/treasury/transactions/:id/approve
router.post('/transactions/:id/approve',
    sanitizeBody(),
    validate([
        validators.ethereumAddress('signer_address')
    ]),
    async (req, res) => {
    const { id } = req.params;
    const { signer_address } = req.body;

    try {
        const tx = await db('treasury_transactions').where('id', id).first();
        if (!tx) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        if (tx.status !== 'Pending') {
            return res.status(400).json({ error: 'Transaction is not pending' });
        }

        // Verify signer is authorized
        const signer = await db('treasury_signers')
            .where('address', signer_address)
            .first();

        if (!signer) {
            return res.status(403).json({
                error: 'Not an authorized signer',
                message: 'This address is not in the list of authorized treasury signers'
            });
        }

        // Check for duplicate approval
        const existingApproval = await db('treasury_approvals')
            .where({ transaction_id: id, signer_address: signer_address })
            .first();

        if (existingApproval) {
            return res.status(400).json({
                error: 'Already approved',
                message: 'This signer has already approved this transaction'
            });
        }

        await db('treasury_approvals').insert({
            transaction_id: id,
            signer_address: signer_address,
        });

        const policy = await db('treasury_policies').first();
        const approvals = await db('treasury_approvals').where('transaction_id', id);

        let finalTx = { ...tx, approvals: approvals.map(a => a.signer_address) };

        if (approvals.length >= policy.required_signatures) {
            await db('treasury_transactions')
                .where('id', id)
                .update({ status: 'Executed', dateExecuted: new Date().toISOString() });
            finalTx.status = 'Executed';
        }

        res.json(finalTx);

    } catch (error) {
        console.error('Error approving transaction:', error);
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Signer has already approved this transaction' });
        }
        res.status(500).json({ error: 'Failed to approve transaction' });
    }
});

// POST /api/treasury/deposit
// Record an incoming deposit (e.g., from SodaWorld revenue)
router.post('/deposit',
    sanitizeBody({ maxLength: 500 }),
    validate([
        validators.positiveAmount('amount'),
        {
            field: 'source',
            type: 'string',
            required: true,
            minLength: 1,
            maxLength: 50
        },
        {
            field: 'memo',
            type: 'string',
            required: false,
            maxLength: 500
        }
    ]),
    async (req, res) => {
    const { amount, source, reference, memo } = req.body;

    try {
        // Use 'treasury_deposit' as recipient to mark this as a deposit
        // Include source/reference info in memo since those columns don't exist
        const depositMemo = memo || `Deposit from ${source}${reference ? ` (ref: ${reference})` : ''}`;

        const deposit = {
            id: uuidv4(),
            recipient: 'treasury_deposit',  // Special recipient to identify deposits
            recipientName: `Deposit: ${source}`,
            amount: parseFloat(amount),
            memo: depositMemo,
            status: 'Executed',  // Deposits are executed immediately
            dateInitiated: new Date().toISOString(),
            dateExecuted: new Date().toISOString(),
        };

        await db('treasury_transactions').insert(deposit);

        // Get updated balance
        const newBalance = await calculateTreasuryBalance();

        res.status(201).json({
            success: true,
            deposit: {
                id: deposit.id,
                amount: deposit.amount,
                source: source,
                reference: reference || null,
                status: deposit.status,
                timestamp: deposit.dateExecuted
            },
            treasuryBalance: newBalance
        });

    } catch (error) {
        console.error('Error recording deposit:', error);
        res.status(500).json({ error: 'Failed to record deposit' });
    }
});

// POST /api/treasury/transactions/:id/reject
router.post('/transactions/:id/reject', async (req, res) => {
    const { id } = req.params;

    try {
        const tx = await db('treasury_transactions').where('id', id).first();
        if (!tx) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        if (tx.status !== 'Pending') {
            return res.status(400).json({ error: 'Transaction is not pending' });
        }

        await db('treasury_transactions').where('id', id).update({ status: 'Rejected' });

        const updatedTx = await db('treasury_transactions').where('id', id).first();
        const approvals = await db('treasury_approvals').where('transaction_id', id);

        res.json({ ...updatedTx, approvals: approvals.map(a => a.signer_address) });

    } catch (error) {
        console.error('Error rejecting transaction:', error);
        res.status(500).json({ error: 'Failed to reject transaction' });
    }
});

export default router;
