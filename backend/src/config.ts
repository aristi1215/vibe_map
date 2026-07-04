export const config = {
  /** Geo-cell throttle TTL — a cell queried within this window is skipped (§2.2.1) */
  geoCellTtlMinutes: 20,
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
}
