/**
 * OpenMsg Database Setup and Initialization
 * 
 * This script initializes the MySQL database for the OpenMsg protocol by:
 * 1. Creating all required database tables
 * 2. Setting up test user accounts for development
 * 
 * Usage:
 * - Run via npm script: `npm run setup`
 * - Or directly: `npx ts-node src/setup.ts/setup.ts`
 * 
 * Tables Created:
 * - openmsg_users: User accounts and credentials
 * - openmsg_user_connections: Established connections with encryption keys
 * - openmsg_handshakes: Temporary handshake records for authentication
 * - openmsg_passCodes: One-time pass codes for authorization
 * - openmsg_messages_inbox: Received messages
 * - openmsg_messages_outbox: Pending message confirmations
 * - openmsg_messages_sent: Confirmed sent messages
 */

import { pool } from '../config/database';
import { generateRandomHex, createHash } from '../utils/crypto';
import settings from '../config/settings';

/**
 * Create all required database tables for the OpenMsg protocol
 * 
 * Tables are created with appropriate indexes and constraints for:
 * - Performance optimization
 * - Data integrity
 * - Security considerations
 */
async function createTables(): Promise<void> {
    console.log('Creating OpenMsg database tables...');

    try {
        // Handshake table: Stores temporary handshake records for connection establishment
        // Expires automatically after 60 seconds for security
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_handshakes (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                other_openmsg_address VARCHAR(255) NOT NULL,    -- Address of user we're connecting to
                pass_code VARCHAR(6) NOT NULL,                  -- 6-digit authentication code
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP  -- When handshake was initiated
            )
        `);
        console.log('✓ Created openmsg_handshakes table');

        // User connections table: Stores established connections with encryption keys
        // Each connection has unique auth codes and encryption keys for security
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_user_connections (
                id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,     -- Our OpenMsg address
                other_openmsg_address VARCHAR(255) NOT NULL,    -- The other user's address
                other_openmsg_address_name VARCHAR(40) NOT NULL, -- The other user's display name
                other_acceptsMessages INT(1) NOT NULL,          -- Whether other user accepts messages (1/0)
                auth_code VARCHAR(64) NOT NULL,                 -- Authentication code for message verification
                ident_code VARCHAR(64) NOT NULL,                -- Identity code for this connection
                message_crypt_key VARCHAR(64) NOT NULL,         -- AES-256 encryption key for messages
                timestamp_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_user_connections table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_messages_outbox (
                id INT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,
                ident_code VARCHAR(64) NOT NULL,
                message_hash VARCHAR(64) NOT NULL,
                message_nonce VARCHAR(32) NOT NULL,
                message_text VARCHAR(2000) NOT NULL,
                timestamp_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_messages_outbox table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_messages_sent (
                id INT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,
                ident_code VARCHAR(64) NOT NULL,
                message_hash VARCHAR(64) NOT NULL,
                message_text VARCHAR(2000) NOT NULL,
                timestamp_read INT(12),
                timestamp_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_messages_sent table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_passCodes (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,
                pass_code VARCHAR(6) NOT NULL,
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_passCodes table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_messages_inbox (
                id INT(20) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,
                ident_code VARCHAR(64) NOT NULL,
                message_hash VARCHAR(64) NOT NULL,
                message_text VARCHAR(2000) NOT NULL,
                timestamp_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_messages_inbox table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_users (
                id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL UNIQUE,
                self_openmsg_address_name VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                password_salt VARCHAR(64) NOT NULL,
                timestamp_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_users table');

        console.log('\n✅ All tables created successfully!');
    } catch (error) {
        console.error('❌ Error creating tables:', (error as Error).message);
        throw error;
    }
}

/**
 * Create test user accounts for development and testing
 * 
 * Creates 2 test accounts with:
 * - Sequential numeric IDs (0, 1)
 * - Random 7-digit passwords
 * - Proper password hashing with salt
 * 
 * These accounts can be used for testing the handshake and messaging flows.
 */
async function createTestAccounts(): Promise<void> {
    console.log('\nCreating test accounts...');

    try {
        // Create 2 test accounts for testing messaging between users
        for (let i = 0; i < 2; i++) {
            const testAccAddress = `${i}*${settings.openmsgDomain}`;
            const testAccAddressName = "Test OpenMsg Account";

            // Generate random 7-digit password for security
            const testAccPw = Math.floor(1000000 + Math.random() * 9000000);

            // Create salt and hash password using the same method as production
            const testAccSalt = generateRandomHex(16);  // 32-character hex salt
            const testAccPwHash = createHash(testAccPw.toString() + testAccSalt);

            await pool.execute(
                'INSERT INTO openmsg_users (self_openmsg_address, self_openmsg_address_name, password, password_salt) VALUES (?, ?, ?, ?)',
                [testAccAddress, testAccAddressName, testAccPwHash, testAccSalt]
            );

            console.log(`✓ Created test account: ${testAccAddress} (password: ${testAccPw})`);
        }

        console.log('\n✅ Test accounts created successfully!');
    } catch (error) {
        console.error('❌ Error creating test accounts:', (error as Error).message);
        throw error;
    }
}

/**
 * Main setup function
 * 
 * Orchestrates the complete database setup process:
 * 1. Creates all required tables
 * 2. Sets up test accounts
 * 3. Provides next steps for the user
 */
async function setup(): Promise<void> {
    try {
        console.log('🚀 Starting OpenMsg setup...\n');
        console.log(`📍 Setting up for domain: ${settings.openmsgDomain}`);
        console.log(`🔧 Environment: ${settings.nodeEnv}`);
        console.log(`📦 Sandbox mode: ${settings.sandbox ? 'ON' : 'OFF'}\n`);

        // Create database structure
        await createTables();

        // Create test accounts for development
        await createTestAccounts();

        console.log('\n🎉 Setup completed successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. Update your .env file with your domain and database credentials');
        console.log('2. Start the server: npm run dev (development) or npm start (production)');
        console.log('3. Test the endpoints using the test accounts created above');
        console.log('4. Check health endpoint: http://localhost:3000/health');
        console.log('5. View API info: http://localhost:3000/openmsg/info');

        if (settings.sandbox) {
            console.log('\n⚠️  Running in SANDBOX mode - remember to disable for production');
        }

    } catch (error) {
        console.error('\n💥 Setup failed:', (error as Error).message);
        console.error('\n🔍 Troubleshooting:');
        console.error('1. Check your database connection settings in .env');
        console.error('2. Ensure MySQL server is running');
        console.error('3. Verify database user has CREATE TABLE permissions');
        process.exit(1);
    } finally {
        // Close database connection pool
        await pool.end();
        process.exit(0);
    }
}

// Run setup only if this file is executed directly
if (require.main === module) {
    setup();
}

// Export functions for use in other modules or testing
export { createTables, createTestAccounts };
