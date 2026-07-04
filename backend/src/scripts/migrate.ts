import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error(
    'Missing DATABASE_URL in backend/.env\n' +
    'Find it in: Supabase Dashboard → Project Settings → Database → Connection string (URI mode)\n' +
    'It looks like: postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres',
  )
  process.exit(1)
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

const migrationPath = join(__dirname, '../../../supabase/migrations/001_initial_schema.sql')
const sql = readFileSync(migrationPath, 'utf-8')

console.log('Connecting to database...')
await client.connect()

console.log('Running migration 001_initial_schema.sql ...')

try {
  await client.query(sql)
  console.log('Migration complete.')
} catch (err) {
  console.error('Migration failed:', (err as Error).message)
  process.exit(1)
} finally {
  await client.end()
}
