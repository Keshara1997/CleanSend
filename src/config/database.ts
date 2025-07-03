import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { DatabaseConfig } from '../type';


dotenv.config();

const dbConfig: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'openmsg_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

export const pool = mysql.createPool(dbConfig);

export async function testConnection(): Promise<boolean> {
    try {
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('Failed to connect to database:', (error as Error).message);
        return false;
    }
} 