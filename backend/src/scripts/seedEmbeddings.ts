/**
 * One-time embedding setup (§2.8 step 2) — the ENTIRE embedding-API cost
 * surface in v1. Embeds the fixed InterestVocabulary and the authored
 * CategoryVibePrior descriptors with text-embedding-3-large (3072-d, matching
 * the vector(3072) columns), then upserts them into Supabase.
 *
 * Run: cd backend && npx tsx src/scripts/seedEmbeddings.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMBEDDING_MODEL = 'text-embedding-3-large'

/** Interest vocabulary: tag + authored description embedded together */
const INTEREST_VOCABULARY: Record<string, string> = {
  jazz: 'live jazz music, intimate concerts, saxophone, improvisation, smoky lounge vibes',
  'live music': 'live bands, concerts, gigs, music venues, energetic performances',
  wine: 'wine tasting, natural wine bars, sommeliers, vineyards, slow sipping evenings',
  'craft beer': 'craft breweries, IPA, taprooms, beer flights, casual hangouts',
  cocktails: 'craft cocktails, mixology, speakeasies, elegant bars, signature drinks',
  coffee: 'specialty coffee, espresso, pour-over, cozy cafes, latte art',
  brunch: 'weekend brunch, pancakes, mimosas, relaxed late mornings with friends',
  'fine dining': 'tasting menus, gourmet cuisine, chef-driven restaurants, special occasions',
  'street food': 'food trucks, markets, tacos, cheap authentic eats, casual bites',
  vegetarian: 'plant-based food, vegan restaurants, healthy bowls, sustainable eating',
  baking: 'artisan bakeries, fresh bread, pastries, croissants, dessert spots',
  running: 'running routes, jogging trails, 5k runs, outdoor cardio, morning runs',
  hiking: 'hiking trails, nature walks, mountain views, fresh air, weekend treks',
  cycling: 'bike rides, cycling routes, bike-friendly paths, urban cycling',
  yoga: 'yoga studios, mindfulness, stretching, meditation, calm movement',
  climbing: 'bouldering gyms, rock climbing, route problems, active community',
  swimming: 'pools, open water swimming, laps, aquatic sports',
  'team sports': 'pickup football, basketball courts, volleyball, social sports leagues',
  gym: 'strength training, fitness centers, weightlifting, workout sessions',
  'urban art': 'street art, murals, graffiti tours, independent galleries, creative neighborhoods',
  museums: 'museums, exhibitions, history, science, quiet contemplative wandering',
  photography: 'photogenic spots, golden hour, architecture photography, scenic viewpoints',
  theater: 'plays, performing arts, drama, stage productions, opening nights',
  cinema: 'independent cinema, film screenings, movie nights, festivals',
  reading: 'bookstores, libraries, quiet reading corners, literary cafes',
  history: 'historical landmarks, heritage sites, old towns, guided tours',
  architecture: 'notable buildings, brutalism, art deco, city design, walking tours',
  dancing: 'dance floors, salsa nights, clubs, social dancing, latin music',
  karaoke: 'karaoke rooms, singing with friends, fun late nights',
  'board games': 'board game cafes, tabletop nights, strategy games, casual competition',
  gaming: 'arcades, esports bars, retro gaming, multiplayer sessions',
  markets: 'farmers markets, flea markets, vintage stalls, local produce, browsing',
  picnics: 'parks, picnic blankets, outdoor lunches, sunny afternoons',
  gardens: 'botanical gardens, greenhouses, flowers, peaceful green spaces',
  'nature': 'wildlife, lakes, forests, scenic nature escapes within the city',
  'coworking': 'laptop-friendly cafes, coworking spaces, focused work sessions, good wifi',
  'tea': 'tea houses, matcha, quiet tearooms, slow afternoon rituals',
  'nightlife': 'nightclubs, DJ sets, late-night energy, dancing until sunrise',
  'family activities': 'kid-friendly outings, playgrounds, zoos, aquariums, family fun',
  'spa & wellness': 'spas, saunas, massages, self-care, deep relaxation',
}

