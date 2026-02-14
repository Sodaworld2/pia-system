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

    // Create milestone lookup
    const milestoneLookup = milestoneCounts.reduce((acc: any, m: any) => {
      acc[m.council_member_id] = {
        total: Number(m.total) || 0,
        completed: Number(m.completed) || 0
      };
      return acc;
    }, {});

    // Add milestone counts to members
    const membersWithMilestones = members.map((member: CouncilMember) => ({
      ...member,
      milestones_completed: milestoneLookup[member.id]?.completed || 0,
      milestones_total: milestoneLookup[member.id]?.total || 0
    }));

    // Group by role type
    const grouped = {
      founders: membersWithMilestones.filter((m: CouncilMember) => m.role_type === 'founder'),
      advisors: membersWithMilestones.filter((m: CouncilMember) => m.role_type === 'advisor'),
      contributors: membersWithMilestones.filter((m: CouncilMember) => m.role_type === 'contributor'),
      firstborn: membersWithMilestones.filter((m: CouncilMember) => m.role_type === 'firstborn')
    };

    // Calculate stats
    const calculateStats = (members: CouncilMember[]): RoleStats => ({
      count: members.length,
      tokens: members.reduce((sum, m) => sum + (Number(m.token_allocation_total) || 0), 0)
    });

    const stats: CouncilStats = {
      founders: { ...calculateStats(grouped.founders), max: 7 },
      advisors: calculateStats(grouped.advisors),
      contributors: calculateStats(grouped.contributors),
      firstborn: calculateStats(grouped.firstborn)
    };

    const response: CouncilResponse = {
      success: true,
      data: grouped,
      stats
    };

    res.json(response);

  } catch (error) {
    logger.error('Error fetching council members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch council members',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/council/stats
// Get summary statistics only
router.get('/stats', async (req, res) => {
  try {
    const { dao_id } = req.query;

    let query = db('council_members')
      .select('role_type')
      .count('* as count')
      .sum('token_allocation_total as total_tokens')
      .whereNot('status', 'cancelled')
      .groupBy('role_type');

    if (dao_id) {
      query = query.where('dao_id', dao_id);
    }

    const rawStats = await query;

    // Transform to structured format
    const stats: CouncilStats = {
      founders: { count: 0, max: 7, tokens: 0 },
      advisors: { count: 0, tokens: 0 },
      contributors: { count: 0, tokens: 0 },
      firstborn: { count: 0, tokens: 0 }
    };

    rawStats.forEach((row: any) => {
      const roleType = row.role_type as keyof CouncilStats;
      if (stats[roleType]) {
        stats[roleType].count = Number(row.count) || 0;
        stats[roleType].tokens = Number(row.total_tokens) || 0;
      }
    });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Error fetching council stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch council statistics',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/council/by-wallet/:walletAddress
// Get council member by wallet address
router.get('/by-wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;

  try {
    const member = await db('council_members')
      .where('council_members.wallet_address', walletAddress)
      .whereNot('council_members.status', 'cancelled')
      .select(
        'council_members.*',
        'agreements.title as agreement_title',
        'agreements.status as agreement_status'
      )
      .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id')
      .first();

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'No council member found for this wallet address',
        code: 'NOT_FOUND'
      });
    }

    // Get milestones for this member
    const milestones = await db('milestones')
      .where('council_member_id', member.id)
      .select('*');

    const milestonesCompleted = milestones.filter((m: any) => m.status === 'completed').length;

    res.json({
      success: true,
      data: {
        ...member,
        milestones_completed: milestonesCompleted,
        milestones_total: milestones.length
      }
    });

  } catch (error) {
    logger.error('Error fetching council member by wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch council member',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/council/:id
// Get single member details
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const member = await db('council_members')
      .where('council_members.id', id)
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

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Council member not found',
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

    // Get signatures if agreement exists
    let signatures: any[] = [];
    if (member.agreement_id) {
      signatures = await db('agreement_signatures')
        .where('agreement_id', member.agreement_id)
        .orderBy('signed_at', 'desc');
    }

    // Get workflow history
    let workflowHistory: any[] = [];
    if (member.agreement_id) {
      workflowHistory = await db('agreement_workflow_log')
        .where('council_member_id', id)
        .orderBy('created_at', 'desc')
        .limit(20);
    }

    // Parse agreement details if exists
    let agreementDetails = null;
    if (member.agreement_details) {
      try {
        agreementDetails = JSON.parse(member.agreement_details);
      } catch (e) {
        logger.warn(`Failed to parse agreement details for member ${id}`);
      }
    }

    res.json({
      success: true,
      data: {
        ...member,
        agreement_details: agreementDetails,
        milestones,
        contracts,
        signatures: signatures.map((s: any) => ({
          id: s.id,
          address: s.signer_address,
          signedAt: s.signed_at,
          verified: s.verified
        })),
        workflow_history: workflowHistory.map((w: any) => ({
          from_status: w.from_status,
          to_status: w.to_status,
          reason: w.transition_reason,
          changed_by: w.changed_by,
          created_at: w.created_at
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching council member:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch council member',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/council/role/:roleType
// Get members by role type
router.get('/role/:roleType', async (req, res) => {
  const { roleType } = req.params;
  const { dao_id, status } = req.query;

  // Validate role type
  const validRoles = ['founder', 'advisor', 'contributor', 'firstborn'];
  if (!validRoles.includes(roleType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid role type. Must be one of: ${validRoles.join(', ')}`,
      code: 'INVALID_ROLE_TYPE'
    });
  }

  try {
    let query = db('council_members')
      .where('role_type', roleType)
      .whereNot('status', 'cancelled')
      .select(
        'council_members.*',
        'agreements.title as agreement_title',
        'agreements.status as agreement_status'
      )
      .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id');

    if (dao_id) {
      query = query.where('council_members.dao_id', dao_id);
    }

    if (status) {
      query = query.where('council_members.status', status);
    }

    const members = await query.orderBy('council_members.created_at', 'desc');

    // Calculate stats for this role
    const stats: RoleStats = {
      count: members.length,
      tokens: members.reduce((sum: number, m: any) => sum + (Number(m.token_allocation_total) || 0), 0)
    };

    // Add max for founders
    if (roleType === 'founder') {
      stats.max = 7;
    }

    res.json({
      success: true,
      data: members,
      stats
    });

  } catch (error) {
    logger.error(`Error fetching ${roleType} members:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch ${roleType} members`,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// ============================================
// SODAWORLD INTEGRATION ENDPOINTS
// ============================================

// GET /api/council/by-sodaworld/:sodaworldUserId
// Get council member by SodaWorld user ID
router.get('/by-sodaworld/:sodaworldUserId', async (req, res) => {
  const { sodaworldUserId } = req.params;

  try {
    const member = await db('council_members')
      .where('council_members.sodaworld_user_id', sodaworldUserId)
      .whereNot('council_members.status', 'cancelled')
      .select(
        'council_members.*',
        'agreements.title as agreement_title',
        'agreements.status as agreement_status'
      )
      .leftJoin('agreements', 'council_members.agreement_id', 'agreements.id')
      .first();

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'No council member found for this SodaWorld user ID',
        code: 'NOT_FOUND'
      });
    }

    // Get milestones for this member
    const milestones = await db('milestones')
      .where('council_member_id', member.id)
      .select('*');

    const milestonesCompleted = milestones.filter((m: any) => m.status === 'completed').length;

    // Get vesting schedule
    const vestingSchedule = await db('vesting_schedules')
      .where('user_id', sodaworldUserId)
      .first();

    res.json({
      success: true,
      data: {
        ...member,
        milestones_completed: milestonesCompleted,
        milestones_total: milestones.length,
        vesting: vestingSchedule ? {
          totalTokens: vestingSchedule.total_tokens,
          claimedTokens: vestingSchedule.claimed_tokens,
          startDate: vestingSchedule.start_date,
          cliffDate: vestingSchedule.cliff_date,
          endDate: vestingSchedule.end_date,
        } : null
      }
    });

  } catch (error) {
    logger.error('Error fetching council member by SodaWorld ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch council member',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// POST /api/council/:id/link-sodaworld
// Link a council member to a SodaWorld user account
router.post('/:id/link-sodaworld', async (req, res) => {
  const { id } = req.params;
  const { sodaworldUserId } = req.body;

  if (!sodaworldUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: sodaworldUserId',
      code: 'VALIDATION_ERROR'
    });
  }

  try {
    // Check if member exists
    const member = await db('council_members').where('id', id).first();
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Council member not found',
        code: 'NOT_FOUND'
      });
    }

    // Check if sodaworld_user_id is already in use
    const existing = await db('council_members')
      .where('sodaworld_user_id', sodaworldUserId)
      .whereNot('id', id)
      .first();

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'This SodaWorld user is already linked to another council member',
        code: 'CONFLICT'
      });
    }

    // Update member with SodaWorld user ID
    await db('council_members')
      .where('id', id)
      .update({
        sodaworld_user_id: sodaworldUserId,
        updated_at: new Date().toISOString()
      });

    // Also update vesting schedules to use sodaworld_user_id
    if (member.wallet_address) {
      await db('vesting_schedules')
        .where('user_id', member.wallet_address)
        .update({ user_id: sodaworldUserId });
    }

    logger.info(`Linked council member ${id} to SodaWorld user ${sodaworldUserId}`);

    res.json({
      success: true,
      message: 'Council member linked to SodaWorld account',
      data: {
        councilMemberId: id,
        sodaworldUserId: sodaworldUserId
      }
    });

  } catch (error) {
    logger.error('Error linking SodaWorld user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link SodaWorld user',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/council/unlinked
// Get all council members not yet linked to SodaWorld
router.get('/unlinked', async (req, res) => {
  try {
    const unlinkedMembers = await db('council_members')
      .whereNull('sodaworld_user_id')
      .whereNot('status', 'cancelled')
      .select('id', 'name', 'surname', 'email', 'role_type', 'status', 'token_allocation_total');

    res.json({
      success: true,
      data: unlinkedMembers,
      count: unlinkedMembers.length
    });

  } catch (error) {
    logger.error('Error fetching unlinked members:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unlinked members',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
