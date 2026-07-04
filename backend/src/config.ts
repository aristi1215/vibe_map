export const config = {
  /** Geo-cell throttle TTL — a cell queried within this window is skipped (§2.2.1) */
  geoCellTtlMinutes: 20,
  /**
   * In-memory live-result cache TTL (seconds). Live Google content can't be
   * persisted, so this short RAM cache is what actually throttles the Places API
   * while still returning renderable places on every request.
   */
  liveCacheTtlSeconds: 90,
  /** Fixed grid cell size in degrees (~2.2km at equator) */
  geoCellSizeDeg: 0.02,
  /** Confidence constant for behavioral vector weighting (§2.3.2, K ≈ 10) */
  K: 10,
  /** Confidence constant for learned-vs-explicit weighting (§2.3.1, M ≈ 5) */
  M: 5,
  /** Feedback learning rates — asymmetric, conservative on negatives (§2.3.4) */
  alphaPositive: 0.1,
  alphaNegative: 0.05,
  /** mean-of-top-k interest similarities used for explicit_score (§2.3.3) */
  topKInterests: 3,
  /** A place whose latest alignment rating (for the active mood) is ≤ this is hard-excluded */
  dislikedRatingMax: 2,
  /** Score multiplier for places last rated 3 ("meh") in the active mood */
  mediocrePenalty: 0.75,
  /** Crowd report recency half-life in minutes (§2.4.1) */
  busynessHalfLifeMinutes: 25,
  /** Minimum unique reporters within the last hour (§2.4) */
  minUniqueReporters: 3,
  /** Cached scrape validity window */
  scrapeTtlMinutes: 120,
  /** Daily scraping budget (§2.4.3) */
  scrapingDailyLimit: 50,
  /** Scraping disabled at launch — crowdsourcing is the primary signal (§2.4.3 note) */
  scrapingEnabled: false,
  /** Live location share: signal considered lost after this many seconds (§2.5.1) */
  signalLostSeconds: 60,
  /** Embedding model — 3072-d, matches vector(3072) columns in the migration */
  embeddingModel: 'text-embedding-3-large',
  embeddingDim: 3072,
  /** Top-N recommendations returned/highlighted */
  recommendationLimit: 20,
  /** RAM cache TTL (hours) for per-place embeddings derived from Google content */
  placeEmbTtlHours: 6,
  /**
   * Ranking weights for the request-time recommender. Each component is min-max
   * normalized across the candidate set before weighting, so they sum to 1.
   */
  recWeights: {
    /** semantic match to the selected mood's vibe */
    vibe: 0.28,
    /**
     * match to the user's explicit interests + learned preference vector.
     * Deliberately the dominant weight: vibe + quality are identical for every
     * user in the same mood/location, so this is the only component that makes
     * two users' recommendations differ.
     */
    preference: 0.52,
    /** Google rating × review-count confidence */
    quality: 0.2,
  },
  /** share of the explicit-interest score carried by interest↔category affinity (vs place-text similarity) */
  categoryAffinityShare: 0.5,
  /** top-N interest-affine mood categories get a dedicated Stage-1 fetch of their own */
  preferredCategoryCount: 3,
}
