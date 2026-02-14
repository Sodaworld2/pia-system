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

