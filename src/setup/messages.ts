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
} from '../types/index';
import { RowDataPacket } from 'mysql2';

const router = express.Router();

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

async function messageCheck(
    receivingOpenmsgAddressId: string,
    identCode: string,
    messagePackage: string,
    messageHash: string,
    messageSalt: string,
    messageTimestamp: number
): Promise<MessageReceiveResponse> {
    if (!receivingOpenmsgAddressId || !identCode || !messagePackage || !messageHash || !messageSalt || !messageTimestamp) {
        return {
            error: true,
            response_code: 'SM_E000',
            error_message: 'Missing data (wMv4J)'
        };
    }

    const receivingOpenmsgAddress = `${receivingOpenmsgAddressId}*${settings.openmsgDomain}`;

    try {
        const [connectionRows] = await pool.execute<(OpenMsgUserConnection & RowDataPacket)[]>(
            'SELECT auth_code, message_crypt_key, other_openmsg_address FROM openmsg_user_connections WHERE self_openmsg_address = ? AND ident_code = ?',
            [receivingOpenmsgAddress, identCode]
        );

        if (connectionRows.length === 0) {
            return {
                error: true,
                response_code: 'SM_E001',
                error_message: `Could not find user::: ${receivingOpenmsgAddress} (rB6Xl)`
            };
        }

        const connection = connectionRows[0]!;
        const { auth_code: authCode, message_crypt_key: messageCryptKey, other_openmsg_address: sendingOpenmsgAddress } = connection;

        if (!authCode || !identCode || !messageCryptKey || !sendingOpenmsgAddress) {
            return {
                error: true,
                response_code: 'SM_E001',
                error_message: `Could not find user::: ${receivingOpenmsgAddress} (rB6Xl)`
            };
        }

        const addressParts = sendingOpenmsgAddress.split('*');
        if (addressParts.length !== 2) {
            return {
                error: true,
                response_code: 'SM_E003',
                error_message: 'Invalid sending address format'
            };
        }

        const sendingOpenmsgAddressDomain = addressParts[1];

        const messageHashTest = createMessageHash(messagePackage, authCode, messageSalt, messageTimestamp);
        if (messageHash !== messageHashTest) {
            return {
                error: true,
                response_code: 'SM_E004',
                error_message: 'There was an error with the authorization (4NxWV)'
            };
        }

        const messageHashExpirySeconds = 60;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if ((messageTimestamp + messageHashExpirySeconds) < currentTimestamp) {
            return {
                error: true,
                response_code: 'SM_E005',
                error_message: 'Hash is too old (kmqVE)'
            };
        }

        const messagePackageDecoded = Buffer.from(messagePackage, 'base64');
        const messageNonce = messagePackageDecoded.slice(0, 16);
        const messageNonceEncoded = messageNonce.toString('base64');

        const url = `https://${sendingOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/message/confirm`;

        const requestData: MessageConfirmRequest = {
            message_hash: messageHash,
            message_nonce: messageNonceEncoded
        };

        let response;
        try {
            response = await axios.post<MessageConfirmResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
        } catch (error) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Error: ${(error as Error).message} ${sendingOpenmsgAddress} (vSiFb)`
            };
        }

        if (response.status === 404) {
            return {
                error: true,
                response_code: 'SM_E003',
                error_message: `No reply from host ${sendingOpenmsgAddressDomain} - Response status: ${response.status} (i9ZsS)`
            };
        }

        if (response.status !== 200) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `${sendingOpenmsgAddressDomain} Response status: ${response.status} (0xOIw)`
            };
        }

        const responseData = response.data;
        if (responseData.error) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: `Error: ${responseData.error_message} (PqN9h)`
            };
        }

        if (responseData.success !== true) {
            return {
                error: true,
                response_code: 'SM_E000',
                error_message: 'Unsuccessful - unknown reason (x8rXc)'
            };
        }

        // Now attempt to decrypt the message
        const messageDecrypted = decryptMessagePackage(messagePackage, messageCryptKey);
        if (messageDecrypted === false) {
            return {
                error: true,
                response_code: 'SM_E005',
                error_message: 'Invalid key or corrupt message (QctWn)'
            };
        }

        await pool.execute(
            'INSERT INTO openmsg_messages_inbox (self_openmsg_address, ident_code, message_hash, message_text) VALUES (?, ?, ?, ?)',
            [receivingOpenmsgAddress, identCode, messageHash, messageDecrypted]
        );

        return {
            success: true,
            response_code: 'SM_S888'
        };

    } catch (error) {
        console.error('Database error in messageCheck:', error);
        return {
            error: true,
            response_code: 'SM_E000',
            error_message: 'Database error'
        };
    }
}

async function messageConfirm(messageHash: string, messageNonce: string): Promise<MessageConfirmResponse> {
    try {
        // Check for message in outbox
        const [rows] = await pool.execute<(OpenMsgMessageOutbox & RowDataPacket)[]>(
            'SELECT * FROM openmsg_messages_outbox WHERE message_hash = ? AND message_nonce = ?',
            [messageHash, messageNonce]
        );

        if (rows.length === 0) {
            return {
                error: true,
                error_message: 'Message not found or already confirmed'
            };
        }

        return {
            success: true
        };

    } catch (error) {
        console.error('Database error in messageConfirm:', error);
        return {
            error: true,
            error_message: 'Database error'
        };
    }
}

export default router; 