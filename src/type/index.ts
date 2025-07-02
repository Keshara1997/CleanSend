/**
 * OpenMsg Protocol Type Definitions
 * 
 * This module contains all TypeScript interfaces and types used throughout
 * the CleanSend OpenMsg Protocol implementation. These types ensure type safety
 * and provide clear contracts for data structures, API requests/responses,
 * and database models.
 */

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Application settings configuration
 * Contains environment-specific settings for the OpenMsg server
 */
export interface OpenMsgSettings {
    openmsgDomain: string;    // Domain name for this OpenMsg server (e.g., "example.com")
    sandbox: boolean;         // Whether to run in sandbox/testing mode
    sandboxDir: string;       // URL path prefix for sandbox mode ("/sandbox" or "")
    port: number;             // HTTP server port number
    nodeEnv: string;          // Application environment ("development" or "production")
}

/**
 * Database connection configuration
 * MySQL connection pool settings
 */
export interface DatabaseConfig {
    host: string;               // MySQL server hostname
    user: string;               // Database username
    password: string;           // Database password
    database: string;           // Database name
    waitForConnections: boolean; // Whether to queue requests when pool is full
    connectionLimit: number;    // Maximum concurrent connections in pool
    queueLimit: number;         // Maximum queued requests (0 = unlimited)
}

// =============================================================================
// DATABASE MODEL TYPES
// =============================================================================

/**
 * OpenMsg user account stored in the database
 * Represents a registered user on this OpenMsg server
 */
export interface OpenMsgUser {
    id: number;                        // Unique user ID (auto-increment)
    self_openmsg_address: string;      // Full OpenMsg address (e.g., "12345*example.com")
    self_openmsg_address_name: string; // Human-readable name for this user
    password: string;                  // Hashed password (bcrypt)
    password_salt: string;             // Salt used for password hashing
    timestamp_created: Date;           // When this user account was created
}

/**
 * Temporary handshake record for connection establishment
 * Used during the authentication process between two OpenMsg users
 */
export interface OpenMsgHandshake {
    id: number;                    // Unique handshake ID
    other_openmsg_address: string; // Address of the user we're trying to connect to
    pass_code: string;             // One-time pass code for authentication
    timestamp: Date;               // When this handshake was initiated (expires after 60s)
}

/**
 * Established connection between two OpenMsg users
 * Contains encryption keys and authentication data for secure messaging
 */
export interface OpenMsgUserConnection {
    id: number;                          // Unique connection ID
    self_openmsg_address: string;        // Our OpenMsg address
    other_openmsg_address: string;       // The other user's OpenMsg address
    other_openmsg_address_name: string;  // The other user's display name
    other_acceptsMessages: number;       // Whether the other user accepts messages (1/0)
    auth_code: string;                   // Authentication code for message verification
    ident_code: string;                  // Identity code for this connection
    message_crypt_key: string;           // AES-256 key for message encryption
    timestamp_created: Date;             // When this connection was established
}

/**
 * One-time pass codes for authentication
 * Used to authorize new connections between OpenMsg users
 */
export interface OpenMsgPassCode {
    id: number;                    // Unique pass code ID
    self_openmsg_address: string;  // Address this pass code belongs to
    pass_code: string;             // 6-digit numeric pass code
    timestamp: Date;               // When this pass code was generated (expires after 1 hour)
}

/**
 * Outgoing messages waiting for delivery confirmation
 * Messages are moved here after being sent but before confirmation
 */
export interface OpenMsgMessageOutbox {
    id: number;                    // Unique message ID
    self_openmsg_address: string;  // Sender's OpenMsg address
    ident_code: string;            // Connection identity code
    message_hash: string;          // SHA-256 hash for message verification
    message_nonce: string;         // Nonce used in message encryption
    message_text: string;          // Original plaintext message
    timestamp_created: Date;       // When this message was sent
}

/**
 * Successfully sent messages archive
 * Messages are moved here after delivery confirmation
 */
