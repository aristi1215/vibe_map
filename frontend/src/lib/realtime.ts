import { useEffect } from 'react'
import { supabase } from './supabase'

export interface RealtimeEvent {
  event: string
  payload: Record<string, unknown>
}

/**
 * Subscribe to this user's inbox channel (`user:{id}`) for chat messages,
 * friend requests, and "I'm here" / "intent to go" alerts.
 */
export function useUserChannel(userId: string | undefined, onEvent: (e: RealtimeEvent) => void) {
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`user:${userId}`)
    for (const event of [
      'chat_message',
      'friend_request',
      'friend_accepted',
      'im_here',
      'intent_to_go',
    ]) {
      channel.on('broadcast', { event }, (msg) => {
        onEvent({ event, payload: msg.payload as Record<string, unknown> })
      })
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])
}

/** Subscribe to live pings for one location share session (`share:{id}`). */
export function useShareChannel(
  shareId: string | null,
  onPing: (p: { lat: number; lng: number; at: string }) => void,
  onEnded?: () => void,
) {
  useEffect(() => {
    if (!shareId) return
    const channel = supabase.channel(`share:${shareId}`)
    channel.on('broadcast', { event: 'ping' }, (msg) => {
      onPing(msg.payload as { lat: number; lng: number; at: string })
    })
    channel.on('broadcast', { event: 'ended' }, () => onEnded?.())
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shareId])
}
