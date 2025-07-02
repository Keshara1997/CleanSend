/**
 * OpenMsg Authentication Routes
 * 
 * This module handles the authentication and connection establishment process
 * between OpenMsg users across different domains. It implements a secure
 * handshake protocol using pass codes and generates encryption keys for
 * end-to-end messaging.
 * 
 * Authentication Flow:
 * 1. User A requests pass code from User B
 * 2. User A sends auth request to User B's server with pass code
 * 3. User B's server validates pass code and confirms with User A's server
 * 4. Connection is established with unique encryption keys
 * 
 * Security Features:
 * - Pass codes expire after 1 hour
 * - Cross-domain verification prevents spoofing
 * - Unique encryption keys per connection
 * - Authentication codes for message verification
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/database';
import { generateAuthCode, generateIdentCode, generateMessageCryptKey } from '../utils/crypto';
import settings from '../config/settings';

import { RowDataPacket } from 'mysql2';
import { AuthConfirmRequest, AuthConfirmResponse, AuthRequest, AuthResponse, OpenMsgHandshake, OpenMsgPassCode, OpenMsgUser } from '../type';

const router = express.Router();

/**
 * POST /auth
 * 
 * Main authentication endpoint for establishing connections between OpenMsg users.
 * This is called by other OpenMsg servers when their users want to connect
 * with a user on this server.
 * 
 * Process:
 * 1. Validates request data and pass code
 * 2. Confirms authenticity with the sending server
 * 3. Generates encryption keys and connection credentials
 * 4. Stores connection in database
 */
router.post('/', async (req: Request<{}, AuthResponse, AuthRequest>, res: Response<AuthResponse>) => {
    try {
        const {
            receiving_openmsg_address_id,
            pass_code,
            sending_openmsg_address,
            sending_openmsg_address_name,
            sending_allow_replies
        } = req.body;

        // Process the authentication request
        const result = await authCheck(
            receiving_openmsg_address_id,
            pass_code,
            sending_openmsg_address,
            sending_openmsg_address_name,
            sending_allow_replies
        );

        res.json(result);
    } catch (error) {
        console.error('Auth error:', error);
        res.json({ error: true, error_message: 'Internal server error' });
    }
});

/**
 * POST /auth/confirm
 * 
 * Authentication confirmation endpoint used to verify that a handshake
 * request is legitimate. This prevents unauthorized users from spoofing
 * connection attempts.
 * 
 * Called by other OpenMsg servers to confirm that:
 * - The handshake was actually initiated by the claimed user
 * - The pass code is valid and not expired
 */
router.post('/confirm', async (req: Request<{}, AuthConfirmResponse, AuthConfirmRequest>, res: Response<AuthConfirmResponse>) => {
    try {
        const { other_openmsg_address, pass_code } = req.body;
        const result = await authConfirm(other_openmsg_address, pass_code);
        res.json(result);
    } catch (error) {
        console.error('Auth confirm error:', error);
        res.json({ error: true, error_message: 'Internal server error' });
    }
});

/**
 * Process authentication request from another OpenMsg server
 * 
 * This function implements the core authentication logic:
 * 1. Validates all required fields
 * 2. Checks if the receiving user exists on this server
 * 3. Validates the pass code (must be recent and valid)
 * 4. Performs cross-domain verification with the sending server
 * 5. Generates unique encryption keys for the connection
 * 6. Stores the connection in the database
 * 
 * @param selfOpenmsgAddressId - User ID on this server (receiving user)
 * @param passCode - One-time pass code provided by receiving user
 * @param otherOpenmsgAddress - Full address of sending user
 * @param otherOpenmsgAddressName - Display name of sending user
 * @param otherAllowsReplies - Whether sending user accepts reply messages
 * @returns AuthResponse with connection credentials or error
 */
