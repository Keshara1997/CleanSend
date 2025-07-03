import crypto from 'crypto';
import { EncryptedMessage, MessagePackage } from '../type';

/**
 * Generate random bytes
 */
export function generateRandomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
}

/**
 * Generate random hex string
 */
export function generateRandomHex(length: number): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate auth code (64 chars hex)
 */
export function generateAuthCode(): string {
    return generateRandomHex(32);
}

/**
 * Generate ident code (64 chars hex)
 */
export function generateIdentCode(): string {
    return generateRandomHex(32);
}

/**
 * Generate message crypt key (64 chars hex)
 */
export function generateMessageCryptKey(): string {
    return generateRandomHex(32);
}

/**
 * Generate message salt (32 chars hex)
 */
export function generateMessageSalt(): string {
    return generateRandomHex(16);
}

/**
 * Encrypt message using AES-256-GCM
 */
export function encryptMessage(plaintext: string, key: string, nonce: Buffer): EncryptedMessage {
    const cipher = crypto.createCipher('aes-256-gcm', Buffer.from(key, 'hex'));
    cipher.setAAD(nonce);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return {
        encrypted,
        authTag: authTag.toString('base64'),
        nonce: nonce.toString('base64')
    };
}

/**
 * Decrypt message using AES-256-GCM
 */
export function decryptMessage(encryptedData: string, key: string, nonce: string, authTag: string): string | false {
    try {
        const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(key, 'hex'));
        decipher.setAAD(Buffer.from(nonce, 'base64'));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        return false;
    }
}

/**
 * Create message package (nonce + encrypted message)
 */
export function createMessagePackage(plaintext: string, key: string): MessagePackage {
    const nonce = generateRandomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', Buffer.from(key, 'hex'));

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();
    const packageBuffer = Buffer.concat([nonce, encrypted, authTag]);

    return {
        package: packageBuffer.toString('base64'),
        nonce: nonce.toString('base64')
    };
}

/**
 * Decrypt message package
 */
export function decryptMessagePackage(packageBase64: string, key: string): string | false {
    try {
        const packageBuffer = Buffer.from(packageBase64, 'base64');
        const nonce = packageBuffer.slice(0, 16);
        const authTag = packageBuffer.slice(-16);
        const encrypted = packageBuffer.slice(16, -16);

        const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(key, 'hex'));
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        return false;
    }
}

/**
 * Create SHA256 hash
 */
export function createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create message hash
 */
export function createMessageHash(messagePackage: string, authCode: string, messageSalt: string, messageTimestamp: number | string): string {
    const data = messagePackage + authCode + messageSalt + messageTimestamp.toString();
    return createHash(data);
} 