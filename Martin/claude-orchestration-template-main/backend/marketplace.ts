import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { incrementBalance, decrementBalance } from '../utils/optimistic-locking';

const router = express.Router();

// Get all marketplace items
router.get('/items', async (req, res) => {
  try {
    const { type, status } = req.query;

    let query = db('marketplace_items');

    // Filter by type if provided
    if (type && type !== 'All') {
      query = query.where('type', type);
    }

    // Filter by status (default to 'active')
    if (status) {
      query = query.where('status', status);
    } else {
      query = query.where('status', 'active');
    }

    const items = await query.orderBy('created_at', 'desc');

    // Format items to match frontend MarketplaceItem interface
    const formattedItems = items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      price: item.price,
      imageUrl: item.image_url,
      description: item.description,
      category: item.category,
      creator: {
        name: item.creator_name,
        avatarUrl: item.creator_avatar_url
      },
      edition: item.edition_total ? {
        current: item.edition_current || item.sold_count,
        total: item.edition_total
      } : undefined,
      status: item.status,
      quantity: item.quantity,
      soldCount: item.sold_count
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace items' });
  }
});

// Get single marketplace item by ID
router.get('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db('marketplace_items').where({ id }).first();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Format item to match frontend MarketplaceItem interface
    const formattedItem = {
      id: item.id,
      name: item.name,
      type: item.type,
      price: item.price,
      imageUrl: item.image_url,
      description: item.description,
      category: item.category,
      creator: {
        name: item.creator_name,
        avatarUrl: item.creator_avatar_url
      },
      edition: item.edition_total ? {
        current: item.edition_current || item.sold_count,
        total: item.edition_total
      } : undefined,
      status: item.status,
      quantity: item.quantity,
      soldCount: item.sold_count
    };

    res.json(formattedItem);
  } catch (error) {
    console.error('Error fetching marketplace item:', error);
    res.status(500).json({ error: 'Failed to fetch marketplace item' });
  }
});

