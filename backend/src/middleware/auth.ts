import type { Request, Response, NextFunction } from 'express'
import { getAuth, clerkClient } from '@clerk/express'
import { supabase } from '../lib/supabase.js'

export interface AppUser {
  id: string
  clerk_id: string
  email: string
  name: string
  base_preference_vector: string | null
  onboarding_completed_at: string | null
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      appUser?: AppUser
    }
  }
}

/**
 * Requires a Clerk session and resolves (lazily creating) the internal user row.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkId } = getAuth(req)
    if (!clerkId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { data: existing, error } = await supabase
      .from('user')
      .select('*')
      .eq('clerk_id', clerkId)
      .maybeSingle()
    if (error) throw error

    if (existing) {
      req.appUser = existing as AppUser
      next()
      return
    }

    const clerkUser = await clerkClient.users.getUser(clerkId)
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? `${clerkId}@unknown.local`
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
      clerkUser.username ||
      email.split('@')[0]

    const { data: created, error: insertError } = await supabase
      .from('user')
      .upsert({ clerk_id: clerkId, email, name }, { onConflict: 'clerk_id' })
      .select('*')
      .single()
    if (insertError) throw insertError

    req.appUser = created as AppUser
    next()
  } catch (err) {
    next(err)
  }
}
