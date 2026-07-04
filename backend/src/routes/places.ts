import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { fetchViewportPlaces } from './../services/placesService.js'
import { getPlaceDetails } from '../services/googlePlaces.js'
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
