/**
 * OpenMsg Setup and Testing Routes
 * 
 * This module provides administrative and testing endpoints for the OpenMsg
 * protocol. These endpoints facilitate connection establishment, message sending,
 * and pass code generation for development and testing purposes.
 * 
 * Testing Features:
 * - Initiate handshakes with other OpenMsg users
 * - Send messages to connected users
 * - Generate one-time pass codes for authentication
 * 
 * Note: In production, these endpoints would typically be integrated
 * into a user interface or replaced with user authentication systems.
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/database';
import { createMessagePackage, createMessageHash, generateMessageSalt } from '../utils/crypto';
import settings from '../config/settings';
import {
    InitiateHandshakeRequest,
    InitiateHandshakeResponse,
    SendMessageRequest,
    SendMessageResponse,
    AuthRequest,
    AuthResponse,
    MessageReceiveRequest,
    MessageReceiveResponse,
    OpenMsgUserConnection
} from '../type';
import { RowDataPacket } from 'mysql2';

const router = express.Router();

/**
 * POST /setup/initiate-handshake
 * 
 * Testing endpoint to initiate a connection with another OpenMsg user.
 * This simulates the process a user would go through to connect with
 * someone on a different OpenMsg server.
 * 
 * Process:
 * 1. Creates a handshake record with the provided pass code
 * 2. Sends authentication request to the other user's server
 * 3. Stores the resulting connection credentials
 * 
 * Note: In production, the sender's address would come from user authentication
 */
router.post('/initiate-handshake', async (req: Request<{}, InitiateHandshakeResponse, InitiateHandshakeRequest>, res: Response<InitiateHandshakeResponse>) => {
    try {
        const { other_openmsg_address, pass_code } = req.body;

        // TODO: Replace with session/user context in production
        // These would normally come from authenticated user session
        const selfOpenmsgAddressName = "John Doe";
        const selfOpenmsgAddress = `1000001*${settings.openmsgDomain}`;
        const selfAllowReplies = true;

        const result = await initiateHandshake(
            other_openmsg_address,
            pass_code,
            selfOpenmsgAddress,
            selfOpenmsgAddressName,
            selfAllowReplies
        );

        if (result === "Success") {
            res.json({ success: true, message: `Connected. You can now message us: ${selfOpenmsgAddress}` });
        } else {
            res.json({ error: true, message: `Error: ${result}` });
        }
    } catch (error) {
        console.error('Initiate handshake error:', error);
        res.json({ error: true, message: 'Internal server error' });
    }
});

/**
 * POST /setup/send-message
 * 
 * Testing endpoint to send an encrypted message to a connected OpenMsg user.
 * This demonstrates the complete message sending process including encryption,
 * hash creation, and cross-domain delivery.
 * 
 * Requirements:
 * - A connection must already exist between sender and recipient
 * - The connection provides the necessary encryption keys and auth codes
 */
router.post('/send-message', async (req: Request<{}, SendMessageResponse, SendMessageRequest>, res: Response<SendMessageResponse>) => {
    try {
        const { message_text, sending_openmsg_address, receiving_openmsg_address } = req.body;

        const result = await sendMessage(message_text, sending_openmsg_address, receiving_openmsg_address);
        res.json(result);
    } catch (error) {
        console.error('Send message error:', error);
        res.json({
            error: true,
            response_code: 'SM_E000',
            error_message: 'Internal server error'
        });
    }
});

/**
 * POST /setup/request-pass-code
 * 
 * Testing endpoint to generate a one-time pass code for authentication.
 * Pass codes are used in the handshake process to authorize new connections.
 * 
 * Security features:
 * - Pass codes are 6-digit random numbers
 * - Expire after 1 hour
 * - Single-use only (consumed during authentication)
 */
router.post('/request-pass-code', async (req: Request, res: Response) => {
    try {
        const { self_openmsg_address } = req.body;

        if (!self_openmsg_address) {
            return res.json({
                error: true,
                error_message: 'self_openmsg_address is required'
            });
        }

        // Generate a 6-digit random pass code
        const passCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Store the pass code with expiration (1 hour)
        await pool.execute(
            'INSERT INTO openmsg_passCodes (self_openmsg_address, pass_code) VALUES (?, ?)',
            [self_openmsg_address, passCode]
        );

        return res.json({
            success: true,
            pass_code: passCode,
            message: 'Pass code generated. Valid for 1 hour.'
        });
    } catch (error) {
        console.error('Request pass code error:', error);
        res.json({
            error: true,
            error_message: 'Internal server error'
        });
        return
    }
});

