import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { recommend } from '../services/recommendationService.js'
import { isMood } from '../services/moodMapping.js'
import type { MoodType } from '../types/index.js'

export const recommendationsRouter = Router()

const querySchema = z.object({
  mood: z.string(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(20000).default(3000),
})

/**
 * GET /api/recommendations?mood=&lat=&lng=&radius=
 * Two-stage flow (§2.3.1): hard filtering on live data, then first-party
 * vector ranking. Results are logged to `recommendation` for analytics.
 */
recommendationsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success || !isMood(parsed.data.mood)) {
      res.status(400).json({ error: 'Invalid parameters' })
      return
    }
    const { mood, lat, lng, radius } = parsed.data
    const user = req.appUser!

    const { data: session } = await supabase
      .from('mood_session')
      .select('id')
      .eq('user_id', user.id)
      .eq('mood_type', mood)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const results = await recommend(user.id, mood as MoodType, lat, lng, radius, session?.id ?? null)
    res.json({ recommendations: results })
  } catch (err) {
    next(err)
  }
})

/** POST /api/recommendations/:id/click — mark a logged recommendation as clicked */
recommendationsRouter.post('/:id/click', requireUser, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('recommendation')
      .update({ clicked: true })
      .eq('id', req.params.id)
      .eq('user_id', req.appUser!.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
