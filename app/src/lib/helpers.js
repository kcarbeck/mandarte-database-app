// Shared helper functions for the Mandarte field app

/**
 * Get the current territory assignments (birds on territories right now).
 * Returns rows where end_date IS NULL for the given territory and year.
 */
export async function getCurrentAssignments(supabase, territory, year) {
  const { data } = await supabase
    .from('territory_assignments')
    .select('*')
    .eq('territory', territory)
    .eq('year', year)
    .is('end_date', null)
    .order('sex', { ascending: false }) // males (2) first, then females (1)

  return data || []
}

/**
 * Get the current male and female for a territory.
 * Returns { male: assignment|null, female: assignment|null }
 */
export async function getTerritoryResidents(supabase, territory, year) {
  const assignments = await getCurrentAssignments(supabase, territory, year)
  return {
    male: assignments.find(a => a.sex === 2) || null,
    female: assignments.find(a => a.sex === 1) || null,
  }
}

/**
 * Display a bird: shows color combo + metal band, or "Unbanded", or "—"
 */
export function birdLabel(assignment) {
  if (!assignment) return '—'
  const combo = assignment.color_combo
  const band = assignment.band_id
  const unbanded = assignment.is_unbanded || (band && band < 0)

  if (combo && !unbanded) return `${combo} (${band})`
  if (combo) return combo
  if (!unbanded && band) return String(band)
  if (unbanded) return 'Unbanded'
  return '—'
}

/**
 * Search for existing birds by color combo, with safety filtering.
 *
 * RETURNING BIRDS: At the start of each season, students identify birds by
 * color combo. The app needs to look up the matching bird and autopopulate
 * the band number. But color combos can be REUSED across years — a dead bird's
 * colors may be given to a new bird. So we must filter to recently-alive birds.
 *
 * SAFETY RULES:
 *   - Only return birds that had a survival record OR territory assignment
 *     within the last 2 years (or current year), to avoid picking long-dead
 *     birds whose combo has been reused.
 *   - Exact match on combo (case-insensitive)
 *   - Exclude unbanded (negative band_id) birds
 *   - Returns bird data + last known year for display
 *
 * @param {object} supabase - Supabase client
 * @param {string} colorCombo - Color combo to search for (e.g., "dbm.gr")
 * @param {number} currentYear - Current field season year
 * @returns {Promise<Array>} Matching birds with last-seen info
 */
export async function findBirdsByCombo(supabase, colorCombo, currentYear) {
  if (!colorCombo || colorCombo.trim().length < 2) return []

  const combo = colorCombo.trim().toLowerCase()

  // Search birds table for matching combo
  const { data: birds, error } = await supabase
    .from('birds')
    .select('band_id, sex, color_combo, is_unbanded, is_immigrant, natal_year, notes')
    .ilike('color_combo', combo)
    .gt('band_id', 0)  // exclude unbanded (negative IDs)

  if (error || !birds || birds.length === 0) return []

  // For each match, check if the bird was alive recently
  // (territory assignment or survival record in last 2 years)
  const results = []
  for (const bird of birds) {
    // Check territory assignments (any year >= currentYear - 2)
    const { data: recentAssign } = await supabase
      .from('territory_assignments')
      .select('year, territory')
      .eq('band_id', bird.band_id)
      .gte('year', currentYear - 2)
      .order('year', { ascending: false })
      .limit(1)

    // Check survival records
    const { data: recentSurv } = await supabase
      .from('survival')
      .select('year, survived')
      .eq('band_id', bird.band_id)
      .gte('year', currentYear - 2)
      .order('year', { ascending: false })
      .limit(1)

    const lastAssignYear = recentAssign?.[0]?.year || null
    const lastSurvYear = recentSurv?.[0]?.year || null
    const lastSurvived = recentSurv?.[0]?.survived
    const lastSeenYear = Math.max(lastAssignYear || 0, lastSurvYear || 0)

    // Include if: seen recently, OR this is the first year of data (no history yet)
    // The "no history" case handles the bootstrap problem — when there's no
    // imported historical data yet, all birds are "new" but real
    const hasAnyHistory = lastSeenYear > 0
    const isRecentlyAlive = lastSeenYear >= currentYear - 2

    // If bird was confirmed dead (survived=0) in most recent survival record,
    // flag it but still show (the combo might have been reused)
    const confirmedDead = lastSurvived === 0

    if (isRecentlyAlive || !hasAnyHistory) {
      results.push({
        ...bird,
        lastSeenYear: lastSeenYear || null,
        lastTerritory: recentAssign?.[0]?.territory || null,
        confirmedDead,
        hasHistory: hasAnyHistory,
      })
    }
  }

  // Sort: current-year assignments first, then most recently seen
  results.sort((a, b) => (b.lastSeenYear || 0) - (a.lastSeenYear || 0))

  return results
}