async function authCheck(
    selfOpenmsgAddressId: string,
    passCode: string,
    otherOpenmsgAddress: string,
    otherOpenmsgAddressName: string,
    otherAllowsReplies: boolean
): Promise<AuthResponse> {
    // Validate required fields
    if (!selfOpenmsgAddressId || !passCode || !otherOpenmsgAddress || !otherOpenmsgAddressName) {
        return {
            error: true,
            error_message: `Required fields missing: ${selfOpenmsgAddressId}, ${passCode}, ${otherOpenmsgAddress}, ${otherOpenmsgAddressName}`
        };
    }

    // Construct full OpenMsg address for the receiving user
    const selfOpenmsgAddress = `${selfOpenmsgAddressId}*${settings.openmsgDomain}`;

    try {
        // Verify that the receiving user exists on this server
        const [userRows] = await pool.execute<(OpenMsgUser & RowDataPacket)[]>(
            'SELECT self_openmsg_address_name FROM openmsg_users WHERE self_openmsg_address = ?',
            [selfOpenmsgAddress]
        );

        if (userRows.length === 0) {
            return { error: true, error_message: 'User not found' };
        }

        const selfOpenmsgAddressName = userRows[0]!.self_openmsg_address_name;

        // Validate the pass code - must exist and not be expired
        const [passCodeRows] = await pool.execute<(OpenMsgPassCode & RowDataPacket & { passCode_timestamp: number })[]>(
            'SELECT UNIX_TIMESTAMP(timestamp) as passCode_timestamp FROM openmsg_passCodes WHERE self_openmsg_address = ? AND pass_code = ?',
            [selfOpenmsgAddress, passCode]
        );

        if (passCodeRows.length === 0) {
            return { error: true, error_message: 'Invalid pass code' };
        }

        // Check if pass code has expired (1 hour expiry)
        const oneHour = 3600; // seconds
        if (passCodeRows[0]!.passCode_timestamp < Math.floor(Date.now() / 1000) - oneHour) {
            return { error: true, error_message: 'Expired pass code' };
        }

        // Consume the pass code (delete it so it can't be reused)
        await pool.execute(
            'DELETE FROM openmsg_passCodes WHERE self_openmsg_address = ? AND pass_code = ? LIMIT 1',
            [selfOpenmsgAddress, passCode]
        );

        // Parse and validate the sending user's address
        const addressParts = otherOpenmsgAddress.split('*');
        if (addressParts.length !== 2) {
            return { error: true, error_message: 'Invalid openmsg address format' };
        }

        const [otherOpenmsgAddressId, otherOpenmsgAddressDomain] = addressParts;
        if (!/^\d+$/.test(otherOpenmsgAddressId!)) {
            return { error: true, error_message: 'Address ID should be numeric' };
        }

        // Perform cross-domain verification
        // Contact the sending server to confirm this handshake is legitimate
        const url = `https://${otherOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/auth/confirm`;
        const requestData: AuthConfirmRequest = {
            other_openmsg_address: `${selfOpenmsgAddressId}*${settings.openmsgDomain}`,
            pass_code: passCode
        };

        let response;
        try {
            response = await axios.post<AuthConfirmResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000  // 10 second timeout for cross-domain requests
            });
        } catch (error) {
            return { error: true, error_message: `Request error: ${(error as Error).message}` };
        }

        // Verify the confirmation response
        if (response.status !== 200 || response.data.error || response.data.success !== true) {
            return {
                error: true,
                error_message: response.data.error_message || 'Remote confirmation failed'
            };
        }

        // Generate unique cryptographic materials for this connection
        const authCode = generateAuthCode();           // For message authentication
        const identCode = generateIdentCode();         // For connection identification
        const messageCryptKey = generateMessageCryptKey(); // For message encryption

        // Remove any existing connection between these users
        // (allows re-establishment with new keys)
        await pool.execute(
            'DELETE FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [selfOpenmsgAddress, otherOpenmsgAddress]
        );

        // Store the new connection with encryption keys
        await pool.execute(
            `INSERT INTO openmsg_user_connections 
             (self_openmsg_address, other_openmsg_address, other_openmsg_address_name, other_acceptsMessages, auth_code, ident_code, message_crypt_key) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [selfOpenmsgAddress, otherOpenmsgAddress, otherOpenmsgAddressName, otherAllowsReplies ? 1 : 0, authCode, identCode, messageCryptKey]
        );

        // Return success with connection credentials
        return {
            success: true,
            auth_code: authCode,
            ident_code: identCode,
            message_crypt_key: messageCryptKey,
            receiving_openmsg_address_name: selfOpenmsgAddressName
        };
    } catch (error) {
        console.error('authCheck DB error:', error);
        return { error: true, error_message: 'Database error' };
    }
}

/**
 * Confirm authentication handshake legitimacy
 * 
 * This function is called by other OpenMsg servers to verify that
 * a handshake request actually came from a user on this server.
 * It prevents spoofing attacks where malicious users claim to be
 * from a different domain.
 * 
 * Verification process:
 * 1. Check if there's a pending handshake with the given details
 * 2. Verify the handshake isn't expired (60 second limit)
 * 3. Remove the handshake record (consume it)
 * 
 * @param otherOpenmsgAddress - Address of the user making the auth request
 * @param passCode - Pass code used in the auth request
 * @returns AuthConfirmResponse indicating success or failure
 */
async function authConfirm(otherOpenmsgAddress: string, passCode: string): Promise<AuthConfirmResponse> {
    try {
        // Look for a pending handshake matching these details
        const [rows] = await pool.execute<(OpenMsgHandshake & RowDataPacket & { initiation_timestamp: number })[]>(
            'SELECT UNIX_TIMESTAMP(timestamp) as initiation_timestamp FROM openmsg_handshakes WHERE other_openmsg_address = ? AND pass_code = ?',
            [otherOpenmsgAddress, passCode]
        );

        if (rows.length === 0) {
            return {
                error: true,
                error_message: `Pending authorization not found for ${otherOpenmsgAddress}`
            };
        }

        // Check if the handshake has expired (60 second limit for security)
        const now = Math.floor(Date.now() / 1000);
        if (rows[0]!.initiation_timestamp < now - 60) {
            return { error: true, error_message: 'Handshake expired (over 60s)' };
        }

        // Consume the handshake record (prevent reuse)
        await pool.execute(
            'DELETE FROM openmsg_handshakes WHERE other_openmsg_address = ? AND pass_code = ? LIMIT 1',
            [otherOpenmsgAddress, passCode]
        );

        return { success: true };
    } catch (error) {
        console.error('authConfirm DB error:', error);
        return { error: true, error_message: 'Database error' };
    }
}

export default router;
