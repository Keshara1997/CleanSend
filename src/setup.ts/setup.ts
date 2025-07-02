import { pool } from '../config/database';
import { generateRandomHex, createHash } from '../utils/crypto';
import settings from '../config/settings';

async function createTables(): Promise<void> {
    console.log('Creating OpenMsg database tables...');

    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_handshakes (
                id INT(6) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                other_openmsg_address VARCHAR(255) NOT NULL,
                pass_code VARCHAR(6) NOT NULL,
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Created openmsg_handshakes table');

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS openmsg_user_connections (
                id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                self_openmsg_address VARCHAR(255) NOT NULL,
                other_openmsg_address VARCHAR(255) NOT NULL,
                other_openmsg_address_name VARCHAR(40) NOT NULL,
                other_acceptsMessages INT(1) NOT NULL,
                auth_code VARCHAR(64) NOT NULL,
                ident_code VARCHAR(64) NOT NULL,
                message_crypt_key VARCHAR(64) NOT NULL,
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

async function createTestAccounts(): Promise<void> {
    console.log('\nCreating test accounts...');

    try {
        for (let i = 0; i < 2; i++) {
            const testAccAddress = `${i}*${settings.openmsgDomain}`;
            const testAccAddressName = "Test OpenMsg Account";
            const testAccPw = Math.floor(Math.random() * 9000000) + 1000000; // 7 digit random
            const testAccSalt = generateRandomHex(16);
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

async function setup(): Promise<void> {
    try {
        console.log('🚀 Starting OpenMsg setup...\n');

        await createTables();
        await createTestAccounts();

        console.log('\n🎉 Setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Update your .env file with your domain and database credentials');
        console.log('2. Run: npm start');
        console.log('3. Test the endpoints using the test accounts created above');

    } catch (error) {
        console.error('\n💥 Setup failed:', (error as Error).message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

if (require.main === module) {
    setup();
}

export { createTables, createTestAccounts }; 