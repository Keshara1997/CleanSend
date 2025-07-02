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
    RequestPassCodeRequest,
    RequestPassCodeResponse,
    AuthRequest,
    AuthResponse,
    MessageReceiveRequest,
    MessageReceiveResponse,
    OpenMsgUserConnection
} from '../types/index';
import { RowDataPacket } from 'mysql2';

const router = express.Router();

router.post('/initiate-handshake', async (req: Request<{}, InitiateHandshakeResponse, InitiateHandshakeRequest>, res: Response<InitiateHandshakeResponse>) => {
    try {
        const { other_openmsg_address, pass_code } = req.body;

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

router.post('/request-pass-code', async (req: Request, res: Response) => {
    try {
        const { self_openmsg_address } = req.body;

        if (!self_openmsg_address) {
            return res.json({
                error: true,
                error_message: 'self_openmsg_address is required'
            });
        }

        const passCode = Math.floor(100000 + Math.random() * 900000).toString();

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
        return;
    }
});

async function initiateHandshake(
    otherOpenmsgAddress: string,
    passCode: string,
    selfOpenmsgAddress: string,
    selfOpenmsgAddressName: string,
    selfAllowReplies: boolean
): Promise<string> {
    if (!otherOpenmsgAddress || !passCode || !selfOpenmsgAddress || !selfOpenmsgAddressName || !settings.openmsgDomain) {
        return "Missing data (8BgrT)";
    }

    if (!/^\d+$/.test(passCode)) {
        return "Please enter a valid Pass Code";
    }

    const addressParts = otherOpenmsgAddress.split('*');
    if (addressParts.length !== 2) {
        return "Invalid address format";
    }

    const [otherOpenmsgAddressId, otherOpenmsgAddressDomain] = addressParts;

    if (!/^\d+$/.test(otherOpenmsgAddressId!)) {
        return `other_openmsg_address_id not valid ${otherOpenmsgAddressId} (wD861)`;
    }

    if (!/^[A-Za-z0-9.\-]+$/.test(otherOpenmsgAddressDomain!)) {
        return `openmsg_address_domain not valid ${otherOpenmsgAddressDomain} (D8hgB)`;
    }

    try {
        await pool.execute(
            'INSERT INTO openmsg_handshakes (other_openmsg_address, pass_code) VALUES (?, ?)',
            [otherOpenmsgAddress, passCode]
        );

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
                timeout: 15000,
                maxRedirects: 3
            });
        } catch (error) {
            return `Error. Request error: ${(error as Error).message}`;
        }

        if (response.status !== 200) {
            return `Error. Response status: ${response.status} (A50m5)`;
        }

        const responseData = response.data;
        if (responseData.error) {
            return `Error: ${responseData.error_message}`;
        }

        if (responseData.success !== true) {
            return "Error: Unsuccessful from initiate-handshake (LyoSV)";
        }

        const { auth_code, ident_code, message_crypt_key, receiving_openmsg_address_name } = responseData;

        if (!auth_code || !ident_code || !message_crypt_key || !receiving_openmsg_address_name) {
            return "Error: Missing required data in response";
        }

        const otherAcceptsMessages = true;

        await pool.execute(
            'DELETE FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [selfOpenmsgAddress, otherOpenmsgAddress]
        );

        await pool.execute(
            'INSERT INTO openmsg_user_connections (self_openmsg_address, other_openmsg_address, other_openmsg_address_name, other_acceptsMessages, auth_code, ident_code, message_crypt_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [selfOpenmsgAddress, otherOpenmsgAddress, receiving_openmsg_address_name, otherAcceptsMessages ? 1 : 0, auth_code, ident_code, message_crypt_key]
        );

        return "Success";

    } catch (error) {
        console.error('Database error in initiateHandshake:', error);
        return "Database error";
    }
}

async function sendMessage(
    messageText: string,
    sendingOpenmsgAddress: string,
    receivingOpenmsgAddress: string
): Promise<SendMessageResponse> {
    try {
        const [connectionRows] = await pool.execute<(OpenMsgUserConnection & RowDataPacket)[]>(
            'SELECT auth_code, ident_code, message_crypt_key FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [sendingOpenmsgAddress, receivingOpenmsgAddress]
        );

        if (connectionRows.length === 0) {
            return {
                error: true,
                error_message: `No matching connection between these two users ${sendingOpenmsgAddress}, ${receivingOpenmsgAddress} (Qmyxm)`,
                response_code: 'SM_E001'
            };
        }

        const connection = connectionRows[0]!;
        const { auth_code: authCode, ident_code: identCode, message_crypt_key: messageCryptKey } = connection;

        const addressParts = receivingOpenmsgAddress.split('*');
        if (addressParts.length !== 2) {
            return {
                error: true,
                error_message: 'Invalid receiving address format',
                response_code: 'SM_E000'
            };
        }

        const [receivingOpenmsgAddressId, receivingOpenmsgAddressDomain] = addressParts;

        // Create encrypted message package
        const { package: messagePackage, nonce: messageNonceEncoded } = createMessagePackage(messageText, messageCryptKey);

        const messageSalt = generateMessageSalt();
        const messageTimestamp = Math.floor(Date.now() / 1000);
        const messageHash = createMessageHash(messagePackage, authCode, messageSalt, messageTimestamp);

        await pool.execute(
            'INSERT INTO openmsg_messages_outbox (self_openmsg_address, ident_code, message_hash, message_nonce, message_text) VALUES (?, ?, ?, ?, ?)',
            [sendingOpenmsgAddress, identCode, messageHash, messageNonceEncoded, messageText]
        );

        const url = `https://${receivingOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/message/receive`;

        const requestData: MessageReceiveRequest = {
            receiving_openmsg_address_id: receivingOpenmsgAddressId!,
            ident_code: identCode,
            message_package: messagePackage,
            message_hash: messageHash,
            message_salt: messageSalt,
            message_timestamp: messageTimestamp,
            openmsg_version: 1.0,
            verified_account: {
                verified_account_signature: "",
                verified_account_name: "",
                verified_account_expires: ""
            }
        };

        let response;
        try {
            response = await axios.post<MessageReceiveResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
                maxRedirects: 3
            });
        } catch (error) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Error: ${(error as Error).message} (gcbNI)`
            };
        }

        if (response.status !== 200) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Response status: ${response.status} (s3mK6)`
            };
        }

        const responseData = response.data;
        if (responseData.error) {
            return {
                error: true,
                response_code: responseData.response_code as any,
                error_message: `Error: ${responseData.error_message} (siULi)`
            };
        }

        if (responseData.success !== true) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: 'Unsuccessful (5Ljkz)'
            };
        }

        await pool.execute(
            'INSERT INTO openmsg_messages_sent (self_openmsg_address, ident_code, message_hash, message_text) VALUES (?, ?, ?, ?)',
            [sendingOpenmsgAddress, identCode, messageHash, messageText]
        );

        await pool.execute(
            'DELETE FROM openmsg_messages_outbox WHERE message_hash = ? AND message_nonce = ?',
            [messageHash, messageNonceEncoded]
        );

        return {
            success: true,
            response_code: responseData.response_code as any || 'SM_S888'
        };

    } catch (error) {
        console.error('Database error in sendMessage:', error);
        return {
            error: true,
            response_code: 'SM_E000',
            error_message: 'Database error'
        };
    }
}

export default router; 