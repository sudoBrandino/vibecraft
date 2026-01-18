/**
 * Rate Limiting Module for Vibecraft
 *
 * Provides in-memory rate limiting for HTTP endpoints to prevent abuse.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  whitelist?: string[]  // IPs to skip rate limiting
}

// Default configurations per endpoint type
export const RATE_LIMITS = {
  // /event endpoint - high volume from hooks
  event: { windowMs: 60_000, maxRequests: 200 },

  // /prompt endpoint - user-initiated, lower limit
  prompt: { windowMs: 60_000, maxRequests: 20 },

  // /sessions endpoints - moderate
  sessions: { windowMs: 60_000, maxRequests: 60 },

  // General API endpoints
  api: { windowMs: 60_000, maxRequests: 100 },

  // Static files - higher limit
  static: { windowMs: 60_000, maxRequests: 300 },
} as const

// In-memory storage for rate limit entries
// Key format: "endpoint:ip"
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

// Default whitelist (localhost variants)
const DEFAULT_WHITELIST = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  'localhost',
]

/**
 * Check if a request should be rate limited.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(
  ip: string,
  endpoint: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()

  // Check whitelist
  const whitelist = [...DEFAULT_WHITELIST, ...(config.whitelist || [])]
  if (whitelist.includes(ip)) {
    return { allowed: true, remaining: config.maxRequests, resetAt: now + config.windowMs }
  }

  const key = `${endpoint}:${ip}`
  const entry = rateLimitStore.get(key)

  // No existing entry or window expired - create new
  if (!entry || entry.resetAt < now) {
    const newEntry = { count: 1, resetAt: now + config.windowMs }
    rateLimitStore.set(key, newEntry)
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt }
  }

  // Check if over limit
  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  // Increment and allow
  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

/**
 * Get rate limit config for a URL path.
 */
export function getRateLimitConfig(urlPath: string): RateLimitConfig {
  if (urlPath === '/event') return RATE_LIMITS.event
  if (urlPath === '/prompt') return RATE_LIMITS.prompt
  if (urlPath.startsWith('/sessions')) return RATE_LIMITS.sessions
  if (urlPath.match(/\.(js|css|html|png|jpg|svg|ico|woff|woff2)$/)) return RATE_LIMITS.static
  return RATE_LIMITS.api
}

/**
 * Extract client IP from request.
 * Handles X-Forwarded-For header for reverse proxy setups.
 */
export function getClientIp(
  req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }
): string {
  // Check X-Forwarded-For (first IP in chain)
  const xff = req.headers['x-forwarded-for']
  if (xff) {
    const ip = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim()
    if (ip) return ip
  }

  // Check X-Real-IP
  const xri = req.headers['x-real-ip']
  if (xri) {
    return Array.isArray(xri) ? xri[0] : xri
  }

  // Fall back to socket address
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Clean up expired rate limit entries.
 * Call periodically to prevent memory leaks.
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now()
  let cleaned = 0

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Get current rate limit store size (for monitoring).
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size
}

/**
 * Start automatic cleanup interval.
 * Returns cleanup function to stop the interval.
 */
export function startRateLimitCleanup(): () => void {
  const interval = setInterval(() => {
    const cleaned = cleanupExpiredEntries()
    if (cleaned > 0) {
      console.log(`[RateLimit] Cleaned ${cleaned} expired entries`)
    }
  }, CLEANUP_INTERVAL_MS)

  return () => clearInterval(interval)
}

/**
 * WebSocket connection tracking per IP.
 */
interface ConnectionTracker {
  count: number
  connections: Set<unknown>
}

const wsConnectionStore = new Map<string, ConnectionTracker>()
const MAX_WS_CONNECTIONS_PER_IP = 10

/**
 * Check if a new WebSocket connection is allowed for this IP.
 */
export function checkWsConnectionLimit(ip: string): boolean {
  // Whitelist localhost
  if (DEFAULT_WHITELIST.includes(ip)) return true

  const tracker = wsConnectionStore.get(ip)
  if (!tracker) return true

  return tracker.count < MAX_WS_CONNECTIONS_PER_IP
}

/**
 * Track a new WebSocket connection.
 */
export function trackWsConnection(ip: string, ws: unknown): void {
  let tracker = wsConnectionStore.get(ip)
  if (!tracker) {
    tracker = { count: 0, connections: new Set() }
    wsConnectionStore.set(ip, tracker)
  }

  tracker.count++
  tracker.connections.add(ws)
}

/**
 * Remove a WebSocket connection from tracking.
 */
export function untrackWsConnection(ip: string, ws: unknown): void {
  const tracker = wsConnectionStore.get(ip)
  if (!tracker) return

  tracker.connections.delete(ws)
  tracker.count--

  if (tracker.count <= 0) {
    wsConnectionStore.delete(ip)
  }
}

/**
 * Get current WebSocket connections for an IP.
 */
export function getWsConnectionCount(ip: string): number {
  return wsConnectionStore.get(ip)?.count || 0
}