/** Authored vibe descriptors per normalized Google place type (first-party editorial content) */
const CATEGORY_VIBE_PRIORS: Record<string, string> = {
  bar: 'lively, social, drinks with friends, buzzing conversation, evening energy',
  pub: 'casual, convivial, beer and banter, relaxed social gathering',
  wine_bar: 'intimate, low-lit, refined, slow conversation over wine, romantic',
  night_club: 'high energy, dancing, loud music, late night, crowded and electric',
  karaoke: 'playful, uninhibited, group fun, singing, laughter',
  restaurant: 'shared meals, conversation over food, social dining',
  cafe: 'cozy, relaxed, coffee aroma, reading or chatting, gentle background hum',
  coffee_shop: 'intimate, low-lit, quiet, focused, specialty coffee, laptop-friendly calm',
  tea_house: 'serene, slow, ritualistic, quiet warmth',
  bakery: 'warm, fresh-baked comfort, morning sweetness, casual stop',
  ice_cream_shop: 'cheerful, sweet, family-friendly, light-hearted treat',
  park: 'open air, green, unhurried, birdsong, restorative calm',
  garden: 'blooming, tranquil, contemplative strolling, natural beauty',
  playground: 'playful, children laughing, family energy, carefree',
  hiking_area: 'fresh air, effort and reward, natural escape, invigorating',
  gym: 'energetic, disciplined, sweat and focus, personal progress',
  fitness_center: 'active, driven, structured workouts, endorphins',
  sports_complex: 'competitive, team spirit, athletic buzz',
  swimming_pool: 'refreshing, rhythmic laps, light-hearted splash',
  stadium: 'roaring crowds, collective excitement, big-event energy',
  bicycle_store: 'practical, active lifestyle, gear talk, cycling community',
  museum: 'quiet contemplation, curiosity, deliberate wandering, cultural depth',
  art_gallery: 'aesthetic, thought-provoking, hushed appreciation, creative inspiration',
  performing_arts_theater: 'anticipation, dimming lights, collective attention, dramatic',
  historical_landmark: 'timeworn, storied, reflective, sense of place',
  cultural_center: 'community, ideas, exhibitions and talks, engaged curiosity',
  library: 'silent, studious, deep focus, endless shelves, calm concentration',
  book_store: 'browsing, literary, quiet discovery, cozy corners',
  movie_theater: 'shared darkness, immersion, popcorn, escapist',
  tourist_attraction: 'novel, memorable, discovery, snapshots and stories',
  market: 'bustling, sensory, local flavor, spontaneous finds',
  plaza: 'open, people-watching, urban heartbeat, meeting point',
  amusement_park: 'thrilling, joyful screams, family adventure, bright colors',
  zoo: 'wonder, family outing, animal encounters, leisurely walking',
  aquarium: 'calm blue light, gliding fish, quiet awe, family-friendly',
  spa: 'hushed, restorative, pampering, deep exhale, unhurried',
  bowling_alley: 'retro fun, friendly competition, group laughter',
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

function toLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

async function main() {
  const nowIso = new Date().toISOString()

  console.log(`Embedding ${Object.keys(INTEREST_VOCABULARY).length} interest tags...`)
  const tags = Object.keys(INTEREST_VOCABULARY)
  const tagVectors = await embedBatch(tags.map((t) => `${t}: ${INTEREST_VOCABULARY[t]}`))
  const { error: vocabError } = await supabase.from('interest_vocabulary').upsert(
    tags.map((tag, i) => ({ tag, vector: toLiteral(tagVectors[i]), updated_at: nowIso })),
    { onConflict: 'tag' },
  )
  if (vocabError) throw vocabError
  console.log('interest_vocabulary seeded.')

  console.log(`Embedding ${Object.keys(CATEGORY_VIBE_PRIORS).length} category vibe priors...`)
  const keys = Object.keys(CATEGORY_VIBE_PRIORS)
  const priorVectors = await embedBatch(keys.map((k) => CATEGORY_VIBE_PRIORS[k]))
  const { error: priorError } = await supabase.from('category_vibe_prior').upsert(
    keys.map((category_key, i) => ({
      category_key,
      descriptor: CATEGORY_VIBE_PRIORS[category_key],
      vector: toLiteral(priorVectors[i]),
      updated_at: nowIso,
    })),
    { onConflict: 'category_key' },
  )
  if (priorError) throw priorError
  console.log('category_vibe_prior seeded.')
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
