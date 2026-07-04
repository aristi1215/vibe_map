import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { broadcast } from '../lib/realtime.js'
import { config } from '../config.js'

export const locationRouter = Router()

/**
 * Location shares (§1.5.4–1.5.6, §2.5.1):
 *  - "I'm here" / "intent to go" alerts and live location share sessions
 *  - explicit per-share recipient list (LocationShareRecipient)
 *  - only the latest position persisted (no GPS history)
 *  - expiry is server-enforced on every read/ping
 */

async function acceptedFriendIds(me: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('friendship')
    .select('user_low_id, user_high_id')
    .or(`user_low_id.eq.${me},user_high_id.eq.${me}`)
    .eq('status', 'accepted')
  const ids = new Set<string>()
  for (const row of data ?? []) {
    ids.add(row.user_low_id === me ? row.user_high_id : row.user_low_id)
  }
  return ids
}

const createShareSchema = z.object({
  shareType: z.enum(['im_here', 'intent_to_go']),
  recipientIds: z.array(z.string().uuid()).min(1).max(50),
  placeId: z.string().uuid().nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  /** duration in minutes; capped at 8h */
  durationMinutes: z.number().int().min(5).max(480).default(60),
})

/** POST /api/location/shares — start a share ("I'm here" / "intent to go" / live) */
locationRouter.post('/shares', requireUser, async (req, res, next) => {
  try {
    const parsed = createShareSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid share payload', details: parsed.error.flatten() })
      return
    }
    const me = req.appUser!
    const { shareType, recipientIds, placeId, lat, lng, durationMinutes } = parsed.data

    const friends = await acceptedFriendIds(me.id)
    const invalid = recipientIds.filter((id) => !friends.has(id))
    if (invalid.length > 0) {
      res.status(403).json({ error: 'Recipients must be accepted friends' })
      return
    }

    const now = new Date()
    const { data: share, error } = await supabase
      .from('location_share')
      .insert({
        user_id: me.id,
        place_id: placeId ?? null,
        share_type: shareType,
        last_known_lat: lat ?? null,
        last_known_lng: lng ?? null,
        last_ping_at: lat != null && lng != null ? now.toISOString() : null,
        expires_at: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
      })
      .select('*')
      .single()
    if (error) throw error

    const { error: recipientsError } = await supabase
      .from('location_share_recipient')
      .insert(recipientIds.map((id) => ({ share_id: share.id, recipient_user_id: id })))
    if (recipientsError) throw recipientsError

    await Promise.all(
      recipientIds.map((id) =>
        broadcast(`user:${id}`, shareType === 'im_here' ? 'im_here' : 'intent_to_go', {
          shareId: share.id,
          from: { id: me.id, name: me.name },
          placeId: placeId ?? null,
          lat: lat ?? null,
          lng: lng ?? null,
          expiresAt: share.expires_at,
        }),
      ),
    )
    res.status(201).json({ share })
  } catch (err) {
    next(err)
  }
})

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/**
 * POST /api/location/shares/:shareId/ping — live position update.
 * Overwrites (never appends) the last known position; rejected after expiry.
 */
locationRouter.post('/shares/:shareId/ping', requireUser, async (req, res, next) => {
  try {
    const parsed = pingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid ping' })
      return
    }
    const me = req.appUser!.id
    const { data: share, error } = await supabase
      .from('location_share')
      .select('id, user_id, expires_at')
      .eq('id', req.params.shareId)
      .maybeSingle()
    if (error) throw error
    if (!share || share.user_id !== me) {
      res.status(404).json({ error: 'Share not found' })
      return
    }
    if (new Date(share.expires_at).getTime() <= Date.now()) {
      res.status(410).json({ error: 'Share expired' })
      return
    }

    const nowIso = new Date().toISOString()
    const { lat, lng } = parsed.data
    const { error: updateError } = await supabase
      .from('location_share')
      .update({ last_known_lat: lat, last_known_lng: lng, last_ping_at: nowIso })
      .eq('id', share.id)
    if (updateError) throw updateError

    await broadcast(`share:${share.id}`, 'ping', { shareId: share.id, lat, lng, at: nowIso })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/location/shares/:shareId — end a share immediately */
locationRouter.delete('/shares/:shareId', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!.id
    const { data: share, error } = await supabase
      .from('location_share')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', req.params.shareId)
      .eq('user_id', me)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!share) {
      res.status(404).json({ error: 'Share not found' })
      return
    }
    await broadcast(`share:${share.id}`, 'ended', { shareId: share.id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/location/shares/:shareId/recipients/:recipientId — revoke one recipient */
locationRouter.delete(
  '/shares/:shareId/recipients/:recipientId',
  requireUser,
  async (req, res, next) => {
    try {
      const me = req.appUser!.id
      const { data: share } = await supabase
        .from('location_share')
        .select('id, user_id')
        .eq('id', req.params.shareId)
        .maybeSingle()
      if (!share || share.user_id !== me) {
        res.status(404).json({ error: 'Share not found' })
        return
      }
      const { error } = await supabase
        .from('location_share_recipient')
        .update({ revoked_at: new Date().toISOString() })
        .eq('share_id', share.id)
        .eq('recipient_user_id', req.params.recipientId)
      if (error) throw error
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

/**
 * GET /api/location/shares — shares I'm sending + active shares I can see.
 * Expiry and revocation are enforced here (server-side), and stale shares
 * (no ping within 60s) are flagged as signalLost (§2.5.1).
 */
locationRouter.get('/shares', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!.id
    const nowIso = new Date().toISOString()

    const { data: mine, error: mineError } = await supabase
      .from('location_share')
      .select('*, location_share_recipient(recipient_user_id, revoked_at)')
      .eq('user_id', me)
      .gt('expires_at', nowIso)
    if (mineError) throw mineError

    const { data: grants, error: grantsError } = await supabase
      .from('location_share_recipient')
      .select('share_id, revoked_at, location_share(*, user:user_id(id, name))')
      .eq('recipient_user_id', me)
      .is('revoked_at', null)
    if (grantsError) throw grantsError

    const incoming = (grants ?? [])
      .map((g) => g.location_share as unknown as Record<string, unknown> & { expires_at: string; last_ping_at: string | null })
      .filter((s) => s && new Date(s.expires_at).getTime() > Date.now())
      .map((s) => ({
        ...s,
        signalLost:
          s.last_ping_at == null ||
          Date.now() - new Date(s.last_ping_at).getTime() > config.signalLostSeconds * 1000,
      }))

    res.json({ outgoing: mine ?? [], incoming })
  } catch (err) {
    next(err)
  }
})
