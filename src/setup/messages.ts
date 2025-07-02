/**
 * OpenMsg Message Routes
 * 
 * This module handles encrypted message receiving and verification for the
 * OpenMsg protocol. It implements secure message delivery with integrity
 * checking, replay attack prevention, and cross-domain authentication.
 * 
 * Message Flow:
 * 1. Sender encrypts message with connection's encryption key
 * 2. Sender creates verification hash with auth code and timestamp
 * 3. Sender posts encrypted package to recipient's server
 * 4. Recipient's server validates hash and decrypts message
 * 5. Recipient's server confirms authenticity with sender's server
 * 6. Message is stored in recipient's inbox
 * 
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - SHA-256 hash verification with auth codes
 * - Timestamp-based replay attack prevention
 * - Cross-domain message confirmation
 * - Connection-based authorization
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/database';
import { createMessageHash, decryptMessagePackage } from '../utils/crypto';
import settings from '../config/settings';
import {
  MessageReceiveRequest,
  MessageReceiveResponse,
  MessageConfirmRequest,
  MessageConfirmResponse,
  OpenMsgUserConnection,
  OpenMsgMessageOutbox
} from '../type';
import { RowDataPacket } from 'mysql2';

const router = express.Router();

/**
 * POST /message/receive
 * 
 * Main endpoint for receiving encrypted messages from other OpenMsg servers.
 * This endpoint is called when another server wants to deliver a message
 * to a user on this server.
 * 
 * Security checks performed:
 * - Validates sender authorization (connection must exist)
 * - Verifies message hash to prevent tampering
 * - Checks timestamp to prevent replay attacks
 * - Confirms message authenticity with sending server
 * - Decrypts message with connection-specific key
 */
router.post('/receive', async (req: Request<{}, MessageReceiveResponse, MessageReceiveRequest>, res: Response<MessageReceiveResponse>) => {
  try {
    const {
      receiving_openmsg_address_id,
      ident_code,
      message_package,
      message_hash,
      message_salt,
      message_timestamp
    } = req.body;

    // Process the message receive request
    const result = await messageCheck(
      receiving_openmsg_address_id,
      ident_code,
      message_package,
      message_hash,
      message_salt,
      message_timestamp
    );

    res.json(result);
  } catch (error) {
    console.error('Message receive error:', error);
    res.json({
      error: true,
      response_code: 'SM_E000',
      error_message: 'Internal server error'
    });
  }
});

/**
 * POST /message/confirm
 * 
 * Message confirmation endpoint used to verify message authenticity.
 * Other OpenMsg servers call this to confirm that a message they received
 * actually originated from this server.
 * 
 * This prevents message spoofing attacks where malicious users claim
 * their messages came from a different domain.
 */
router.post('/confirm', async (req: Request<{}, MessageConfirmResponse, MessageConfirmRequest>, res: Response<MessageConfirmResponse>) => {
  try {
    const { message_hash, message_nonce } = req.body;
    const result = await messageConfirm(message_hash, message_nonce);
    res.json(result);
  } catch (error) {
    console.error('Message confirm error:', error);
    res.json({
      error: true,
      error_message: 'Internal server error'
    });
  }
});

/**
 * Process incoming encrypted message
 * 
 * This function implements the core message receiving logic with multiple
 * security layers:
 * 
 * 1. Data validation - ensures all required fields are present
 * 2. Connection verification - checks if sender is authorized
 * 3. Hash verification - prevents message tampering
 * 4. Timestamp checking - prevents replay attacks
 * 5. Cross-domain confirmation - verifies message origin
 * 6. Message decryption - decrypts with connection-specific key
 * 7. Database storage - saves decrypted message to inbox
 * 
 * @param receivingOpenmsgAddressId - Recipient's user ID on this server
 * @param identCode - Connection identity code for sender
 * @param messagePackage - Base64-encoded encrypted message package
 * @param messageHash - SHA-256 verification hash
 * @param messageSalt - Random salt used in hash calculation
 * @param messageTimestamp - Unix timestamp when message was created
 * @returns MessageReceiveResponse indicating success or specific error
 */
