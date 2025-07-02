// OpenMsg Protocol - Main Library Export
// This file serves as the entry point for the npm package

// Export all types
export * from './types/index';

// Export configuration utilities
export { default as settings } from './config/settings';
export { pool, testConnection } from './config/database';

// Export crypto utilities
export * from './utils/crypto';

// Export route handlers for custom server implementations
export { default as authRoutes } from './routes/auth';
export { default as messageRoutes } from './routes/messages';
export { default as setupRoutes } from './routes/setup';

// Export the main server (for those who want to use the full server)
export { default as OpenMsgServer } from './server';

// Export client class for easy integration
export { OpenMsgClient } from './client';

// Re-export commonly used types for convenience
export type {
    OpenMsgSettings,
    DatabaseConfig,
    AuthRequest,
    AuthResponse,
    MessageReceiveRequest,
    MessageReceiveResponse,
    SendMessageRequest,
    SendMessageResponse,
    InitiateHandshakeRequest,
    InitiateHandshakeResponse,
    RequestPassCodeRequest,
    RequestPassCodeResponse
} from './types/index'; 