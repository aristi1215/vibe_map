import { Router } from 'express'
import { z } from 'zod'
import { requireUser } from '../middleware/auth.js'
import { supabase } from '../lib/supabase.js'
import { normalize, mean, scale, parseVector, toVectorLiteral, type Vec } from '../lib/vector.js'
import { isMood } from '../services/moodMapping.js'

export const usersRouter = Router()

/** GET /api/users/me — profile + interests + onboarding state */
usersRouter.get('/me', requireUser, async (req, res, next) => {
  try {
    const user = req.appUser!
    const { data: interests, error } = await supabase
      .from('user_interest')
      .select('tag, weight')
      .eq('user_id', user.id)
    if (error) throw error
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      onboardingCompletedAt: user.onboarding_completed_at,
      interests: interests ?? [],
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/users/discover — browse other users to add as friends.
 * Returns each user's public interests + current mood, annotated with the
 * viewer's relationship (none | outgoing | incoming | friends | blocked).
 */
usersRouter.get('/discover', requireUser, async (req, res, next) => {
  try {
    const me = req.appUser!

    const { data: users, error } = await supabase
      .from('user')
      .select('id, name')
      .neq('id', me.id)
      .limit(200)
    if (error) throw error
    const ids = (users ?? []).map((u) => u.id)
    if (ids.length === 0) {
      res.json({ users: [] })
      return
    }

    const [{ data: friendships }, { data: interests }, { data: moods }] = await Promise.all([
      supabase
        .from('friendship')
        .select('user_low_id, user_high_id, status, requested_by')
        .or(`user_low_id.eq.${me.id},user_high_id.eq.${me.id}`),
      supabase.from('user_interest').select('user_id, tag').in('user_id', ids),
      supabase
        .from('mood_session')
        .select('user_id, mood_type, started_at')
        .in('user_id', ids)
        .is('ended_at', null)
        .order('started_at', { ascending: false }),
    ])

    const relationship = new Map<string, string>()
    for (const f of friendships ?? []) {
      const other = f.user_low_id === me.id ? f.user_high_id : f.user_low_id
      if (f.status === 'accepted') relationship.set(other, 'friends')
      else if (f.status === 'blocked') relationship.set(other, 'blocked')
      else relationship.set(other, f.requested_by === me.id ? 'outgoing' : 'incoming')
    }

    const interestsByUser = new Map<string, string[]>()
    for (const r of interests ?? []) {
      const arr = interestsByUser.get(r.user_id) ?? []
      arr.push(r.tag)
      interestsByUser.set(r.user_id, arr)
    }

    const moodByUser = new Map<string, string>()
    for (const m of moods ?? []) {
      if (!moodByUser.has(m.user_id)) moodByUser.set(m.user_id, m.mood_type)
    }

    const result = (users ?? [])
      .map((u) => ({
        id: u.id,
        name: u.name,
        interests: interestsByUser.get(u.id) ?? [],
        mood: moodByUser.get(u.id) ?? null,
        relationship: relationship.get(u.id) ?? 'none',
      }))
      // surface people you can actually act on first (not-yet-friends, richer profiles)
      .sort((a, b) => {
        const rank = (r: string) => (r === 'none' || r === 'incoming' ? 0 : 1)
        if (rank(a.relationship) !== rank(b.relationship)) return rank(a.relationship) - rank(b.relationship)
        return b.interests.length - a.interests.length
      })

    res.json({ users: result })
  } catch (err) {
    next(err)
  }
})

/** GET /api/users/interests/vocabulary — available interest tags */
usersRouter.get('/interests/vocabulary', requireUser, async (_req, res, next) => {
  try {
    const { data, error } = await supabase.from('interest_vocabulary').select('tag').order('tag')
    if (error) throw error
    res.json({ tags: (data ?? []).map((t) => t.tag) })
  } catch (err) {
    next(err)
  }
})

const onboardingSchema = z.object({
  interests: z
    .array(z.object({ tag: z.string().min(1), weight: z.number().min(0).max(5).default(1) }))
    .min(1)
    .max(30),
})

/**
 * PUT /api/users/interests — onboarding / interest adjustment (§2.8 step 4).
 * Replaces the interest set and derives base_preference_vector from the
 * weighted mean of the selected tag vectors.
 */
usersRouter.put('/interests', requireUser, async (req, res, next) => {
  try {
    const parsed = onboardingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid interests', details: parsed.error.flatten() })
      return
    }
    const user = req.appUser!
    const { interests } = parsed.data
    const tags = interests.map((i) => i.tag)

    const { data: vocab, error: vocabError } = await supabase
      .from('interest_vocabulary')
      .select('tag, vector')
      .in('tag', tags)
    if (vocabError) throw vocabError
    const vocabMap = new Map((vocab ?? []).map((v) => [v.tag, parseVector(v.vector)]))
    const unknown = tags.filter((t) => !vocabMap.has(t))
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown interest tags: ${unknown.join(', ')}` })
      return
    }

    const { error: deleteError } = await supabase
      .from('user_interest')
      .delete()
      .eq('user_id', user.id)
    if (deleteError) throw deleteError
    const { error: insertError } = await supabase
      .from('user_interest')
      .insert(interests.map((i) => ({ user_id: user.id, tag: i.tag, weight: i.weight })))
    if (insertError) throw insertError

    const weighted: Vec[] = interests
      .map((i) => {
        const v = vocabMap.get(i.tag)
        return v ? scale(v, i.weight) : null
      })
      .filter((v): v is Vec => v !== null)
    const base = normalize(mean(weighted))

    const { error: userError } = await supabase
      .from('user')
      .update({
        base_preference_vector: toVectorLiteral(base),
        onboarding_completed_at: user.onboarding_completed_at ?? new Date().toISOString(),
      })
      .eq('id', user.id)
    if (userError) throw userError

    res.json({ ok: true, interests })
  } catch (err) {
    next(err)
  }
})

const moodSchema = z.object({ mood: z.string() })

/** POST /api/users/mood — start a mood session (ends any active one) */
usersRouter.post('/mood', requireUser, async (req, res, next) => {
  try {
    const parsed = moodSchema.safeParse(req.body)
    if (!parsed.success || !isMood(parsed.data.mood)) {
      res.status(400).json({ error: 'Invalid mood' })
      return
    }
    const user = req.appUser!
    await supabase
      .from('mood_session')
      .update({ ended_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('ended_at', null)
    const { data, error } = await supabase
      .from('mood_session')
      .insert({ user_id: user.id, mood_type: parsed.data.mood })
      .select('id, mood_type, started_at')
      .single()
    if (error) throw error
    res.json({ moodSession: data })
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/users/mood — end the active mood session */
usersRouter.delete('/mood', requireUser, async (req, res, next) => {
  try {
    await supabase
      .from('mood_session')
      .update({ ended_at: new Date().toISOString() })
      .eq('user_id', req.appUser!.id)
      .is('ended_at', null)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** GET /api/users/mood — active mood session, if any */
usersRouter.get('/mood', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('mood_session')
      .select('id, mood_type, started_at')
      .eq('user_id', req.appUser!.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json({ moodSession: data })
  } catch (err) {
    next(err)
  }
})
