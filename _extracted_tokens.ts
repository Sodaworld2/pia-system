import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { incrementBalance, decrementBalance } from '../utils/optimistic-locking';

const router = express.Router();

// Get user balance
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await db('user_balances').where({ user_id: userId }).first();

    if (!user) {
      // Create new user with default balance
      await db('user_balances').insert({
        user_id: userId,
        soda_balance: 0,
        bubble_score: 0
      });
      res.json({ userId, sodaBalance: 0, bubbleScore: 0 });
    } else {
      res.json({
        userId: user.user_id,
        sodaBalance: user.soda_balance,
        bubbleScore: user.bubble_score
      });
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Transfer tokens between users
router.post('/transfer', async (req, res) => {
  try {
    const { fromUser, toUser, amount, memo } = req.body;

    if (!fromUser || !toUser || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid transfer request' });
    }

    // Check sender balance
    const sender = await db('user_balances').where({ user_id: fromUser }).first();

    if (!sender || sender.soda_balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct from sender with optimistic locking
    const senderResult = await decrementBalance(fromUser, 'soda_balance', amount);

    // Add to receiver with optimistic locking
    const receiver = await db('user_balances').where({ user_id: toUser }).first();
    let receiverResult;
    if (receiver) {
      receiverResult = await incrementBalance(toUser, 'soda_balance', amount);
    } else {
      // Create new receiver account
      await db('user_balances').insert({
        user_id: toUser,
        soda_balance: amount,
        bubble_score: 0,
        version: 1
      });
      receiverResult = { newBalance: amount };
    }

    // Record transaction
    const txId = uuidv4();
    await db('token_transactions').insert({
      id: txId,
      from_user: fromUser,
      to_user: toUser,
      amount,
      transaction_type: 'transfer',
      memo: memo || 'Transfer',
      status: 'completed'
    });

    res.json({
      success: true,
      transactionId: txId,
      senderNewBalance: senderResult.newBalance,
      receiverNewBalance: receiverResult.newBalance
    });
  } catch (error) {
    console.error('Error transferring tokens:', error);
    res.status(500).json({ error: 'Failed to transfer tokens' });
  }
});

// Reward tokens to a user
router.post('/reward', async (req, res) => {
  try {
    const { userId, amount, reason, referenceId } = req.body;

    if (!userId || !amount |