// Create a new marketplace item
router.post('/items', async (req, res) => {
  try {
    const {
      name,
      type,
      price,
      description,
      imageUrl,
      sellerId,
      category,
      quantity,
      creatorName,
      creatorAvatarUrl,
      editionTotal
    } = req.body;

    // Validate required fields
    if (!name || !type || !price || !sellerId) {
      return res.status(400).json({ error: 'Missing required fields: name, type, price, sellerId' });
    }

    // Validate type
    if (!['NFT', 'Ticket', 'Merch'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be NFT, Ticket, or Merch' });
    }

    // Validate price
    if (price <= 0) {
      return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    const itemId = uuidv4();
    const newItem = {
      id: itemId,
      seller_id: sellerId,
      name,
      type,
      price,
      description: description || null,
      image_url: imageUrl || null,
      category: category || null,
      quantity: quantity || 1,
      sold_count: 0,
      status: 'active',
      creator_name: creatorName || 'Unknown',
      creator_avatar_url: creatorAvatarUrl || null,
      edition_current: 0,
      edition_total: editionTotal || null
    };

    await db('marketplace_items').insert(newItem);

    // Return formatted item
    const formattedItem = {
      id: newItem.id,
      name: newItem.name,
      type: newItem.type,
      price: newItem.price,
      imageUrl: newItem.image_url,
      description: newItem.description,
      category: newItem.category,
      creator: {
        name: newItem.creator_name,
        avatarUrl: newItem.creator_avatar_url
      },
      edition: newItem.edition_total ? {
        current: newItem.edition_current,
        total: newItem.edition_total
      } : undefined,
      status: newItem.status,
      quantity: newItem.quantity,
      soldCount: newItem.sold_count
    };

    res.status(201).json(formattedItem);
  } catch (error) {
    console.error('Error creating marketplace item:', error);
    res.status(500).json({ error: 'Failed to create marketplace item' });
  }
});

// Purchase an item - RESTful route (matches frontend expectation)
router.post('/items/:itemId/purchase', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { buyerId, quantity } = req.body;

    // Validate required fields
    if (!itemId || !buyerId || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: itemId, buyerId, quantity' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Execute entire purchase within a database transaction
    // This prevents race conditions by locking rows during the transaction
    const result = await db.transaction(async (trx) => {
      // 1. Lock and fetch marketplace item (prevents concurrent purchases)
      const item = await trx('marketplace_items')
        .where({ id: itemId })
        .forUpdate() // Pessimistic lock - blocks other transactions from reading this row
        .first();

      if (!item) {
        throw new Error('Item not found');
      }

      if (item.status !== 'active') {
        throw new Error('Item is not available for purchase');
      }

      // 2. Check available quantity (safely locked)
      const availableQuantity = item.quantity - item.sold_count;
      if (availableQuantity < quantity) {
        throw new Error(`Insufficient quantity available. Available: ${availableQuantity}, Requested: ${quantity}`);
      }

      const totalCost = item.price * quantity;

      // 3. Lock and fetch buyer balance (prevents concurrent spending)
      const buyer = await trx('user_balances')
        .where({ user_id: buyerId })
        .forUpdate() // Pessimistic lock
        .first();

      if (!buyer) {
        throw new Error('Buyer not found');
      }

      // 4. Validate buyer balance (safely locked)
      if (buyer.soda_balance < totalCost) {
        throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${buyer.soda_balance}`);
      }

      // 5. Deduct from buyer balance
      await trx('user_balances')
        .where({ user_id: buyerId })
        .update({
          soda_balance: buyer.soda_balance - totalCost,
          version: buyer.version + 1,
          updated_at: new Date().toISOString()
        });

      // 6. Lock and credit seller balance
      const seller = await trx('user_balances')
        .where({ user_id: item.seller_id })
        .forUpdate() // Pessimistic lock
        .first();

      if (seller) {
        await trx('user_balances')
          .where({ user_id: item.seller_id })
          .update({
            soda_balance: seller.soda_balance + totalCost,
            version: seller.version + 1,
            updated_at: new Date().toISOString()
          });
      } else {
        // Create new seller account if doesn't exist
        await trx('user_balances').insert({
          user_id: item.seller_id,
          soda_balance: totalCost,
          bubble_score: 0,
          version: 1
        });
      }

      // 7. Update item sold count and status
      const newSoldCount = item.sold_count + quantity;
      const newStatus = newSoldCount >= item.quantity ? 'sold_out' : 'active';

      await trx('marketplace_items')
        .where({ id: itemId })
        .update({
          sold_count: newSoldCount,
          edition_current: newSoldCount,
          status: newStatus,
          updated_at: new Date().toISOString()
        });

      // 8. Record transaction
      const txId = uuidv4();
      await trx('token_transactions').insert({
        id: txId,
        from_user: buyerId,
        to_user: item.seller_id,
        amount: totalCost,
        transaction_type: 'marketplace_purchase',
        reference_id: itemId,
        memo: `Marketplace purchase: ${item.name} (x${quantity})`,
        status: 'completed'
      });

      // 9. Record purchase
      const purchaseId = uuidv4();
      await trx('marketplace_purchases').insert({
        id: purchaseId,
        item_id: itemId,
        buyer_id: buyerId,
        seller_id: item.seller_id,
        price: item.price,
        quantity,
        total_cost: totalCost,
        transaction_id: txId
      });

      // Return data for response
      return {
        purchaseId,
        itemName: item.name,
        sellerId: item.seller_id,
        price: item.price,
        quantity,
        totalCost,
        txId,
        newStatus,
        newBuyerBalance: buyer.soda_balance - totalCost
      };
    });

    // Transaction committed successfully
    res.json({
      success: true,
      purchase: {
        id: result.purchaseId,
        itemId,
        itemName: result.itemName,
        buyer: buyerId,
        seller: result.sellerId,
        price: result.price,
        quantity: result.quantity,
        totalCost: result.totalCost,
        transactionId: result.txId,
        timestamp: new Date().toISOString()
      },
      newBalance: result.newBuyerBalance,
      itemStatus: result.newStatus
    });
  } catch (error) {
    console.error('Error purchasing item:', error);

    // Return appropriate error message
    if (error instanceof Error) {
      // Business logic errors (insufficient balance, item not found, etc.)
      res.status(400).json({ error: error.message });
    } else {
      // Unexpected errors
      res.status(500).json({ error: 'Failed to purchase item' });
    }
  }
});

// Purchase an item (with transaction-based race condition prevention)
// LEGACY ENDPOINT - kept for backward compatibility
router.post('/purchase', async (req, res) => {
  try {
    const { itemId, buyerId, quantity } = req.body;

    // Validate required fields
    if (!itemId || !buyerId || !quantity) {
      return res.status(400).json({ error: 'Missing required fields: itemId, buyerId, quantity' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Execute entire purchase within a database transaction
    // This prevents race conditions by locking rows during the transaction
    const result = await db.transaction(async (trx) => {
      // 1. Lock and fetch marketplace item (prevents concurrent purchases)
      const item = await trx('marketplace_items')
        .where({ id: itemId })
        .forUpdate() // Pessimistic lock - blocks other transactions from reading this row
        .first();

      if (!item) {
        throw new Error('Item not found');
      }

      if (item.status !== 'active') {
        throw new Error('Item is not available for purchase');
      }

      // 2. Check available quantity (safely locked)
      const availableQuantity = item.quantity - item.sold_count;
      if (availableQuantity < quantity) {
        throw new Error(`Insufficient quantity available. Available: ${availableQuantity}, Requested: ${quantity}`);
      }

      const totalCost = item.price * quantity;

      // 3. Lock and fetch buyer balance (prevents concurrent spending)
      const buyer = await trx('user_balances')
        .where({ user_id: buyerId })
        .forUpdate() // Pessimistic lock
        .first();

      if (!buyer) {
        throw new Error('Buyer not found');
      }

      // 4. Validate buyer balance (safely locked)
      if (buyer.soda_balance < totalCost) {
        throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${buyer.soda_balance}`);
      }

      // 5. Deduct from buyer balance
      await trx('user_balances')
        .where({ user_id: buyerId })
        .update({
          soda_balance: buyer.soda_balance - totalCost,
          version: buyer.version + 1,
          updated_at: new Date().toISOString()
        });

      // 6. Lock and credit seller balance
      const seller = await trx('user_balances')
        .where({ user_id: item.seller_id })
        .forUpdate() // Pessimistic lock
        .first();

      if (seller) {
        await trx('user_balances')
          .where({ user_id: item.seller_id })
          .update({
            soda_balance: seller.soda_balance + totalCost,
            version: seller.version + 1,
            updated_at: new Date().toISOString()
          });
      } else {
        // Create new seller account if doesn't exist
        await trx('user_balances').insert({
          user_id: item.seller_id,
          soda_balance: totalCost,
          bubble_score: 0,
          version: 1
        });
      }

      // 7. Update item sold count and status
      const newSoldCount = item.sold_count + quantity;
      const newStatus = newSoldCount >= item.quantity ? 'sold_out' : 'active';

      await trx('marketplace_items')
        .where({ id: itemId })
        .update({
          sold_count: newSoldCount,
          edition_current: newSoldCount,
          status: newStatus,
          updated_at: new Date().toISOString()
        });

      // 8. Record transaction
      const txId = uuidv4();
      await trx('token_transactions').insert({
        id: txId,
        from_user: buyerId,
        to_user: item.seller_id,
        amount: totalCost,
        transaction_type: 'marketplace_purchase',
        reference_id: itemId,
        memo: `Marketplace purchase: ${item.name} (x${quantity})`,
        status: 'completed'
      });

      // 9. Record purchase
      const purchaseId = uuidv4();
      await trx('marketplace_purchases').insert({
        id: purchaseId,
        item_id: itemId,
        buyer_id: buyerId,
        seller_id: item.seller_id,
        price: item.price,
        quantity,
        total_cost: totalCost,
        transaction_id: txId
      });

      // Return data for response
      return {
        purchaseId,
        itemName: item.name,
        sellerId: item.seller_id,
        price: item.price,
        quantity,
        totalCost,
        txId,
        newStatus,
        newBuyerBalance: buyer.soda_balance - totalCost
      };
    });

    // Transaction committed successfully
    res.json({
      success: true,
      purchase: {
        id: result.purchaseId,
        itemId,
        itemName: result.itemName,
        buyer: buyerId,
        seller: result.sellerId,
        price: result.price,
        quantity: result.quantity,
        totalCost: result.totalCost,
        transactionId: result.txId,
        timestamp: new Date().toISOString()
      },
      newBalance: result.newBuyerBalance,
      itemStatus: result.newStatus
    });
  } catch (error) {
    console.error('Error purchasing item:', error);

    // Return appropriate error message
    if (error instanceof Error) {
      // Business logic errors (insufficient balance, item not found, etc.)
      res.status(400).json({ error: error.message });
    } else {
      // Unexpected errors
      res.status(500).json({ error: 'Failed to purchase item' });
    }
  }
});

