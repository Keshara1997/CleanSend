import express, { Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../config/database';
import { generateAuthCode, generateIdentCode, generateMessageCryptKey } from '../utils/crypto';
import settings from '../config/settings';
import {
    AuthRequest,
    AuthResponse,
    AuthConfirmRequest,
    AuthConfirmResponse,
    OpenMsgUser,
    OpenMsgPassCode,
    OpenMsgHandshake
} from '../types/index';
import { RowDataPacket } from 'mysql2';

const router = express.Router();

router.post('/', async (req: Request<{}, AuthResponse, AuthRequest>, res: Response<AuthResponse>) => {
    try {
        const {
            receiving_openmsg_address_id,
            pass_code,
            sending_openmsg_address,
            sending_openmsg_address_name,
            sending_allow_replies
        } = req.body;

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
        res.json({
            error: true,
            error_message: 'Internal server error'
        });
    }
});

router.post('/confirm', async (req: Request<{}, AuthConfirmResponse, AuthConfirmRequest>, res: Response<AuthConfirmResponse>) => {
    try {
        const { other_openmsg_address, pass_code } = req.body;
        const result = await authConfirm(other_openmsg_address, pass_code);
        res.json(result);
    } catch (error) {
        console.error('Auth confirm error:', error);
        res.json({
            error: true,
            error_message: 'Internal server error'
        });
    }
});

async function authCheck(
    selfOpenmsgAddressId: string,
    passCode: string,
    otherOpenmsgAddress: string,
    otherOpenmsgAddressName: string,
    otherAllowsReplies: boolean
): Promise<AuthResponse> {
    if (!selfOpenmsgAddressId || !passCode || !otherOpenmsgAddress || !otherOpenmsgAddressName) {
        return {
            error: true,
            error_message: `self_openmsg_address_id, pass_code, other_openmsg_address and other_openmsg_address_name cannot be blank :: ${selfOpenmsgAddressId}, ${passCode}, ${otherOpenmsgAddress}, ${otherOpenmsgAddressName}`
        };
    }

    const selfOpenmsgAddress = `${selfOpenmsgAddressId}*${settings.openmsgDomain}`;

    try {
        const [userRows] = await pool.execute<(OpenMsgUser & RowDataPacket)[]>(
            'SELECT self_openmsg_address_name FROM openmsg_users WHERE self_openmsg_address = ?',
            [selfOpenmsgAddress]
        );

        if (userRows.length === 0) {
            return {
                error: true,
                error_message: 'User not found'
            };
        }

        const selfOpenmsgAddressName = userRows[0]!.self_openmsg_address_name;

        const [passCodeRows] = await pool.execute<(OpenMsgPassCode & RowDataPacket & { passCode_timestamp: number })[]>(
            'SELECT UNIX_TIMESTAMP(timestamp) as passCode_timestamp FROM openmsg_passCodes WHERE self_openmsg_address = ? AND pass_code = ?',
            [selfOpenmsgAddress, passCode]
        );

        if (passCodeRows.length === 0) {
            return {
                error: true,
                error_message: 'pass code not valid'
            };
        }

        const passCodeTimestamp = passCodeRows[0]!.passCode_timestamp;
        const oneHour = 3600; // 3600 seconds

        if (passCodeTimestamp < Math.floor(Date.now() / 1000) - oneHour) {
            return {
                error: true,
                error_message: 'expired pass code, over 1 hour old'
            };
        }

        await pool.execute(
            'DELETE FROM openmsg_passCodes WHERE self_openmsg_address = ? AND pass_code = ? LIMIT 1',
            [selfOpenmsgAddress, passCode]
        );

        const addressParts = otherOpenmsgAddress.split('*');
        if (addressParts.length !== 2) {
            return {
                error: true,
                error_message: 'Invalid openmsg address format'
            };
        }

        const [otherOpenmsgAddressId, otherOpenmsgAddressDomain] = addressParts;

        if (!/^\d+$/.test(otherOpenmsgAddressId!)) {
            return {
                error: true,
                error_message: 'other_openmsg_address_id should be numeric'
            };
        }

        const url = `https://${otherOpenmsgAddressDomain}/openmsg${settings.sandboxDir}/auth/confirm`;

        const requestData: AuthConfirmRequest = {
            other_openmsg_address: `${selfOpenmsgAddressId}*${settings.openmsgDomain}`,
            pass_code: passCode
        };

        let response;
        try {
            response = await axios.post<AuthConfirmResponse>(url, requestData, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
        } catch (error) {
            return {
                error: true,
                error_message: `Error. Request error: ${(error as Error).message}`
            };
        }

        if (response.status !== 200) {
            return {
                error: true,
                error_message: `Error. Response status: ${response.status}`
            };
        }

        const responseData = response.data;
        if (responseData.error) {
            return {
                error: true,
                error_message: `Error: ${responseData.error_message}`
            };
        }

        if (responseData.success !== true) {
            return {
                error: true,
                error_message: 'Error: Unsuccessful from /auth/'
            };
        }

        const authCode = generateAuthCode();
        const identCode = generateIdentCode();
        const messageCryptKey = generateMessageCryptKey();

        await pool.execute(
            'DELETE FROM openmsg_user_connections WHERE self_openmsg_address = ? AND other_openmsg_address = ?',
            [selfOpenmsgAddress, otherOpenmsgAddress]
        );

        await pool.execute(
            'INSERT INTO openmsg_user_connections (self_openmsg_address, other_openmsg_address, other_openmsg_address_name, other_acceptsMessages, auth_code, ident_code, message_crypt_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [selfOpenmsgAddress, otherOpenmsgAddress, otherOpenmsgAddressName, otherAllowsReplies ? 1 : 0, authCode, identCode, messageCryptKey]
        );

        return {
            success: true,
            auth_code: authCode,
            ident_code: identCode,
            message_crypt_key: messageCryptKey,
            receiving_openmsg_address_name: selfOpenmsgAddressName
        };

    } catch (error) {
        console.error('Database error in authCheck:', error);
        return {
            error: true,
            error_message: 'Database error'
        };
    }
}

async function authConfirm(otherOpenmsgAddress: string, passCode: string): Promise<AuthConfirmResponse> {
    try {
        // Query database to check for a pending authorization request
        const [rows] = await pool.execute<(OpenMsgHandshake & RowDataPacket & { initiation_timestamp: number })[]>(
            'SELECT UNIX_TIMESTAMP(timestamp) as initiation_timestamp FROM openmsg_handshakes WHERE other_openmsg_address = ? AND pass_code = ?',
            [otherOpenmsgAddress, passCode]
        );

        if (rows.length === 0) {
            return {
                error: true,
                error_message: `unknown pending authorization with ${otherOpenmsgAddress}, ${passCode}`
            };
        }

        const initiationTimestamp = rows[0]!.initiation_timestamp;
        const currentTimestamp = Math.floor(Date.now() / 1000);

        if (initiationTimestamp < currentTimestamp - 60) {
            return {
                error: true,
                error_message: 'expired handshake, over 60 seconds old'
            };
        }

        await pool.execute(
            'DELETE FROM openmsg_handshakes WHERE other_openmsg_address = ? AND pass_code = ? LIMIT 1',
            [otherOpenmsgAddress, passCode]
        );

        return {
            success: true
        };

    } catch (error) {
        console.error('Database error in authConfirm:', error);
        return {
            error: true,
            error_message: 'Database error'
        };
    }
}

export default router; 