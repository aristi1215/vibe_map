import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { fetchViewportPlaces } from './../services/placesService.js'
import { getPlaceDetails, getRichDetails, searchText } from '../services/googlePlaces.js'
import { supabase } from '../lib/supabase.js'
import { MOOD_CATEGORIES, isMood } from '../services/moodMapping.js'

export const placesRouter = Router()

const viewportSchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  mood: z.string().optional(),
})

/**
 * GET /api/places?north=&south=&east=&west=[&mood=]
 * Viewport-based live fetch with geo-cell throttling (§2.2.1–2.2.2).
 * Google content in the response is ephemeral — never persisted server-side.
 */
placesRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const parsed = viewportSchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid viewport bounds', details: parsed.error.flatten() })
      return
    }
    const { north, south, east, west, mood } = parsed.data
    const includedTypes = mood && isMood(mood) ? MOOD_CATEGORIES[mood] : undefined
    const places = await fetchViewportPlaces({ north, south, east, west }, includedTypes)
    res.json({ places })
  } catch (err) {
    next(err)
  }
})

const searchSchema = z.object({
  q: z.string().min(1).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

/** GET /api/places/search?q=&lat=&lng= — text search for the map search bar. */
placesRouter.get('/search', requireUser, async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid search query' })
      return
    }
    const { q, lat, lng } = parsed.data
    const results = await searchText(q, lat, lng)
    res.json({ results })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/places/details/:googlePlaceId — rich, Google-Maps-style live details
 * (photos, rating, reviews, hours, contact). Ephemeral; nothing persisted.
 */
placesRouter.get('/details/:googlePlaceId', requireUser, async (req, res, next) => {
  try {
    const details = await getRichDetails(String(req.params.googlePlaceId))
    if (!details) {
      res.status(404).json({ error: 'Place not found' })
      return
    }
    const { data: skeleton } = await supabase
      .from('place')
      .select('id')
      .eq('google_place_id', req.params.googlePlaceId)
      .maybeSingle()
    res.json({ ...details, placeId: skeleton?.id ?? null })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/places/:placeId — live Basic-tier details for one place (ephemeral).
 */
placesRouter.get('/:placeId', requireUser, async (req, res, next) => {
  try {
    const { data: place, error } = await supabase
      .from('place')
      .select('id, google_place_id, behavioral_evidence_count')
      .eq('id', req.params.placeId)
      .maybeSingle()
    if (error) throw error
    if (!place) {
      res.status(404).json({ error: 'Place not found' })
      return
    }
    const live = await getPlaceDetails(place.google_place_id)
    res.json({
      placeId: place.id,
      googlePlaceId: place.google_place_id,
      live,
    })
  } catch (err) {
    next(err)
  }
})