/**
 * Estimate hatch date (Julian day) from a nest visit where chick age was estimated.
 *
 * PROTOCOL (Runyan 2004):
 *   Day 1 = hatch day. Day 5 = pins not broken. Day 6 = pins breaking (banding age).
 *   Day 7 = pins well broken. Ages Day 1-4 are less reliable.
 *
 * @param {string} visitDate - ISO date string (YYYY-MM-DD) of the nest visit
 * @param {number} chickAgeDays - Estimated chick age in days at time of visit
 * @param {number} year - Calendar year (for Julian day conversion)
 * @returns {{ hatchJulianDay: number|null, reliability: string }}
 */
export function estimateHatchDate(visitDate, chickAgeDays, year) {
  if (!visitDate || !chickAgeDays || chickAgeDays < 1) {
    return { hatchJulianDay: null, reliability: 'insufficient_data' }
  }

  // Parse visit date and subtract days using UTC to avoid DST bugs
  const [y, m, d] = visitDate.split('-').map(Number)
  const visitMs = Date.UTC(y, m - 1, d)
  const hatchMs = visitMs - (chickAgeDays - 1) * 86400000 // Day 1 = hatch day
  const hatchUTC = new Date(hatchMs)

  const hatchJulianDay = toJulianDay(
    hatchUTC.getUTCFullYear(),
    hatchUTC.getUTCMonth() + 1,
    hatchUTC.getUTCDate()
  )

  // Reliability rating per protocol
  let reliability
  if (chickAgeDays >= 5 && chickAgeDays <= 7) {
    reliability = 'high' // Pin feather stages — most reliable reference points
  } else if (chickAgeDays >= 8 && chickAgeDays <= 14) {
    reliability = 'medium' // Older chicks — easier to age but less precise
  } else {
    reliability = 'low' // Day 1-4: protocol warns common aging mistakes
  }

  return { hatchJulianDay, reliability }
}

/**
 * Check if a calendar year is a leap year.
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Convert a calendar date (month, day) to Julian day of year.
 * Uses UTC to avoid DST bugs — local-time midnight arithmetic
 * is off by 1 day after spring-forward in timezones with DST.
 * @param {number} year - Calendar year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month (1-31)
 * @returns {number} Julian day (1-366)
 */
export function toJulianDay(year, month, day) {
  const date = Date.UTC(year, month - 1, day)
  const jan1 = Date.UTC(year, 0, 1)
  return Math.floor((date - jan1) / 86400000) + 1
}

/**
 * Convert a Julian day back to a calendar date.
 * Uses UTC to avoid DST bugs.
 * @param {number} year - Calendar year
 * @param {number} julianDay - Day of year (1-366)
 * @returns {{ month: number, day: number }}
 */
