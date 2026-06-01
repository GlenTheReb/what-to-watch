import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// This is required to make sure we don't crash if DATABASE_URL is missing during build time
// However, the app will crash at runtime if the DB is accessed without it.
const sql = neon(process.env.DATABASE_URL || "postgres://dummy:dummy@dummy/dummy");

export const db = drizzle(sql, { schema });
