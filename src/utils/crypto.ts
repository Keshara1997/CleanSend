/**
 * Cryptographic Utilities for OpenMsg Protocol
 * 
 * This module provides secure cryptographic functions for the OpenMsg messaging protocol:
 * - AES-256-GCM encryption for message confidentiality and integrity
 * - SHA-256 hashing for message verification
 * - Secure random generation for keys, nonces, and authentication codes
 * 
 * Security Features:
 * - Authenticated encryption prevents tampering
 * - Unique nonces prevent replay attacks
 * - Strong random generation for cryptographic security
 * - Message authentication codes for integrity verification
 */

import crypto from 'crypto';
import { EncryptedMessage, MessagePackage } from '../type';

/**
 * Generate cryptographically secure random bytes
 * 
 * @param length - Number of bytes to generate
 * @returns Buffer containing random bytes
 */
export function generateRandomBytes(length: number): Buffer {
    return crypto.randomBytes(length);
}

/**
 * Generate cryptographically secure random hex string
 * 
 * @param length - Number of bytes to generate (output will be 2x chars)
 * @returns Hex string of random data
 */
export function generateRandomHex(length: number): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate authentication code for connection establishment
 * Used to authenticate messages between connected OpenMsg users
 * 
 * @returns 64-character hex string (256 bits of entropy)
 */
export function generateAuthCode(): string {
    return generateRandomHex(32);  // 32 bytes = 64 hex chars
}

/**
 * Generate identity code for user connection identification
 * Unique identifier for each connection between two OpenMsg users
 * 
 * @returns 64-character hex string (256 bits of entropy)
 */
export function generateIdentCode(): string {
    return generateRandomHex(32);  // 32 bytes = 64 hex chars
}

/**
 * Generate message encryption key for AES-256 encryption
 * Each user connection gets a unique encryption key for end-to-end security
 * 
 * @returns 64-character hex string (256 bits for AES-256)
 */
export function generateMessageCryptKey(): string {
    return generateRandomHex(32);  // 32 bytes = 256 bits for AES-256
}

/**
 * Generate message salt for hash verification
 * Prevents rainbow table attacks on message hashes
 * 
 * @returns 32-character hex string (128 bits of entropy)
 */
export function generateMessageSalt(): string {
    return generateRandomHex(16);  // 16 bytes = 32 hex chars
}

/**
 * Encrypt message using AES-256-GCM authenticated encryption
 * 
 * AES-256-GCM provides:
 * - Confidentiality: Message content is encrypted
 * - Integrity: Tampering is detected via authentication tag
 * - Authentication: Prevents unauthorized decryption
 * 
 * @param plaintext - Message text to encrypt
 * @param key - 256-bit encryption key (hex string)
 * @param nonce - Unique nonce for this encryption (Buffer)
 * @returns EncryptedMessage with encrypted data, auth tag, and nonce
 */
export function encryptMessage(plaintext: string, key: string, nonce: Buffer): EncryptedMessage {
    // Create AES-256-GCM cipher with the provided key
    const cipher = crypto.createCipher('aes-256-gcm', Buffer.from(key, 'hex'));

    // Set Additional Authenticated Data (AAD) - nonce is authenticated but not encrypted
    cipher.setAAD(nonce);

    // Encrypt the plaintext message
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag for integrity verification
    const authTag = cipher.getAuthTag();

    return {
        encrypted,                           // Base64-encoded encrypted message
        authTag: authTag.toString('base64'), // Base64-encoded authentication tag
        nonce: nonce.toString('base64')      // Base64-encoded nonce
    };
}

/**
 * Decrypt message using AES-256-GCM authenticated decryption
 * 
 * Verifies message integrity and authenticity before decryption.
 * Returns false if the message has been tampered with or is corrupted.
 * 
 * @param encryptedData - Base64-encoded encrypted message
 * @param key - 256-bit decryption key (hex string)
 * @param nonce - Base64-encoded nonce used during encryption
 * @param authTag - Base64-encoded authentication tag for verification
 * @returns Decrypted plaintext string, or false if decryption fails
 */