// Get user's purchased items
router.get('/purchases/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const purchases = await db('marketplace_purchases')
      .join('marketplace_items', 'marketplace_purchases.item_id', 'marketplace_items.id')
      .where('marketplace_purchases.buyer_id', userId)
      .select(
        'marketplace_purchases.*',
        'marketplace_items.name as item_name',
        'marketplace_items.type as item_type',
        'marketplace_items.image_url',
        'marketplace_items.category',
        'marketplace_items.creator_name',
        'marketplace_items.creator_avatar_url'
      )
      .orderBy('marketplace_purchases.purchased_at', 'desc')
      .limit(limit);

    // Format purchases with item details
    const formattedPurchases = purchases.map(purchase => ({
      id: purchase.id,
      purchasedAt: purchase.purchased_at,
      totalCost: purchase.total_cost,
      quantity: purchase.quantity,
      item: {
        id: purchase.item_id,
        name: purchase.item_name,
        type: purchase.item_type,
        imageUrl: purchase.image_url,
        category: purchase.category,
        creator: {
          name: purchase.creator_name,
          avatarUrl: purchase.creator_avatar_url
        }
      }
    }));

    res.json(formattedPurchases);
  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ error: 'Failed to fetch user purchases' });
  }
});

// Get user's listed items (items they're selling)
router.get('/listings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const items = await db('marketplace_items')
      .where({ seller_id: userId })
      .orderBy('created_at', 'desc');

    // Format items
    const formattedItems = items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      price: item.price,
      imageUrl: item.image_url,
      description: item.description,
      category: item.category,
      creator: {
        name: item.creator_name,
        avatarUrl: item.creator_avatar_url
      },
      edition: item.edition_total ? {
        current: item.edition_current || item.sold_count,
        total: item.edition_total
      } : undefined,
      status: item.status,
      quantity: item.quantity,
      soldCount: item.sold_count
    }));

    res.json(formattedItems);
  } catch (error) {
    console.error('Error fetching user listings:', error);
    res.status(500).json({ error: 'Failed to fetch user listings' });
  }
});

