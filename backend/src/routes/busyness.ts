import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { getBusyness, submitCrowdReport } from '../services/busynessService.js'
import type { BusynessLevel } from '../types/index.js'

export const busynessRouter = Router()

/** GET /api/busyness/:placeId — hybrid busyness signal (§2.4) */
busynessRouter.get('/:placeId', requireUser, async (req, res, next) => {
  try {
    const result = await getBusyness(String(req.params.placeId))
    res.json(result)
  } catch (err) {
    next(err)
  }
})

const reportSchema = z.object({
  level: z.enum(['empty', 'calm', 'moderate', 'busy', 'very_busy']),
})

/** POST /api/busyness/:placeId/report — submit a crowd report (anti-abuse in DB) */
busynessRouter.post('/:placeId/report', requireUser, async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid busyness level' })
      return
    }
    const result = await submitCrowdReport(
      req.appUser!.id,
      String(req.params.placeId),
      parsed.data.level as BusynessLevel,
    )
    if (!result.ok) {
      res.status(429).json({ error: result.reason })
      return
    }
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})
