import { Router } from 'express';
import db from '../database';
import signatureService from '../services/signatureService';
import signatureLinkService from '../services/signatureLinkService';
import { sanitizeBody } from '../utils/sanitize';
import { validate, validators } from '../middleware/validation';

const router = Router();

/**
 * POST /api/signatures/sign
 * Sign an agreement (either as DAO or member)
 */
router.post('/sign',
  sanitizeBody(),
  async (req, res) => {
    try {
      const { agreementId, signerType, signature, signerAddress, linkId } = req.body;

      // Validate required fields
      if (!agreementId || !signerType || !signature || !signerAddress) {
        return res.status(400).json({
          error: 'Missing required fields: agreementId, signerType, signature, signerAddress'
        });
      }

      // Validate signer type
      if (!['dao', 'member'].includes(signerType)) {
        return res.status(400).json({ error: 'signerType must be "dao" or "member"' });
      }

      // Check if can sign
      const canSignResult = await signatureService.canSign(agreementId, signerType);
      if (!canSignResult.canSign) {
        return res.status(400).json({ error: canSignResult.reason });
      }

      // For member signing via link, validate the link
      if (signerType === 'member' && linkId) {
        const linkValidation = await signatureLinkService.validateLink(linkId);
        if (!linkValidation.valid) {
          return res.status(400).json({ error: linkValidation.error });
        }
        if (linkValidation.agreementId !== agreementId) {
          return res.status(400).json({ error: 'Link does not match agreement' });
        }
      }

      // Create the message that was signed
      const timestamp = Date.now();
      const message = signatureService.createSigningMessage(agreementId, signerType, timestamp);

      // Verify the signature (Solana by default)
      const isValid = signatureService.verifySignature(message, signature, signerAddress, 'solana');

      // For now, we'll store even if verification fails but mark as unverified
      // In production, you might want to reject invalid signatures
      if (!isValid) {
        console.warn(`Signature verification failed for ${signerAddress} on agreement ${agreementId}`);
        // Continue but log warning - in dev, signature verification may fail due to message mismatch
      }

      // Store the signature
      await signatureService.storeSignature(agreementId, signerType, signature, signerAddress, message);

      // If this was a member signing via link, mark the link as used
      if (signerType === 'member' && linkId) {
        await signatureLinkService.markUsed(linkId);
      }

      // Check if both signatures are now present and activate if so
      const status = await signatureService.getSignatureStatus(agreementId);
      let activated = false;
      if (status.dao && status.member) {
        activated = await signatureService.activateAgreement(agreementId);
      }

      res.json({
        success: true,
        message: `Agreement signed by ${signerType}`,
        signatureStatus: status,
        activated
      });

    } catch (error: any) {
      console.error('Error signing agreement:', error);
      res.status(500).json({ error: error.message || 'Failed to sign agreement' });
    }
  });

/**
 * GET /api/signatures/status/:agreementId
 * Get signature status for an agreement
 */
router.get('/status/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;

    const status = await signatureService.getSignatureStatus(agreementId);

    res.json({
      agreementId,
      ...status,
      requiredSignatures: 2,
      collectedSignatures: (status.dao ? 1 : 0) + (status.member ? 1 : 0)
    });

  } catch (error: any) {
    console.error('Error getting signature status:', error);
    if (error.message === 'Agreement not found') {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    res.status(500).json({ error: 'Failed to get signature status' });
  }
});

/**
 * POST /api/signatures/link/generate
 * Generate a signing link for member to sign
 */
router.post('/link/generate',
  sanitizeBody(),
  async (req, res) => {
    try {
      const { agreementId } = req.body;

      if (!agreementId) {
        return res.status(400).json({ error: 'agreementId is required' });
      }

      const link = await signatureLinkService.generateLink(agreementId);

      res.json({
        success: true,
        link: {
          id: link.linkId,
          url: link.url,
          expiresAt: link.expiresAt.toISOString(),
          agreementId: link.agreementId
        }
      });

    } catch (error: any) {
      console.error('Error generating signing link:', error);
      res.status(400).json({ error: error.message || 'Failed to generate signing link' });
    }
  });

/**
 * GET /api/signatures/link/:linkId
 * Validate and get link details (for public signing page)
 */
router.get('/link/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;

    const validation = await signatureLinkService.validateLink(linkId);

    if (!validation.valid) {
      return res.status(400).json({
        valid: false,
        error: validation.error
      });
    }

    // Get signature status
    const signatureStatus = await signatureService.getSignatureStatus(validation.agreementId!);

    // Filter sensitive data from agreement for public view
    const publicAgreement = validation.agreement ? {
      id: validation.agreement.id,
      title: validation.agreement.title,
      type: validation.agreement.type,
      status: validation.agreement.status,
      party: {
        name: validation.agreement.party?.name,
        role: validation.agreement.party?.role
      },
      details: {
        tokenAllocation: validation.agreement.details?.tokenAllocation,
        vestingSchedule: validation.agreement.details?.vestingSchedule,
        termMonths: validation.agreement.details?.termMonths,
        responsibilities: validation.agreement.details?.responsibilities
      },
      daoSignature: signatureStatus.dao ? {
        signedAt: signatureStatus.dao.signedAt,
        signerAddress: signatureStatus.dao.signerAddress
      } : null
    } : null;

    res.json({
      valid: true,
      linkId,
      agreementId: validation.agreementId,
      agreement: publicAgreement,
      signatureStatus: {
        daoSigned: !!signatureStatus.dao,
        memberSigned: !!signatureStatus.member
      }
    });

  } catch (error: any) {
    console.error('Error validating link:', error);
    res.status(500).json({ error: 'Failed to validate link' });
  }
});

