import { Client } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const connectionString = process.env.SUPABASE_DB_URL;

async function run() {
  const client = new Client({
    connectionString,
  });

  await client.connect();

  const sql = fs.readFileSync('scratch/test_driver_settlements.sql', 'utf8');

  try {
    const res = await client.query(sql);
    console.log('Query executed successfully');
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
