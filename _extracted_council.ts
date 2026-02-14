import { Router } from 'express';
import db from '../database';
import logger from '../utils/logger';

const router = Router();

/**
 * Council API Endpoint
 * Provides council member data grouped by role type with statistics
 */

// Type definitions
interface CouncilMember {
  id: number;
  dao_id: number;
  agreement_id: number | null;
  name: string;
  surname: string;
  email: string;
  phone: string | null;
  wallet_address: string;
  photo_url: string | null;
  role_type: 'founder' | 'advisor' | 'contributor' | 'firstborn';
  role_category: string | null;
  custom_role_description: string | null;
  token_allocation_total: number;
  firestarter_period_months: number | null;
  term_months: number | null;
  status: 'draft' | 'pending_signature' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  completed_at: string | null;
  // Joined fields
  agreement_title?: string;
  agreement_status?: string;
  milestones_completed?: number;
  milestones_total?: number;
}

interface RoleStats {
  count: number;
  max?: number;
  tokens: number;
}

interface CouncilStats {
  founders: RoleStats;
  advisors: RoleStats;
  contributors: RoleStats;
  firstborn: RoleStats;
}

interface CouncilResponse {
  success: boolean;
  data: {
    founders: CouncilMember[];
    advisors: CouncilMember[];
    contributors: CouncilMember[];
    firstborn: CouncilMember[];
  };
  stats: CouncilStats;
}

// GET /api/council
// Get all council members grouped by role
router.get('/', async (req, res) => {
  try {
    const { dao_id, status, role_type } = req.query;

    // Build query
    let query = db('council_members')
      .select(
        'council_members.*',
        'agreements.title as agreement_title',
        'agreements.status as agreement_status'
      )
      .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id');

    // Apply filters
    if (dao_id) {
      query = query.where('council_members.dao_id', dao_id);
    }

    if (status) {
      query = query.where('council_members.status', status);
    }

    if (role_type) {
      query = query.where('council_members.role_type', role_type);
    }

    // Exclude cancelled members by default
    query = query.whereNot('council_members.status', 'cancelled');

    const members = await query.orderBy('council_members.created_at', 'desc');

    // Get milestone counts for each member
    const memberIds = members.map((m: CouncilMember) => m.id);

    let milestoneCounts: any[] = [];
    if (memberIds.length > 0) {
      milestoneCounts = await db('milestones')
        .whereIn('council_member_id', memberIds)
        .select('council_member_id')
        .count('* as total')
        .sum(db.raw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END as completed"))
        .groupBy('council_member_id');
    }

    // Create milestone loo
