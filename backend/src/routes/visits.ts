import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { applyVisitFeedback } from '../services/feedbackService.js'
import { isMood } from '../services/moodMapping.js'
import type { MoodType } from '../types/index.js'

export const visitsRouter = Router()

const visitSchema = z.object({
  placeId: z.string().uuid(),
  mood: z.string(),
  rating: z.number().int().min(1).max(5),
})

/**
 * POST /api/visits — record a rated visit and run the two-sided,
 * mood-scoped feedback loop (§2.3.4).
 */
visitsRouter.post('/', requireUser, async (req, res, next) => {
  try {
    const parsed = visitSchema.safeParse(req.body)
    if (!parsed.success || !isMood(parsed.data.mood)) {
      res.status(400).json({ error: 'Invalid visit payload' })
      return
    }
    const { placeId, mood, rating } = parsed.data
    const user = req.appUser!

    const { data: visit, error } = await supabase
      .from('visit')
      .insert({
        user_id: user.id,
        place_id: placeId,
        mood_at_visit: mood,
        alignment_rating: rating,
      })
      .select('id, visited_at')
      .single()
    if (error) throw error

    await applyVisitFeedback(user.id, placeId, mood as MoodType, rating)

    res.status(201).json({ visit })
  } catch (err) {
    next(err)
  }
})

/** GET /api/visits — the user's visit history */
visitsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('visit')
      .select('id, place_id, mood_at_visit, visited_at, alignment_rating, place(google_place_id)')
      .eq('user_id', req.appUser!.id)
      .order('visited_at', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json({ visits: data ?? [] })
  } catch (err) {
    next(err)
  }
})
