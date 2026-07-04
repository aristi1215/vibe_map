import { supabase } from './supabase.js'

/**
 * Server-side broadcast helper (Supabase Realtime).
 *
 * Channel naming:
 *   user:{internalUserId}   — per-user inbox (chat messages, alerts, share grants)
 *   share:{shareId}         — live pings for one location share session
 *
 * Channel names embed unguessable UUIDs handed out only via authenticated API
 * responses; the server stops broadcasting on expiry/revocation (§2.5.1).
 */
export async function broadcast(
  channelName: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const channel = supabase.channel(channelName)
  try {
    await channel.send({ type: 'broadcast', event, payload })
  } catch (err) {
    console.error(`broadcast to ${channelName} failed:`, err)
  } finally {
    await supabase.removeChannel(channel)
  }
}
