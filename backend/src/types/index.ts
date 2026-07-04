export type MoodType =
  | 'social'
  | 'calm'
  | 'active'
  | 'cultural'
  | 'romantic'
  | 'productive'
  | 'explorer'
  | 'family'

export type BusynessLevel = 'empty' | 'calm' | 'moderate' | 'busy' | 'very_busy'

export type BusynessSource = 'crowdsourced' | 'scraped' | 'insufficient_data'

export type ShareType = 'im_here' | 'intent_to_go'

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'

export type CircuitBreakerStatus = 'closed' | 'open' | 'half_open'

export type EventSource = 'first_party' | 'partner_feed'
