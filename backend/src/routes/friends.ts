import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { broadcast } from '../lib/realtime.js'

export const friendsRouter = Router()

function canonicalPair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a }
}

/** GET /api/friends — accepted friends + pending requests (both directions) */
friendsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!.id
    const { data, error } = await supabase
      .from('friendship')
      .select(
        'id, status, requested_by, created_at, low:user_low_id(id, name, email), high:user_high_id(id, name, email)',
      )
      .or(`user_low_id.eq.${me},user_high_id.eq.${me}`)
    if (error) throw error

    const friends: unknown[] = []
    const incoming: unknown[] = []
    const outgoing: unknown[] = []
    for (const row of data ?? []) {
      const low = row.low as unknown as { id: string; name: string; email: string }
      const high = row.high as unknown as { id: string; name: string; email: string }
      const other = low.id === me ? high : low
      const entry = { friendshipId: row.id, user: other, since: row.created_at }
      if (row.status === 'accepted') friends.push(entry)
      else if (row.status === 'pending' && row.requested_by === me) outgoing.push(entry)
      else if (row.status === 'pending') incoming.push(entry)
    }
    res.json({ friends, incoming, outgoing })
  } catch (err) {
    next(err)
  }
})

const requestSchema = z
  .object({
    email: z.string().email().optional(),
    userId: z.string().uuid().optional(),
  })
  .refine((d) => d.email || d.userId, { message: 'email or userId required' })

/** POST /api/friends/requests — send a friend request by email or userId */
friendsRouter.post('/requests', requireUser, async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid email or userId' })
      return
    }
    const me = req.appUser!
    const lookup = supabase.from('user').select('id, name')
    const { data: target, error } = await (parsed.data.userId
      ? lookup.eq('id', parsed.data.userId)
      : lookup.eq('email', parsed.data.email!)
    ).maybeSingle()
    if (error) throw error
    if (!target) {
      res.status(404).json({ error: 'No user with that email' })
      return
    }
    if (target.id === me.id) {
      res.status(400).json({ error: 'Cannot add yourself' })
      return
    }

    const { low, high } = canonicalPair(me.id, target.id)
    const { data: friendship, error: insertError } = await supabase
      .from('friendship')
      .insert({ user_low_id: low, user_high_id: high, requested_by: me.id })
      .select('id, status')
      .single()
    if (insertError) {
      if (insertError.code === '23505') {
        res.status(409).json({ error: 'Friendship or request already exists' })
        return
      }
      throw insertError
    }

    await broadcast(`user:${target.id}`, 'friend_request', {
      friendshipId: friendship.id,
      from: { id: me.id, name: me.name },
    })
    res.status(201).json({ friendship })
  } catch (err) {
    next(err)
  }
})

const respondSchema = z.object({ action: z.enum(['accept', 'reject', 'block']) })

/** POST /api/friends/requests/:friendshipId/respond */
friendsRouter.post('/requests/:friendshipId/respond', requireUser, async (req, res, next) => {
  try {
    const parsed = respondSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid action' })
      return
    }
    const me = req.appUser!.id
    const { data: friendship, error } = await supabase
      .from('friendship')
      .select('id, status, requested_by, user_low_id, user_high_id')
      .eq('id', req.params.friendshipId)
      .maybeSingle()
    if (error) throw error
    if (!friendship || (friendship.user_low_id !== me && friendship.user_high_id !== me)) {
      res.status(404).json({ error: 'Request not found' })
      return
    }
    if (friendship.requested_by === me) {
      res.status(403).json({ error: 'Cannot respond to your own request' })
      return
    }

    if (parsed.data.action === 'reject') {
      await supabase.from('friendship').delete().eq('id', friendship.id)
      res.json({ ok: true })
      return
    }
    const status = parsed.data.action === 'accept' ? 'accepted' : 'blocked'
    const { error: updateError } = await supabase
      .from('friendship')
      .update({ status })
      .eq('id', friendship.id)
    if (updateError) throw updateError

    if (status === 'accepted') {
      await broadcast(`user:${friendship.requested_by}`, 'friend_accepted', {
        friendshipId: friendship.id,
        by: me,
      })
    }
    res.json({ ok: true, status })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/friends/:friendshipId — unfriend */
friendsRouter.delete('/:friendshipId', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!.id
    const { error } = await supabase
      .from('friendship')
      .delete()
      .eq('id', req.params.friendshipId)
      .or(`user_low_id.eq.${me},user_high_id.eq.${me}`)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
