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

export interface LivePlace {
  placeId: string | null
  googlePlaceId: string
  name: string
  category: string | null
  types: string[]
  lat: number
  lng: number
  openNow: boolean | null
  address: string | null
  rating?: number | null
  userRatingCount?: number | null
  priceLevel?: string | null
  editorialSummary?: string | null
}

export interface ScoredPlace extends LivePlace {
  score: number
  distanceMeters: number
}

export interface PlaceReview {
  rating: number | null
  text: string | null
  author: string | null
  authorPhoto: string | null
  relativeTime: string | null
}

export interface RichPlaceDetails extends LivePlace {
  rating: number | null
  userRatingCount: number | null
  priceLevel: string | null
  editorialSummary: string | null
  formattedAddress: string | null
  weekdayDescriptions: string[]
  phone: string | null
  website: string | null
  googleMapsUri: string | null
  photoUrls: string[]
  reviews: PlaceReview[]
  placeId: string | null
}

export interface Me {
  id: string
  email: string
  name: string
  onboardingCompletedAt: string | null
  interests: { tag: string; weight: number }[]
}

export interface FriendEntry {
  friendshipId: string
  user: { id: string; name: string; email: string }
  since: string
}

export type Relationship = 'none' | 'outgoing' | 'incoming' | 'friends' | 'blocked'

export interface DiscoverUser {
  id: string
  name: string
  interests: string[]
  mood: MoodType | null
  relationship: Relationship
}

export interface DiscoverResponse {
  users: DiscoverUser[]
}

export interface FriendsResponse {
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

export interface ChatMessage {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  sent_at: string
  read_at: string | null
}

export interface BusynessResult {
  level: BusynessLevel | null
  source: 'crowdsourced' | 'scraped' | 'insufficient_data'
  uniqueReporters: number
  computedAt: string | null
}

export interface LocationShare {
  id: string
  user_id: string
  place_id: string | null
  share_type: 'im_here' | 'intent_to_go'
  last_known_lat: number | null
  last_known_lng: number | null
  last_ping_at: string | null
  expires_at: string
  user?: { id: string; name: string }
  signalLost?: boolean
}

export interface SharesResponse {
  outgoing: LocationShare[]
  incoming: LocationShare[]
}
