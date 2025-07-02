// OpenMsg Protocol Type Definitions

export interface OpenMsgSettings {
    openmsgDomain: string;
    sandbox: boolean;
    sandboxDir: string;
    port: number;
    nodeEnv: string;
}

export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
}

// Database Models
export interface OpenMsgUser {
    id: number;
    self_openmsg_address: string;
    self_openmsg_address_name: string;
    password: string;
    password_salt: string;
    timestamp_created: Date;
}

export interface OpenMsgHandshake {
    id: number;
    other_openmsg_address: string;
    pass_code: string;
    timestamp: Date;
}

export interface OpenMsgUserConnection {
    id: number;
    self_openmsg_address: string;
    other_openmsg_address: string;
    other_openmsg_address_name: string;
    other_acceptsMessages: number;
    auth_code: string;
    ident_code: string;
    message_crypt_key: string;
    timestamp_created: Date;
}

export interface OpenMsgPassCode {
    id: number;
    self_openmsg_address: string;
    pass_code: string;
    timestamp: Date;
}

export interface OpenMsgMessageOutbox {
    id: number;
    self_openmsg_address: string;
    ident_code: string;
    message_hash: string;
    message_nonce: string;
    message_text: string;
    timestamp_created: Date;
}

export interface OpenMsgMessageSent {
    id: number;
    self_openmsg_address: string;
    ident_code: string;
    message_hash: string;
    message_text: string;
    timestamp_read?: number;
    timestamp_created: Date;
}

export interface OpenMsgMessageInbox {
    id: number;
    self_openmsg_address: string;
    ident_code: string;
    message_hash: string;
    message_text: string;
    timestamp_created: Date;
}

// API Request/Response Types
export interface AuthRequest {
    receiving_openmsg_address_id: string;
    pass_code: string;
    sending_openmsg_address: string;
    sending_openmsg_address_name: string;
    sending_allow_replies: boolean;
    openmsg_version?: number;
}

export interface AuthResponse {
    success?: boolean;
    error?: boolean;
    auth_code?: string;
    ident_code?: string;
    message_crypt_key?: string;
    receiving_openmsg_address_name?: string;
    error_message?: string;
}

export interface AuthConfirmRequest {
    other_openmsg_address: string;
    pass_code: string;
}

export interface AuthConfirmResponse {
    success?: boolean;
    error?: boolean;
    error_message?: string;
}

export interface MessageReceiveRequest {
    receiving_openmsg_address_id: string;
    sending_openmsg_address_name?: string;
    ident_code: string;
    message_package: string;
    message_hash: string;
    message_salt: string;
    message_timestamp: number;
    openmsg_version?: number;
    verified_account?: {
        verified_account_signature?: string;
        verified_account_name?: string;
        verified_account_expires?: string;
    };
}

export interface MessageReceiveResponse {
    success?: boolean;
    error?: boolean;
    response_code: string;
    error_message?: string;
}

export interface MessageConfirmRequest {
    message_hash: string;
    message_nonce: string;
}

export interface MessageConfirmResponse {
    success?: boolean;
    error?: boolean;
    error_message?: string;
}

export interface InitiateHandshakeRequest {
    other_openmsg_address: string;
    pass_code: string;
}

export interface InitiateHandshakeResponse {
    success?: boolean;
    error?: boolean;
    message: string;
}

export interface SendMessageRequest {
    message_text: string;
    sending_openmsg_address: string;
    receiving_openmsg_address: string;
}

export interface SendMessageResponse {
    success?: boolean;
    error?: boolean;
    response_code: string;
    error_message?: string;
}

export interface RequestPassCodeRequest {
    self_openmsg_address: string;
}

export interface RequestPassCodeResponse {
    success?: boolean;
    error?: boolean;
    pass_code?: string;
    message?: string;
    error_message?: string;
}

// Crypto Types
export interface MessagePackage {
    package: string;
    nonce: string;
}

export interface EncryptedMessage {
    encrypted: string;
    authTag: string;
    nonce: string;
}

// Error Types
export type OpenMsgErrorCode =
    | 'SM_E001'
    | 'SM_E002'
    | 'SM_E003'
    | 'SM_E004'
    | 'SM_E005';

export type OpenMsgSuccessCode = 'SM_S888';

export type OpenMsgResponseCode = OpenMsgErrorCode | OpenMsgSuccessCode;

// Utility Types
export interface ApiError {
    error: true;
    error_message: string;
    response_code?: OpenMsgErrorCode;
}

export interface ApiSuccess<T = any> {
    success: true;
    response_code?: OpenMsgSuccessCode;
    data?: T;
}

export type ApiResponse<T = any> = ApiError | ApiSuccess<T>; 