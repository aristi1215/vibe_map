import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { broadcast } from '../lib/realtime.js'

export const chatRouter = Router()

async function areFriends(a: string, b: string): Promise<boolean> {
  const low = a < b ? a : b
  const high = a < b ? b : a
  const { data } = await supabase
    .from('friendship')
    .select('id')
    .eq('user_low_id', low)
    .eq('user_high_id', high)
    .eq('status', 'accepted')
    .maybeSingle()
  return !!data
}

/** GET /api/chat/:friendId — message history with one friend */
chatRouter.get('/:friendId', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!.id
    const friendId = String(req.params.friendId)
    if (!(await areFriends(me, friendId))) {
      res.status(403).json({ error: 'Not friends' })
      return
    }
    const { data, error } = await supabase
      .from('chat_message')
      .select('id, sender_id, receiver_id, content, sent_at, read_at')
      .or(
        `and(sender_id.eq.${me},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${me})`,
      )
      .order('sent_at', { ascending: true })
      .limit(200)
    if (error) throw error

    // Mark incoming messages as read
    await supabase
      .from('chat_message')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', friendId)
      .eq('receiver_id', me)
      .is('read_at', null)

    res.json({ messages: data ?? [] })
  } catch (err) {
    next(err)
  }
})

const sendSchema = z.object({ content: z.string().min(1).max(4000) })

/** POST /api/chat/:friendId — send a message (delivered instantly via Realtime) */
chatRouter.post('/:friendId', requireUser, async (req, res, next) => {
  try {
    const parsed = sendSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid message' })
      return
    }
    const me = req.appUser!
    const friendId = String(req.params.friendId)
    if (!(await areFriends(me.id, friendId))) {
      res.status(403).json({ error: 'Not friends' })
      return
    }
    const { data: message, error } = await supabase
      .from('chat_message')
      .insert({ sender_id: me.id, receiver_id: friendId, content: parsed.data.content })
      .select('id, sender_id, receiver_id, content, sent_at')
      .single()
    if (error) throw error

    await broadcast(`user:${friendId}`, 'chat_message', {
      ...message,
      senderName: me.name,
    })
    res.status(201).json({ message })
  } catch (err) {
    next(err)
  }
})