/**
 * Initiate handshake with another OpenMsg user
 * 
 * This function implements the client side of the OpenMsg handshake protocol:
 * 1. Validates input parameters
 * 2. Creates a handshake record in the database
 * 3. Sends authentication request to the other user's server
 * 4. Stores the resulting connection credentials
 * 
 * @param otherOpenmsgAddress - Full address of user to connect with
 * @param passCode - Pass code obtained from that user
 * @param selfOpenmsgAddress - Our full OpenMsg address
 * @param selfOpenmsgAddressName - Our display name
 * @param selfAllowReplies - Whether we accept reply messages
 * @returns Success message or error description
 */
async function initiateHandshake(
    otherOpenmsgAddress: string,
    passCode: string,
    selfOpenmsgAddress: string,
    selfOpenmsgAddressName: string,
    selfAllowReplies: boolean
): Promise<string> {
    // Validate required parameters
    if (!otherOpenmsgAddress || !passCode || !selfOpenmsgAddress || !selfOpenmsgAddressName || !settings.openmsgDomain) {
        return "Missing data (8BgrT)";
    }

    // Validate pass code format (must be numeric)
    if (!/^\d+$/.test(passCode)) {
        return "Please enter a valid Pass Code";
    }

    // Parse and validate the target user's address
    const addressParts = otherOpenmsgAddress.split('*');
    if (addressParts.length !== 2) return "Invalid address format";

    const [otherOpenmsgAddressId, otherOpenmsgAddressDomain] = addressParts;

    // Validate address components
    if (!/^\d+$/.test(otherOpenmsgAddressId!)) {
        return `other_openmsg_address_id not valid ${otherOpenmsgAddressId} (wD861)`;
    }

    if (!/^[A-Za-z0-9.\-]+$/.test(otherOpenmsgAddressDomain!)) {
        return `openmsg_address_domain not valid ${otherOpenmsgAddressDomain} (D8hgB)`;
    }

    try {
        // Create handshake record (for confirmation by other server)
        await pool.execute(
            'INSERT INTO openmsg_handshakes (other_openmsg_address, pass_code) VALUES (?, ?)',
            [otherOpenmsgAddress, passCode]
        );

        // Send authentication request to the other server
        const url = `https://${otherOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/auth/`;

        const requestData: AuthRequest = {
            receiving_openmsg_address_id: otherOpenmsgAddressId!,
            pass_code: passCode,
            sending_openmsg_address: selfOpenmsgAddress,
            sending_openmsg_address_name: selfOpenmsgAddressName,
            sending_allow_replies: selfAllowReplies,
            openmsg_version: 1.0
        };

        let response;
        try {
            response = await axios.post<AuthResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,    // 15 second timeout for handshake
                maxRedirects: 3    // Allow up to 3 redirects
            });
        } catch (error) {
            return `Error. Request error: ${(error as Error).message}`;
        }

        const responseData = response.data;

        // Verify the authentication response
        if (response.status !== 200 || responseData.error || responseData.success !== true) {
            return responseData.error_message || "Handshake failed";
        }

        // Extract connection credentials from response
        const { auth_code, ident_code, message_crypt_key, receiving_openmsg_address_name } = responseData;

        if (!auth_code || !ident_code || !message_crypt_key || !receiving_openmsg_address_name) {
            return "Error: Missing required data in response";
        }

        // Remove any existing connection (allows re-establishment)
        await pool.execute(
            'DELETE FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [selfOpenmsgAddress, otherOpenmsgAddress]
        );

        // Store the new connection with credentials
        await pool.execute(
            'INSERT INTO openmsg_user_connections (self_openmsg_address, other_openmsg_address, other_openmsg_address_name, other_acceptsMessages, auth_code, ident_code, message_crypt_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [selfOpenmsgAddress, otherOpenmsgAddress, receiving_openmsg_address_name, 1, auth_code, ident_code, message_crypt_key]
        );

        return "Success";
    } catch (error) {
        console.error('Database error in initiateHandshake:', error);
        return "Database error";
    }
}