async function messageCheck(
  receivingOpenmsgAddressId: string,
  identCode: string,
  messagePackage: string,
  messageHash: string,
  messageSalt: string,
  messageTimestamp: number
): Promise<MessageReceiveResponse> {
  // Validate all required fields are present
  if (!receivingOpenmsgAddressId || !identCode || !messagePackage || !messageHash || !messageSalt || !messageTimestamp) {
    return {
      error: true,
      response_code: 'SM_E000',
      error_message: 'Missing data (wMv4J)'
    };
  }

  // Construct full OpenMsg address for the recipient
  const receivingOpenmsgAddress = `${receivingOpenmsgAddressId}*${settings.openmsgDomain}`;

  try {
    // Look up the connection between sender and recipient
    // This verifies that the sender is authorized to send messages
    const [connectionRows] = await pool.execute<(OpenMsgUserConnection & RowDataPacket)[]>(
      'SELECT auth_code, message_crypt_key, other_openmsg_address FROM openmsg_user_connections WHERE self_openmsg_address = ? AND ident_code = ?',
      [receivingOpenmsgAddress, identCode]
    );

    if (connectionRows.length === 0) {
      return {
        error: true,
        response_code: 'SM_E001',
        error_message: `Could not find user: ${receivingOpenmsgAddress} (rB6Xl)`
      };
    }

    const { auth_code, message_crypt_key, other_openmsg_address } = connectionRows[0]!;
    if (!auth_code || !message_crypt_key || !other_openmsg_address) {
      return {
        error: true,
        response_code: 'SM_E001',
        error_message: `Missing connection data for: ${receivingOpenmsgAddress} (rB6Xl)`
      };
    }

    // Parse sender's domain from their address
    const addressParts = other_openmsg_address.split('*');
    if (addressParts.length !== 2) {
      return {
        error: true,
        response_code: 'SM_E003',
        error_message: 'Invalid sending address format'
      };
    }

    const sendingDomain = addressParts[1];

    // Verify message hash to ensure message hasn't been tampered with
    // Hash combines: message package + auth code + salt + timestamp
    const expectedHash = createMessageHash(messagePackage, auth_code, messageSalt, messageTimestamp);
    if (messageHash !== expectedHash) {
      return {
        error: true,
        response_code: 'SM_E004',
        error_message: 'Authorization hash mismatch (4NxWV)'
      };
    }

    // Check timestamp to prevent replay attacks
    // Messages expire after 60 seconds
    const now = Math.floor(Date.now() / 1000);
    const expiry = 60; // seconds
    if ((messageTimestamp + expiry) < now) {
      return {
        error: true,
        response_code: 'SM_E005',
        error_message: 'Hash is too old (kmqVE)'
      };
    }

    // Extract nonce from the message package for confirmation
    // First 16 bytes of the decoded package contain the nonce
    const decodedPackage = Buffer.from(messagePackage, 'base64');
    const messageNonce = decodedPackage.slice(0, 16).toString('base64');

    // Confirm message authenticity with the sending server
    // This prevents spoofing attacks where someone claims a message came from another domain
    const confirmUrl = `https://${sendingDomain}/openmsg${settings.sandboxDir}/message/confirm`;
    const confirmPayload: MessageConfirmRequest = {
      message_hash: messageHash,
      message_nonce: messageNonce
    };

    let confirmResponse;
    try {
      confirmResponse = await axios.post<MessageConfirmResponse>(confirmUrl, confirmPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000  // 10 second timeout for cross-domain requests
      });
    } catch (err) {
      return {
        error: true,
        response_code: 'SM_E000',
        error_message: `Request failed: ${(err as Error).message} (vSiFb)`
      };
    }

    // Verify the confirmation response
    const response = confirmResponse.data;
    if (confirmResponse.status !== 200 || response.error || response.success !== true) {
      return {
        error: true,
        response_code: 'SM_E000',
        error_message: response.error_message || `Error confirming message from ${sendingDomain}`
      };
    }

    // Decrypt the message using the connection's encryption key
    const decryptedMessage = decryptMessagePackage(messagePackage, message_crypt_key);
    if (!decryptedMessage) {
      return {
        error: true,
        response_code: 'SM_E005',
        error_message: 'Invalid key or corrupt message (QctWn)'
      };
    }

    // Store the decrypted message in the recipient's inbox
    await pool.execute(
      'INSERT INTO openmsg_messages_inbox (self_openmsg_address, ident_code, message_hash, message_text) VALUES (?, ?, ?, ?)',
      [receivingOpenmsgAddress, identCode, messageHash, decryptedMessage]
    );

    // Return success response
    return {
      success: true,
      response_code: 'SM_S888'
    };

  } catch (err) {
    console.error('messageCheck error:', err);
    return {
      error: true,
      response_code: 'SM_E000',
      error_message: 'Database error'
    };
  }
}

/**
 * Confirm message authenticity
 * 
 * This function verifies that a message with the given hash and nonce
 * was actually sent from this server. It's called by other OpenMsg servers
 * to prevent message spoofing attacks.
 * 
 * Verification process:
 * 1. Look for the message in our outbox with matching hash and nonce
 * 2. If found, the message is confirmed as authentic
 * 3. Move the message from outbox to sent archive
 * 
 * @param messageHash - SHA-256 hash of the message being confirmed
 * @param messageNonce - Nonce from the message encryption
 * @returns MessageConfirmResponse indicating if message is authentic
 */
async function messageConfirm(messageHash: string, messageNonce: string): Promise<MessageConfirmResponse> {
  try {
    // Look for the message in our outbox
    // Only messages we actually sent will be in the outbox
    const [rows] = await pool.execute<(OpenMsgMessageOutbox & RowDataPacket)[]>(
      'SELECT * FROM openmsg_messages_outbox WHERE message_hash = ? AND message_nonce = ?',
      [messageHash, messageNonce]
    );

    if (rows.length === 0) {
      // Message not found in our outbox - not authentic
      return {
        error: true,
        error_message: `Message not found in outbox: ${messageHash}`
      };
    }

    const message = rows[0]!;

    // Move the message from outbox to sent archive
    // This confirms delivery and prevents duplicate confirmations
    await pool.execute(
      'INSERT INTO openmsg_messages_sent (self_openmsg_address, ident_code, message_hash, message_text) VALUES (?, ?, ?, ?)',
      [message.self_openmsg_address, message.ident_code, message.message_hash, message.message_text]
    );

    // Remove from outbox
    await pool.execute(
      'DELETE FROM openmsg_messages_outbox WHERE message_hash = ? AND message_nonce = ? LIMIT 1',
      [messageHash, messageNonce]
    );

    return { success: true };

  } catch (error) {
    console.error('messageConfirm error:', error);
    return {
      error: true,
      error_message: 'Database error during confirmation'
    };
  }
}

export default router;