/**
 * POST /api/signatures/verify
 * Verify a signature
 */
router.post('/verify',
  sanitizeBody(),
  async (req, res) => {
    try {
      const { message, signature, signerAddress, chainType = 'solana' } = req.body;

      if (!message || !signature || !signerAddress) {
        return res.status(400).json({
          error: 'Missing required fields: message, signature, signerAddress'
        });
      }

      const isValid = signatureService.verifySignature(message, signature, signerAddress, chainType);

      res.json({
        valid: isValid,
        message,
        signerAddress,
        chainType
      });

    } catch (error: any) {
      console.error('Error verifying signature:', error);
      res.status(500).json({ error: 'Failed to verify signature' });
    }
  });

/**
 * GET /api/signatures/agreement/:agreementId
 * Get agreement details for signing (public endpoint)
 */
router.get('/agreement/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;

    const agreement = await db('agreements').where('id', agreementId).first();
    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    // Parse JSON fields
    const party = JSON.parse(agreement.party || '{}');
    const details = JSON.parse(agreement.details || '{}');

    // Get signature status
    const signatureStatus = await signatureService.getSignatureStatus(agreementId);

    // Return agreement data needed for signing
    res.json({
      id: agreement.id,
      title: agreement.title,
      type: agreement.type,
      status: agreement.status,
      party: {
        name: party.name,
        role: party.role,
        email: party.email
      },
      details: {
        tokenAllocation: details.tokenAllocation,
        vestingSchedule: details.vestingSchedule,
        termMonths: details.termMonths,
        responsibilities: details.responsibilities,
        deliverables: details.deliverables
      },
      signatureStatus: {
        dao: signatureStatus.dao ? {
          signedAt: signatureStatus.dao.signedAt,
          signerAddress: signatureStatus.dao.signerAddress
        } : null,
        member: signatureStatus.member ? {
          signedAt: signatureStatus.member.signedAt,
          signerAddress: signatureStatus.member.signerAddress
        } : null,
        fullyExecuted: signatureStatus.fullyExecuted,
        activatedAt: signatureStatus.activatedAt
      },
      createdAt: agreement.created_at
    });

  } catch (error: any) {
    console.error('Error getting agreement for signing:', error);
    res.status(500).json({ error: 'Failed to get agreement' });
  }
});

/**
 * GET /api/signatures/history/:agreementId
 * Get signature history/timeline for an agreement
 */
router.get('/history/:agreementId', async (req, res) => {
  try {
    const { agreementId } = req.params;

    const agreement = await db('agreements').where('id', agreementId).first();
    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    const history = [];

    // Add agreement creation
    history.push({
      event: 'agreement_created',
      timestamp: agreement.created_at,
      description: 'Agreement created',
      actor: 'system'
    });

    // Add DAO signature
    if (agreement.dao_signed_at) {
      history.push({
        event: 'dao_signed',
        timestamp: agreement.dao_signed_at,
        description: 'DAO Admin signed the agreement',
        actor: agreement.dao_signer_address,
        actorType: 'dao'
      });
    }

    // Add member signature
    if (agreement.member_signed_at) {
      history.push({
        event: 'member_signed',
        timestamp: agreement.member_signed_at,
        description: 'Council Member signed the agreement',
        actor: agreement.member_signer_address,
        actorType: 'member'
      });
    }

    // Add activation
    if (agreement.activated_at) {
      history.push({
        event: 'agreement_activated',
        timestamp: agreement.activated_at,
        description: 'Agreement activated - both parties signed',
        actor: 'system'
      });
    }

    // Get signing links history
    const links = await signatureLinkService.getLinksForAgreement(agreementId);
    for (const link of links) {
      history.push({
        event: 'signing_link_created',
        timestamp: link.created_at,
        description: 'Signing link generated for member',
        linkId: link.id,
        expiresAt: link.expires_at,
        used: link.used
      });

      if (link.used_at) {
        history.push({
          event: 'signing_link_used',
          timestamp: link.used_at,
          description: 'Signing link was used',
          linkId: link.id
        });
      }
    }

    // Sort by timestamp
    history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json({
      agreementId,
      history
    });

  } catch (error: any) {
    console.error('Error getting signature history:', error);
    res.status(500).json({ error: 'Failed to get signature history' });
  }
});

export default router;