/**
 * Send encrypted message to connected OpenMsg user
 * 
 * This function implements the complete message sending process:
 * 1. Looks up the connection between sender and recipient
 * 2. Encrypts the message using the connection's encryption key
 * 3. Creates verification hash with auth code and timestamp
 * 4. Sends encrypted package to recipient's server
 * 5. Stores message in outbox for confirmation tracking
 * 
 * @param messageText - Plaintext message to send
 * @param sendingOpenmsgAddress - Sender's full OpenMsg address
 * @param receivingOpenmsgAddress - Recipient's full OpenMsg address
 * @returns SendMessageResponse indicating success or failure
 */
async function sendMessage(
    messageText: string,
    sendingOpenmsgAddress: string,
    receivingOpenmsgAddress: string
): Promise<SendMessageResponse> {
    try {
        // Look up the connection between sender and recipient
        const [connectionRows] = await pool.execute<(OpenMsgUserConnection & RowDataPacket)[]>(
            'SELECT auth_code, ident_code, message_crypt_key FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [sendingOpenmsgAddress, receivingOpenmsgAddress]
        );

        if (connectionRows.length === 0) {
            return {
                error: true,
                error_message: `No matching connection between these users: ${sendingOpenmsgAddress}, ${receivingOpenmsgAddress} (Qmyxm)`,
                response_code: 'SM_E001'
            };
        }

        const { auth_code, ident_code, message_crypt_key } = connectionRows[0]!;

        // Parse recipient's domain from their address
        const addressParts = receivingOpenmsgAddress.split('*');
        if (addressParts.length !== 2) {
            return {
                error: true,
                error_message: 'Invalid receiving address format',
                response_code: 'SM_E003'
            };
        }

        const [receivingOpenmsgAddressId, receivingOpenmsgAddressDomain] = addressParts;

        // Encrypt the message using the connection's encryption key
        const messagePackage = createMessagePackage(messageText, message_crypt_key);

        // Generate salt and timestamp for hash verification
        const messageSalt = generateMessageSalt();
        const messageTimestamp = Math.floor(Date.now() / 1000);

        // Create verification hash to prove message authenticity
        const messageHash = createMessageHash(
            messagePackage.package,
            auth_code,
            messageSalt,
            messageTimestamp
        );

        // Store message in outbox for confirmation tracking
        await pool.execute(
            'INSERT INTO openmsg_messages_outbox (self_openmsg_address, ident_code, message_hash, message_nonce, message_text) VALUES (?, ?, ?, ?, ?)',
            [sendingOpenmsgAddress, ident_code, messageHash, messagePackage.nonce, messageText]
        );

        // Send encrypted message to recipient's server
        const url = `https://${receivingOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/message/receive`;

        const requestData: MessageReceiveRequest = {
            receiving_openmsg_address_id: receivingOpenmsgAddressId!,
            ident_code: ident_code,
            message_package: messagePackage.package,
            message_hash: messageHash,
            message_salt: messageSalt,
            message_timestamp: messageTimestamp,
            openmsg_version: 1.0
        };

        let response;
        try {
            response = await axios.post<MessageReceiveResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000  // 15 second timeout for message delivery
            });
        } catch (error) {
            return {
                error: true,
                error_message: `Request failed: ${(error as Error).message}`,
                response_code: 'SM_E000'
            };
        }

        // Return the response from the recipient's server
        const responseData = response.data;
        if (response.status !== 200 || responseData.error) {
            return {
                error: true,
                error_message: responseData.error_message || 'Message delivery failed',
                response_code: responseData.response_code || 'SM_E000'
            };
        }

        return {
            success: true,
            response_code: responseData.response_code || 'SM_S888'
        };

    } catch (error) {
        console.error('sendMessage error:', error);
        return {
            error: true,
            error_message: 'Database error',
            response_code: 'SM_E000'
        };
    }
}

export default router;
