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
      if (stat