export function fromJulianDay(year, julianDay) {
  const date = new Date(Date.UTC(year, 0, julianDay))
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/**
 * Calculate DFE (Date of First Egg) as a Julian day.
 *
 * PROTOCOL (Runyan 2004, p.7 & p.18):
 *   Incubation = 13 days. Laying rate = 1 egg/day.
 *   DFE = hatch_date - 13 (incubation) - (clutch_size - 1) (laying days)
 *
 * Per the formula (13 incubation + 1 egg/day):
 *   - 2 eggs: DFE = hatch_date - 14  (13 + 1)
 *   - 3 eggs: DFE = hatch_date - 15  (13 + 2)
 *   - 4 eggs: DFE = hatch_date - 16  (13 + 3)
 *
 * ⚠️ DISCREPANCY: The protocol TEXT says "subtract 15 for 3 OR 4 eggs" —
 *   grouping them together. But the math (13 incubation + 3 laying days)
 *   gives -16 for 4 eggs. We use the mathematical formula because:
 *   (a) the parenthetical "13 days incubation + 1 egg/day" supports it,
 *   (b) the breedfile README uses the general formula DH - 13 - (CS - 1).
 *   Katherine should confirm with Peter Arcese which convention was actually
 *   used historically. If -15 was used for 4 eggs, change the formula below.
 *
 * METHOD A — Count back from hatch date (most common):
 *   Used when hatch date is known or can be reliably estimated from
 *   chick aging (Day 6 pins breaking = most reliable reference point).
 *
 * METHOD B — Count back from egg laying (when nest found during laying):
 *   If nest found with an incomplete clutch being laid, DFE can be
 *   estimated as: DFE = date_observed - (eggs_present - 1)
 *   This method doesn't need hatch date or final clutch size.
 *
 * LEAP YEAR HANDLING:
 *   All arithmetic uses actual Date objects, not naive Julian day subtraction,
 *   to correctly handle the Feb 28→29 boundary in leap years.
 *
 * @param {Object} params
 * @param {number} params.year - Calendar year (needed for leap year check)
 * @param {number} [params.hatchJulianDay] - Julian day of hatch (Method A)
 * @param {number} [params.clutchSize] - Total clutch size (Method A)
 * @param {number} [params.layingDateJulianDay] - Julian day nest found during laying (Method B)
 * @param {number} [params.eggsAtDiscovery] - Eggs present when found during laying (Method B)
 * @returns {{ dfe: number|null, method: string, quality: string|null }}
 */
export function calculateDFE(params) {
  const { year, hatchJulianDay, clutchSize, layingDateJulianDay, eggsAtDiscovery } = params

  if (!year || year < 1975) return { dfe: null, method: 'none', quality: null }

  // Method B: Found during egg laying — count back from laying observation
  // This is preferred when available because it doesn't depend on clutch size assumptions
  // All arithmetic uses UTC to avoid DST bugs
  if (layingDateJulianDay && eggsAtDiscovery && eggsAtDiscovery >= 1) {
    const dfe = layingDateJulianDay - (eggsAtDiscovery - 1)
    if (dfe < 1) {
      return { dfe: null, method: 'error', quality: '?',
        error: `Calculated DFE is before Jan 1. Verify laying date and egg count.` }
    }
    return { dfe, method: 'laying_observation', quality: null }
  }

  // Method A: Count back from hatch date
  if (hatchJulianDay && clutchSize && clutchSize >= 1) {
    // Validate clutch size range (SOSP clutches are 1-5, almost never 5)
    if (clutchSize > 6) {
      return { dfe: null, method: 'error', quality: '?',
        error: `Clutch size ${clutchSize} is unusually large for SOSP. Verify data.` }
    }

    const daysBack = 13 + (clutchSize - 1) // 13 incubation + (CS-1) laying days
    const dfe = hatchJulianDay - daysBack

    // Safety check: DFE should fall in the same calendar year
    if (dfe < 1) {
      return { dfe: null, method: 'error', quality: '?',
        error: `Calculated DFE falls before Jan 1 of ${year}. Verify hatch date and clutch size.` }
    }

    return { dfe, method: 'hatch_backcount', quality: null }
  }

  return { dfe: null, method: 'insufficient_data', quality: '?' }
}

/**
 * Legacy wrapper for simple DFE calculation (backward compatibility).
 * Use calculateDFE(params) for new code.
 */
export function calculateDFESimple(dateHatch, clutchSize, year = null) {
  if (year) {
    const result = calculateDFE({ year, hatchJulianDay: parseInt(dateHatch), clutchSize: parseInt(clutchSize) })
    return result.dfe
  }
  // Fallback: naive arithmetic (no leap year handling) — avoid using this
  const dh = parseInt(dateHatch)
  const cs = parseInt(clutchSize)
  if (isNaN(dh) || isNaN(cs) || cs < 1) return null
  return dh - 13 - (cs - 1)
}

/**
 * Sort territories: numeric first (by number), then alphanumeric
 */
export function sortTerritories(territories) {
  return [...territories].sort((a, b) => {
    const numA = parseInt(a), numB = parseInt(b)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    if (!isNaN(numA)) return -1
    if (!isNaN(numB)) return 1
    return a.localeCompare(b)
  })
}

/**
 * Get today's date as YYYY-MM-DD in LOCAL time.
 * Do NOT use new Date().toISOString().split('T')[0] — that returns UTC date,
 * which is tomorrow after 5pm PDT. Mandarte fieldwork runs to 8-9pm.
 */
export function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Get current time as HH:MM in local time.
 */
export function localTimeString(d = new Date()) {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/**
 * Color band abbreviation reference
 */
export const BAND_COLORS = [
  { abbr: 'm', color: 'Metal', hex: '#999' },
  { abbr: 'r', color: 'Red', hex: '#dc2626' },
  { abbr: 'o', color: 'Orange', hex: '#ea580c' },
  { abbr: 'y', color: 'Yellow', hex: '#eab308' },
  { abbr: 'g', color: 'Green', hex: '#16a34a' },
  { abbr: 'lb', color: 'Light blue', hex: '#38bdf8' },
  { abbr: 'db', color: 'Dark blue', hex: '#2563eb' },
  { abbr: 'p', color: 'Purple', hex: '#9333ea' },
  { abbr: 'w', color: 'White', hex: '#e5e7eb' },
]
