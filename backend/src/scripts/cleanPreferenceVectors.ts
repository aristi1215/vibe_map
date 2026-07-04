/**
 * One-off cleanup: delete all learned mood-preference vectors.
 *
 * Before the feedback fixes of 2026-07-04, a user's FIRST negative rating seeded
 * their learned vector from the disliked place itself, and all learning happened
 * at category level — so existing user_preference_vector rows may point taste
 * profiles at exactly the places users rejected. Wiping them lets the fixed
 * feedback loop relearn from scratch; explicit interests (user_interest,
 * base_preference_vector) are untouched and keep driving recommendations.
 *
 * Run: cd backend && npx tsx src/scripts/cleanPreferenceVectors.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { count: before } = await supabase
    .from('user_preference_vector')
    .select('*', { count: 'exact', head: true })

  const { error } = await supabase
    .from('user_preference_vector')
    .delete()
    .not('user_id', 'is', null) // Supabase requires a filter; matches every row
  if (error) throw error

  console.log(`Deleted ${before ?? 0} learned preference vector(s). Explicit interests untouched.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