// Get wallet/user balance for marketplace
router.get('/balance/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;

    // Fetch user balance from user_balances table
    const balance = await db('user_balances')
      .where({ user_id: wallet })
      .first();

    if (!balance) {
      // Return 0 balance if user doesn't exist yet
      return res.json({
        userId: wallet,
        balance: 0,
        bubbleScore: 0
      });
    }

    res.json({
      userId: wallet,
      balance: balance.soda_balance,
      bubbleScore: balance.bubble_score
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
});

// Get purchase history for wallet - ALIAS for /purchases/:userId
router.get('/history/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const purchases = await db('marketplace_purchases')
      .join('marketplace_items', 'marketplace_purchases.item_id', 'marketplace_items.id')
      .where('marketplace_purchases.buyer_id', wallet)
      .select(
        'marketplace_purchases.*',
        'marketplace_items.name as item_name',
        'marketplace_items.type as item_type',
        'marketplace_items.image_url',
        'marketplace_items.category',
        'marketplace_items.creator_name',
        'marketplace_items.creator_avatar_url'
      )
      .orderBy('marketplace_purchases.purchased_at', 'desc')
      .limit(limit);

    // Format purchases with item details
    const formattedPurchases = purchases.map(purchase => ({
      id: purchase.id,
      purchasedAt: purchase.purchased_at,
      totalCost: purchase.total_cost,
      quantity: purchase.quantity,
      item: {
        id: purchase.item_id,
        name: purchase.item_name,
        type: purchase.item_type,
        imageUrl: purchase.image_url,
        category: purchase.category,
        creator: {
          name: purchase.creator_name,
          avatarUrl: purchase.creator_avatar_url
        }
      }
    }));

    res.json(formattedPurchases);
  } catch (error) {
    console.error('Error fetching purchase history:', error);
    res.status(500).json({ error: 'Failed to fetch purchase history' });
  }
});

export default router;