export function decryptMessage(encryptedData: string, key: string, nonce: string, authTag: string): string | false {
    try {
        // Create AES-256-GCM decipher with the provided key
        const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(key, 'hex'));

        // Set Additional Authenticated Data (same as during encryption)
        decipher.setAAD(Buffer.from(nonce, 'base64'));

        // Set authentication tag for integrity verification
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));

        // Decrypt the message
        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Decryption failed - message was tampered with or corrupted
        return false;
    }
}

/**
 * Create encrypted message package with embedded nonce
 * 
 * This is the primary encryption function used for OpenMsg protocol.
 * Creates a self-contained package with nonce, encrypted data, and auth tag.
 * 
 * @param plaintext - Message text to encrypt
 * @param key - 256-bit encryption key (hex string)
 * @returns MessagePackage with base64-encoded package and nonce
 */
export function createMessagePackage(plaintext: string, key: string): MessagePackage {
    // Generate random 16-byte nonce for this message
    const nonce = generateRandomBytes(16);

    // Create AES-256-GCM cipher
    const cipher = crypto.createCipher('aes-256-gcm', Buffer.from(key, 'hex'));

    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Create package: nonce + encrypted_data + auth_tag
    const packageBuffer = Buffer.concat([nonce, encrypted, authTag]);

    return {
        package: packageBuffer.toString('base64'),  // Complete encrypted package
        nonce: nonce.toString('base64')            // Nonce for verification
    };
}

/**
 * Decrypt message package created by createMessagePackage
 * 
 * Extracts nonce, encrypted data, and auth tag from the package,
 * then performs authenticated decryption.
 * 
 * @param packageBase64 - Base64-encoded message package
 * @param key - 256-bit decryption key (hex string)
 * @returns Decrypted plaintext string, or false if decryption fails
 */
export function decryptMessagePackage(packageBase64: string, key: string): string | false {
    try {
        // Decode the package buffer
        const packageBuffer = Buffer.from(packageBase64, 'base64');

        // Extract components: nonce (first 16 bytes), auth tag (last 16 bytes), encrypted data (middle)
        const nonce = packageBuffer.slice(0, 16);
        const authTag = packageBuffer.slice(-16);
        const encrypted = packageBuffer.slice(16, -16);

        // Create AES-256-GCM decipher
        const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(key, 'hex'));

        // Set authentication tag for verification
        decipher.setAuthTag(authTag);

        // Decrypt the message
        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Decryption failed - package was corrupted or key is wrong
        return false;
    }
}

/**
 * Create SHA-256 hash of input data
 * 
 * Used for message integrity verification and creating message fingerprints.
 * SHA-256 provides strong collision resistance and is cryptographically secure.
 * 
 * @param data - Data to hash
 * @returns Hex string of SHA-256 hash
 */
export function createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Create message verification hash for OpenMsg protocol
 * 
 * This hash is used to verify that a message came from an authorized sender
 * and hasn't been tampered with. It combines multiple elements to prevent
 * replay attacks and unauthorized message sending.
 * 
 * Hash Components:
 * - messagePackage: The encrypted message content
 * - authCode: Authentication code from connection establishment
 * - messageSalt: Random salt to prevent rainbow table attacks
 * - messageTimestamp: Timestamp to prevent replay attacks
 * 
 * @param messagePackage - Base64-encoded encrypted message package
 * @param authCode - Authentication code from user connection
 * @param messageSalt - Random salt for this message
 * @param messageTimestamp - Unix timestamp when message was created
 * @returns SHA-256 hash for message verification
 */
export function createMessageHash(messagePackage: string, authCode: string, messageSalt: string, messageTimestamp: number | string): string {
    // Concatenate all components for hashing
    const data = messagePackage + authCode + messageSalt + messageTimestamp.toString();
    return createHash(data);
} 