export interface OpenMsgMessageSent {
    id: number;                    // Unique message ID
    self_openmsg_address: string;  // Sender's OpenMsg address
    ident_code: string;            // Connection identity code
    message_hash: string;          // SHA-256 hash for message verification
    message_text: string;          // Original plaintext message
    timestamp_read?: number;       // Unix timestamp when message was read (optional)
    timestamp_created: Date;       // When this message was sent
}

/**
 * Received messages inbox
 * Stores decrypted messages received from other OpenMsg users
 */
export interface OpenMsgMessageInbox {
    id: number;                    // Unique message ID
    self_openmsg_address: string;  // Recipient's OpenMsg address
    ident_code: string;            // Connection identity code
    message_hash: string;          // SHA-256 hash for message verification
    message_text: string;          // Decrypted plaintext message
    timestamp_created: Date;       // When this message was received
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Authentication request from another OpenMsg server
 * Sent when a user wants to establish a connection with a user on this server
 */
export interface AuthRequest {
    receiving_openmsg_address_id: string;  // The recipient's user ID on this server
    pass_code: string;                     // One-time pass code from recipient
    sending_openmsg_address: string;       // Full address of the sender
    sending_openmsg_address_name: string;  // Display name of the sender
    sending_allow_replies: boolean;        // Whether sender accepts reply messages
    openmsg_version?: number;              // OpenMsg protocol version (optional)
}

/**
 * Authentication response sent back to requesting server
 * Contains connection credentials if authentication succeeds
 */
export interface AuthResponse {
    success?: boolean;                         // True if authentication succeeded
    error?: boolean;                           // True if authentication failed
    auth_code?: string;                        // Authentication code for future messages
    ident_code?: string;                       // Identity code for this connection
    message_crypt_key?: string;                // AES-256 encryption key for messages
    receiving_openmsg_address_name?: string;   // Display name of the recipient
    error_message?: string;                    // Error description if failed
}

/**
 * Authentication confirmation request
 * Sent to confirm that a handshake request is legitimate
 */
export interface AuthConfirmRequest {
    other_openmsg_address: string;  // Address of the user requesting connection
    pass_code: string;              // Pass code that was used in the auth request
}

/**
 * Authentication confirmation response
 * Confirms whether the handshake request was legitimate
 */
export interface AuthConfirmResponse {
    success?: boolean;      // True if confirmation succeeded
    error?: boolean;        // True if confirmation failed
    error_message?: string; // Error description if failed
}

/**
 * Message receive request from another OpenMsg server
 * Contains an encrypted message for delivery to a user on this server
 */
export interface MessageReceiveRequest {
    receiving_openmsg_address_id: string;  // Recipient's user ID on this server
    sending_openmsg_address_name?: string; // Sender's display name (optional)
    ident_code: string;                    // Connection identity code
    message_package: string;               // Base64-encoded encrypted message package
    message_hash: string;                  // SHA-256 verification hash
    message_salt: string;                  // Random salt used in hash calculation
    message_timestamp: number;             // Unix timestamp when message was created
    openmsg_version?: number;              // OpenMsg protocol version (optional)
    verified_account?: {                   // Optional verified account information
        verified_account_signature?: string;
        verified_account_name?: string;
        verified_account_expires?: string;
    };
}

/**
 * Message receive response sent back to sending server
 * Indicates whether the message was successfully received and processed
 */
export interface MessageReceiveResponse {
    success?: boolean;      // True if message was received successfully
    error?: boolean;        // True if message processing failed
    response_code: string;  // Success/error code (e.g., "SM_S888" or "SM_E001")
    error_message?: string; // Error description if failed
}

/**
 * Message confirmation request
 * Sent to verify that a message originated from the claiming server
 */
export interface MessageConfirmRequest {
    message_hash: string;  // SHA-256 hash of the message being confirmed
    message_nonce: string; // Nonce from the message encryption
}

/**
 * Message confirmation response
 * Confirms whether the message is authentic
 */
export interface MessageConfirmResponse {
    success?: boolean;      // True if message is confirmed as authentic
    error?: boolean;        // True if confirmation failed
    error_message?: string; // Error description if failed
}

/**
 * Handshake initiation request (setup/testing endpoint)
 * Used to start a connection with another OpenMsg user
 */
export interface InitiateHandshakeRequest {
    other_openmsg_address: string;  // Full address of user to connect with
    pass_code: string;              // Pass code obtained from that user
}

/**
 * Handshake initiation response
 * Result of attempting to establish a connection
 */
export interface InitiateHandshakeResponse {
    success?: boolean;  // True if handshake was successful
    error?: boolean;    // True if handshake failed
    message: string;    // Status message describing the result
}

/**
 * Send message request (setup/testing endpoint)
 * Used to send a message to a connected user
 */
export interface SendMessageRequest {
    message_text: string;             // Plaintext message to send
    sending_openmsg_address: string;  // Sender's full OpenMsg address
    receiving_openmsg_address: string; // Recipient's full OpenMsg address
}

/**
 * Send message response
 * Result of attempting to send a message
 */
export interface SendMessageResponse {
    success?: boolean;      // True if message was sent successfully
    error?: boolean;        // True if sending failed
    response_code: string;  // Success/error code
    error_message?: string; // Error description if failed
}

/**
 * Pass code request (setup/testing endpoint)
 * Used to generate a one-time authentication code
 */
export interface RequestPassCodeRequest {
    self_openmsg_address: string;  // Address to generate pass code for
}

/**
 * Pass code response
 * Contains the generated pass code
 */
export interface RequestPassCodeResponse {
    success?: boolean;      // True if pass code was generated
    error?: boolean;        // True if generation failed
    pass_code?: string;     // The 6-digit pass code
    message?: string;       // Status message
    error_message?: string; // Error description if failed
}

// =============================================================================
// CRYPTOGRAPHY TYPES
// =============================================================================

/**
 * Encrypted message package for transmission
 * Contains all components needed for secure message delivery
 */
export interface MessagePackage {
    package: string;  // Base64-encoded encrypted package (nonce + encrypted_data + auth_tag)
    nonce: string;    // Base64-encoded nonce used for encryption
}

/**
 * Encrypted message components
 * Used for detailed encryption/decryption operations
 */
export interface EncryptedMessage {
    encrypted: string;  // Base64-encoded encrypted message data
    authTag: string;    // Base64-encoded authentication tag for integrity
    nonce: string;      // Base64-encoded nonce used for encryption
}

// =============================================================================
// ERROR HANDLING TYPES
// =============================================================================

/**
 * OpenMsg protocol error codes
 * Standardized error codes for different failure scenarios
 */
export type OpenMsgErrorCode =
    | 'SM_E001'  // User not known - recipient not found on this server
    | 'SM_E002'  // Sender not authorized - no valid connection exists
    | 'SM_E003'  // Message did not originate from correct domain
    | 'SM_E004'  // Could not recreate hash / auth_code mismatch
    | 'SM_E005'; // Hash expired or could not decrypt message

/**
 * OpenMsg protocol success codes
 * Indicates successful message processing
 */
export type OpenMsgSuccessCode = 'SM_S888'; // Success, message accepted and delivered

/**
 * Combined success/error response codes
 */
export type OpenMsgResponseCode = OpenMsgErrorCode | OpenMsgSuccessCode;

/**
 * Standardized API error response
 * Used for all error responses in the OpenMsg protocol
 */
export interface ApiError {
    error: true;                        // Always true for error responses
    error_message: string;              // Human-readable error description
    response_code?: OpenMsgErrorCode;   // Optional protocol error code
}

/**
 * Standardized API success response
 * Used for successful operations with optional data payload
 */
export interface ApiSuccess<T = any> {
    success: true;                       // Always true for success responses
    response_code?: OpenMsgSuccessCode;  // Optional protocol success code
    data?: T;                           // Optional response data
}

/**
 * Union type for all API responses
 * Every API endpoint returns either success or error
 */
export type ApiResponse<T = any> = ApiError | ApiSuccess<T>; 