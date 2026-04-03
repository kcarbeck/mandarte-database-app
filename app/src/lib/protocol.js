/**
 * Mandarte Song Sparrow Protocol — Single Source of Truth
 *
 * All nest lifecycle stages, protocol timing windows, visit frequencies,
 * and scheduling logic live here. Every page imports from this module
 * so terminology, colors, and business rules stay consistent.
 *
 * PROTOCOL REFERENCE (Runyan 2004):
 *   - 1 egg laid per day; incubation = 13 days
 *   - DFE = DH − 13 − (CS − 1)
 *   - Day 1 = hatch day. Day 6 = pins breaking (banding target)
 *   - DO NOT APPROACH Day 9–11 (premature fledging risk)
 *   - Fledge check Day 12–14
 *   - Independence check Day 22–26 (sightings after Day 22 count)
 */

import { toJulianDay, fromJulianDay, estimateHatchDate } from './helpers'

// ─── Month names (1-indexed: MONTH_NAMES[1] = 'Jan') ────────
export const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Nest lifecycle stages (ordered) ─────────────────────────
// These are the stages a nest progresses through. The visit form
// uses these as selectable options. 'failed' can occur at any stage.
export const NEST_STAGES = [
  'building', 'laying', 'incubating', 'hatching',
  'nestling', 'fledged', 'independent', 'failed',
]

// ─── Pipeline stages for the flowchart widget ────────────────
// Pre-hatch stages show the nest progression before chicks emerge.
// Post-hatch stages track counts (eggs, hatch, band, fledge, indep).
//
// Pre-hatch stages are date-based (derived from DFE/hatch date).
// Post-hatch stages are count-based (from breed record fields).
export const PRE_HATCH_STAGES = [
  { key: 'building',   label: 'Building',    color: 'bg-amber-100 text-amber-700',   colorHex: '#fef3c7' },
  { key: 'laying',     label: 'Laying',      color: 'bg-orange-100 text-orange-700', colorHex: '#ffedd5' },
  { key: 'incubating', label: 'Incubating',  color: 'bg-yellow-100 text-yellow-700', colorHex: '#fef9c3' },
]

export const POST_HATCH_STAGES = [
  { key: 'eggs',  label: 'Eggs',  field: 'eggs' },
  { key: 'hatch', label: 'Hatch', field: 'hatch' },
  { key: 'band',  label: 'Band',  field: 'band' },
  { key: 'fledge', label: 'Fledge', field: 'fledge' },
  { key: 'indep', label: 'Indep', field: 'indep' },
]

// ─── Post-hatch protocol windows ─────────────────────────────
// These define the critical timing windows after hatch.
// Day numbers are chick age (Day 1 = hatch day).
//
// Colors come in two forms:
//   - Tailwind classes (for territory/nest pages)
//   - Hex values (for home page schedule grid which uses inline styles)
export const PROTOCOL_WINDOWS = [
  {
    key: 'band', label: 'Band', fullLabel: 'Band chicks',
    startDay: 4, endDay: 7, idealDay: 6,
    // Tailwind
    bg: 'bg-emerald-100', bgActive: 'bg-emerald-200', bgIdeal: 'bg-emerald-400',
    badgeActive: 'bg-emerald-100 text-emerald-700',
    // Hex (for schedule grid)
    colorHex: '#6ee7b7', idealColorHex: '#059669', textOnIdeal: 'B',
    // Completion check
    field: 'band',
  },
  {
    key: 'danger', label: 'DO NOT APPROACH', fullLabel: 'DO NOT APPROACH',
    startDay: 9, endDay: 11, idealDay: null,
    bg: 'bg-red-100', bgActive: 'bg-red-300',
    badgeActive: 'bg-red-100 text-red-700',
    colorHex: '#fca5a5', idealColorHex: '#dc2626', textOnIdeal: '!',
    isDanger: true, field: null,
  },
  {
    key: 'fledge', label: 'Fledge check', fullLabel: 'Fledge check',
    startDay: 12, endDay: 14, idealDay: null,
    bg: 'bg-blue-100', bgActive: 'bg-blue-200',
    badgeActive: 'bg-blue-100 text-blue-700',
    colorHex: '#93c5fd', idealColorHex: '#2563eb', textOnIdeal: 'F',
    field: 'fledge',
  },
  {
    key: 'indep', label: 'Independence', fullLabel: 'Independence check',
    startDay: 22, endDay: 26, idealDay: 24,
    bg: 'bg-purple-100', bgActive: 'bg-purple-200',
    badgeActive: 'bg-purple-100 text-purple-700',
    colorHex: '#c4b5fd', idealColorHex: '#7c3aed', textOnIdeal: 'I',
    field: 'indep',
  },
]

// ─── Renest check window ─────────────────────────────────────
// After a nest completes (success or fail), check for renesting
// ~5–14 days after typical independence (Day 24).
export const RENEST_WINDOW = {
  key: 'renest', label: 'Renest check', fullLabel: 'Check for renesting',
  startDay: 29, endDay: 38, idealDay: null,
  colorHex: '#fed7aa', idealColorHex: '#f97316', textOnIdeal: 'R',
}

// ─── Visit frequency rules (protocol) ───────────────────────
// From Mandarte_FieldworkProtocol.pdf:
//   - Active nest or female present: every 3–5 days (max 7)
//   - Single male, female suspected: every 5 days
//   - Single male, no female: every 6 days
//   - After failure: every 4 days; every 2 if 20+ days no renest
export const VISIT_RULES = {
  OVERDUE_DAYS: 5,          // Default overdue threshold (active nest / female present)
  NEST_CHECK_DAYS: 3,       // Pre-hatch nests need visits every 3 days
  INCUBATION_DAYS: 13,      // Standard incubation period
  EGGS_PER_DAY: 1,          // Laying rate
  // Territory-status-aware visit intervals
  PAIR_DAYS: 5,             // Active nest or female present: overdue after 5 days
  SINGLE_MALE_SUSPECTED_DAYS: 5, // Single male, female suspected: every 5 days
  SINGLE_MALE_DAYS: 6,      // Single male, no female: every 6 days
  POST_FAILURE_DAYS: 4,     // After failure: every 4 days watching for renest
  POST_FAILURE_URGENT_DAYS: 2,   // If 20+ days since failure with no renest: every 2 days
  POST_FAILURE_URGENT_THRESHOLD: 20, // Days since failure before escalating to urgent
}

// ─── Territory status classification ────────────────────────
// Territory types determine visit frequency per protocol.
export const TERRITORY_STATUS = {
  ACTIVE_NEST: 'active_nest',       // Has active (non-failed) nest
  RENEST_WATCH: 'renest_watch',     // Most recent nest failed, watching for renest
  RENEST_URGENT: 'renest_urgent',   // 20+ days since failure, no renest — urgent
  PAIR_NO_NEST: 'pair_no_nest',     // Pair present, no active nest (early season)
  SINGLE_MALE: 'single_male',      // Male only, no female
  UNKNOWN: 'unknown',
}

/**
 * Classify a territory's status for visit scheduling.
 *
 * @param {Object} opts
 * @param {boolean} opts.hasFemale - Is a female assigned to this territory?
 * @param {boolean} opts.hasMale - Is a male assigned to this territory?
 * @param {Array} opts.nests - Breed records for this territory this year
 * @param {number} opts.todayJD - Today's Julian day
 * @param {number} [opts.year] - Calendar year (for JD calculations)
 * @returns {{ status: string, visitInterval: number, label: string, failedNestInfo: Object|null }}
 */
export function classifyTerritory({ hasFemale, hasMale, nests = [], todayJD, year }) {
  // Active nests: no fail_code AND not yet completed (indep not set)
  // A nest with indep set but no fail_code is effectively complete, not active.
  const activeNests = nests.filter(n => !n.fail_code && (n.indep == null || n.indep === ''))
  const failedNests = nests.filter(n => n.fail_code && n.fail_code !== '24')
  const successNests = nests.filter(n =>
    n.fail_code === '24' || (!n.fail_code && n.indep != null && n.indep !== '')
  )

  // 1. Has an active (non-failed, non-complete) nest → visit every 5 days (3 for nest checks)
  if (activeNests.length > 0) {
    return {
      status: TERRITORY_STATUS.ACTIVE_NEST,
      visitInterval: VISIT_RULES.PAIR_DAYS,
      label: 'Active nest',
      failedNestInfo: null,
    }
  }

  // 2. Most recent nest failed → renest watch
  //    Calculate days since most recent failure to determine urgency
  if (failedNests.length > 0) {
    const latestFailure = _estimateFailureJD(failedNests, year)

    // Check if a successful nest started after the failure
    // Check both DFE and date_hatch — some success nests have one but not the other
    const hasNewerSuccess = latestFailure && successNests.some(n => {
      const dfe = n.dfe ? parseInt(n.dfe) : null
      if (dfe && dfe > latestFailure.failureJD) return true
      const hatch = n.date_hatch ? parseInt(n.date_hatch) : null
      if (hatch && hatch > latestFailure.failureJD) return true
      return false
    })

    if (!hasNewerSuccess) {
      if (latestFailure) {
        const daysSinceFailure = todayJD - latestFailure.failureJD
        if (daysSinceFailure >= VISIT_RULES.POST_FAILURE_URGENT_THRESHOLD) {
          return {
            status: TERRITORY_STATUS.RENEST_URGENT,
            visitInterval: VISIT_RULES.POST_FAILURE_URGENT_DAYS,
            label: `Renest watch URGENT (${daysSinceFailure}d since failure)`,
            failedNestInfo: { ...latestFailure, daysSinceFailure },
          }
        }
        return {
          status: TERRITORY_STATUS.RENEST_WATCH,
          visitInterval: VISIT_RULES.POST_FAILURE_DAYS,
          label: `Renest watch (${daysSinceFailure}d since failure)`,
          failedNestInfo: { ...latestFailure, daysSinceFailure },
        }
      }
      // Failure date unknown (no DFE or hatch date) — still enter renest watch
      // Use standard post-failure interval; can't determine urgency without dates
      return {
        status: TERRITORY_STATUS.RENEST_WATCH,
        visitInterval: VISIT_RULES.POST_FAILURE_DAYS,
        label: 'Renest watch (failure date unknown)',
        failedNestInfo: null,
      }
    }
  }

  // 3. All nests succeeded (independence reached) → check for next nesting attempt
  //    Female Song Sparrows typically renest after independence of previous brood
  if (successNests.length > 0 && hasFemale) {
    // Find most recent success — use hatchJD + ~24 days as independence estimate
    const latestSuccess = successNests.reduce((latest, n) => {
      let hJD = n.date_hatch ? parseInt(n.date_hatch) : null
      // Fallback: estimate hatch from DFE + eggs
      if ((!hJD || isNaN(hJD)) && n.dfe && n.eggs) {
        hJD = parseInt(n.dfe) + VISIT_RULES.INCUBATION_DAYS + (parseInt(n.eggs) - 1)
      }
      if (!hJD || isNaN(hJD)) return latest
      const indepJD = hJD + 24  // Day 24 = typical independence
      if (!latest || indepJD > latest.indepJD) return { nest: n, indepJD }
      return latest
    }, null)

    if (latestSuccess) {
      const daysSinceIndep = todayJD - latestSuccess.indepJD
      if (daysSinceIndep >= 5 && daysSinceIndep <= 38) {
        return {
          status: TERRITORY_STATUS.RENEST_WATCH,
          visitInterval: VISIT_RULES.POST_FAILURE_DAYS, // Same 4-day interval for renest checks
          label: `Renest watch (${daysSinceIndep}d since independence)`,
          failedNestInfo: null,
        }
      }
    }
  }

  // 4. Pair present but no nest yet (early season or between attempts)
  if (hasFemale) {
    return {
      status: TERRITORY_STATUS.PAIR_NO_NEST,
      visitInterval: VISIT_RULES.PAIR_DAYS,
      label: 'Pair — no active nest',
      failedNestInfo: null,
    }
  }

  // 5. Single male
  if (hasMale && !hasFemale) {
    return {
      status: TERRITORY_STATUS.SINGLE_MALE,
      visitInterval: VISIT_RULES.SINGLE_MALE_DAYS,
      label: 'Single male',
      failedNestInfo: null,
    }
  }

  return {
    status: TERRITORY_STATUS.UNKNOWN,
    visitInterval: VISIT_RULES.OVERDUE_DAYS,
    label: 'Unknown',
    failedNestInfo: null,
  }
}

/**
 * Estimate when a nest failed, using the best available date info.
 * Returns the most recently failed nest with an estimated failure JD.
 * @private
 */
function _estimateFailureJD(failedNests, year) {
  let latest = null

  for (const n of failedNests) {
    let failureJD = null

    // Best: use hatch date + some chick age (if it failed post-hatch)
    if (n.date_hatch) {
      const hJD = parseInt(n.date_hatch)
      if (!isNaN(hJD)) {
        // If we have hatch and band counts, nest survived to at least banding
        if (n.band != null) failureJD = hJD + 7
        else if (n.hatch != null) failureJD = hJD + 2
        else failureJD = hJD
      }
    }

    // Second: DFE + incubation estimate (failed during incubation)
    if (!failureJD && n.dfe) {
      const dfeJD = parseInt(n.dfe)
      if (!isNaN(dfeJD)) {
        const cs = n.eggs ? parseInt(n.eggs) : 3  // assume 3 if unknown
        // Estimate failure somewhere mid-incubation
        failureJD = dfeJD + (cs - 1) + Math.floor(VISIT_RULES.INCUBATION_DAYS / 2)
      }
    }

    // Third: eggs but no DFE (found already incubating, then failed)
    // Use a rough estimate — failure likely happened within a few weeks of find
    if (!failureJD && n.eggs != null) {
      // Can't determine date without DFE or hatch — skip this nest
      // (better to not estimate than to produce a wildly wrong date)
      continue
    }

    if (failureJD && (!latest || failureJD > latest.failureJD)) {
      latest = { nest: n, failureJD }
    }
  }

  return latest
}

// ─── Date formatting ─────────────────────────────────────────

/**
 * Format a Julian day as "Mon D" (e.g., "Apr 5").
 * @param {number} year - Calendar year
 * @param {number} jd - Julian day of year
 * @returns {string} Formatted date or '?' if invalid
 */
export function formatJD(year, jd) {
  if (!jd || jd < 1 || isNaN(jd)) return '?'
  const { month, day } = fromJulianDay(year, jd)
  return `${MONTH_NAMES[month]} ${day}`
}

/**
 * Convert a Julian day to YYYY-MM-DD string.
 */
export function jdToDateStr(year, jd) {
  const { month, day } = fromJulianDay(year, jd)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Convert a YYYY-MM-DD string to a Julian day.
 */
export function dateStrToJD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toJulianDay(y, m, d)
}

// ─── Nest lifecycle date derivation ──────────────────────────

/**
 * Derive the full nest lifecycle timeline from available breed data.
 *
 * Given a nest's breed record (and optionally its visit history),
 * returns the key dates and current stage of the nest lifecycle:
 *
 *   Building → Laying → Incubating → Hatch → [post-hatch windows]
 *
 * INPUTS (from breed record):
 *   - dfe: Date of First Egg (Julian day)
 *   - eggs: clutch size
 *   - date_hatch: observed hatch date (Julian day)
 *   - hatch/band/fledge/indep: counts at each stage
 *   - stage_find: stage when nest was discovered
 *   - fail_code: failure code (null = active, '24' = success)
 *
 * OUTPUTS:
 *   - hatchJD: hatch date Julian day (from 3 sources)
 *   - hatchSource: how hatchJD was derived
 *   - dfeJD: DFE Julian day (derived or direct)
 *   - layingEndJD: last egg laid Julian day
 *   - incubationStartJD: incubation start Julian day
 *   - currentStage: which lifecycle stage the nest is currently in
 *   - chickAge: chick age in days (null if pre-hatch)
 *
 * @param {Object} nest - Breed record
 * @param {number} todayJD - Today's Julian day
 * @param {number} year - Calendar year
 * @param {Array} [nestVisits] - Optional nest visit records (for chick age fallback)
 * @returns {Object} Lifecycle timeline
 */
export function deriveNestLifecycle(nest, todayJD, year, nestVisits = []) {
  const result = {
    hatchJD: null, hatchSource: null,
    dfeJD: null, dfeSource: null,
    layingEndJD: null,
    incubationStartJD: null,
    chickAge: null,
    currentStage: null,
    isFailed: !!(nest.fail_code && nest.fail_code !== '24'),
    isSuccess: nest.fail_code === '24',
  }

  // ── Step 1: Derive hatch date (3 sources, in priority order) ──

  // Source 1: date_hatch directly from breed record
  let hatchJD = nest.date_hatch ? parseInt(nest.date_hatch) : null
  let hatchSource = 'observed'

  // Source 2: Estimate from DFE + incubation + laying interval
  if ((!hatchJD || isNaN(hatchJD)) && nest.dfe && nest.eggs) {
    hatchJD = parseInt(nest.dfe) + VISIT_RULES.INCUBATION_DAYS + (parseInt(nest.eggs) - 1)
    hatchSource = 'estimated from DFE'
  }

  // Source 3: Back-calculate from chick age observed during a visit
  if ((!hatchJD || isNaN(hatchJD)) && nestVisits.length > 0) {
    const chickObs = nestVisits
      .filter(v => v.chick_age_estimate >= 1 && v.visit_date)
      .map(v => ({ ...v, ...estimateHatchDate(v.visit_date, v.chick_age_estimate, year) }))
      .filter(v => v.hatchJulianDay !== null)
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2, insufficient_data: 3 }
        return (order[a.reliability] || 3) - (order[b.reliability] || 3)
      })
    if (chickObs.length > 0) {
      hatchJD = chickObs[0].hatchJulianDay
      hatchSource = 'from chick age'
    }
  }

  if (hatchJD && isNaN(hatchJD)) hatchJD = null
  result.hatchJD = hatchJD
  result.hatchSource = hatchJD ? hatchSource : null

  // ── Step 2: Derive DFE and pre-hatch dates ──

  // DFE from breed record
  let dfeJD = nest.dfe ? parseInt(nest.dfe) : null
  let dfeSource = 'observed'

  // If no DFE but we have hatch date and clutch size, back-calculate
  if ((!dfeJD || isNaN(dfeJD)) && hatchJD && nest.eggs) {
    const cs = parseInt(nest.eggs)
    if (cs >= 1) {
      dfeJD = hatchJD - VISIT_RULES.INCUBATION_DAYS - (cs - 1)
      dfeSource = 'from hatch date'
    }
  }

  if (dfeJD && isNaN(dfeJD)) dfeJD = null
  result.dfeJD = dfeJD
  result.dfeSource = dfeJD ? dfeSource : null

  // Laying and incubation periods (only if we have DFE and clutch size)
  if (dfeJD && nest.eggs) {
    const cs = parseInt(nest.eggs)
    if (cs >= 1) {
      result.layingEndJD = dfeJD + (cs - 1)        // Last egg laid
      result.incubationStartJD = dfeJD + (cs - 1)  // Incubation starts when last egg laid
    }
  }

  // ── Step 3: Chick age (only if post-hatch) ──
  if (hatchJD) {
    result.chickAge = todayJD - hatchJD + 1
  }

  // ── Step 4: Current stage ──
  if (result.isFailed) {
    result.currentStage = 'failed'
  } else if (result.isSuccess) {
    result.currentStage = 'success'
  } else if (nest.indep != null && nest.indep !== '') {
    result.currentStage = 'independent'
  } else if (nest.fledge != null && nest.fledge !== '') {
    result.currentStage = 'fledged'
  } else if (nest.band != null && nest.band !== '') {
    result.currentStage = 'banded'
  } else if (nest.hatch != null && nest.hatch !== '') {
    result.currentStage = 'nestling'
  } else if (hatchJD && result.chickAge >= 1) {
    result.currentStage = 'nestling'
  } else if (nest.eggs != null && nest.eggs !== '') {
    // Have eggs — determine if laying or incubating
    if (result.incubationStartJD && todayJD >= result.incubationStartJD) {
      result.currentStage = 'incubating'
    } else if (dfeJD && todayJD >= dfeJD) {
      result.currentStage = 'laying'
    } else {
      result.currentStage = 'incubating' // eggs counted, assume incubating
    }
  } else if (nest.stage_find === 'IC') {
    result.currentStage = 'incubating'
  } else if (nest.stage_find === 'EL') {
    result.currentStage = 'laying'
  } else if (nest.stage_find === 'NB') {
    result.currentStage = 'building'
  } else {
    result.currentStage = 'building' // default for new active nests
  }

  return result
}

// ─── Protocol window helpers ─────────────────────────────────

/**
 * Build protocol windows for a nest with completion status.
 * Used by territory page and nest detail page for consistent display.
 *
 * @param {Object} nest - Breed record
 * @returns {Array} Protocol windows with `completed` flag
 */
export function getProtocolWindows(nest) {
  return PROTOCOL_WINDOWS.map(w => ({
    ...w,
    completed: w.field ? (nest[w.field] != null && nest[w.field] !== '') : false,
  }))
}

/**
 * Get the highest-priority protocol event for a nest on a given chick-day.
 * Used by the home page schedule grid.
 *
 * @param {number} chickDay - Chick age in days
 * @param {Object} nest - Breed record (with hatchJD added)
 * @returns {Object|null} Event with completion status, or null
 */
export function getNestEvent(chickDay, nest) {
  for (const w of PROTOCOL_WINDOWS) {
    if (chickDay >= w.startDay && chickDay <= w.endDay) {
      const completed = w.field ? (nest[w.field] != null && nest[w.field] !== '') : false
      return { ...w, completed, chickDay }
    }
  }
  // Renest check window
  const nestDone = (nest.indep != null && nest.indep !== '')
    || (nest.fail_code && nest.fail_code !== '24')
    || nest.fail_code === '24'
  if (nestDone && chickDay >= RENEST_WINDOW.startDay && chickDay <= RENEST_WINDOW.endDay) {
    return { ...RENEST_WINDOW, completed: false, chickDay }
  }
  return null
}

/**
 * Format a protocol window's date range using actual calendar dates.
 * E.g., "Apr 5–8" instead of "D4-7".
 *
 * @param {Object} window - Protocol window
 * @param {number} hatchJD - Hatch Julian day
 * @param {number} year - Calendar year
 * @returns {string} Formatted date range
 */
export function formatWindowDates(window, hatchJD, year) {
  if (!hatchJD) return `D${window.startDay}-${window.endDay}`
  const startJD = hatchJD + window.startDay - 1
  const endJD = hatchJD + window.endDay - 1
  const start = formatJD(year, startJD)
  const end = formatJD(year, endJD)
  // Guard: if either date is invalid, fall back to day numbers
  if (start === '?' || end === '?') return `D${window.startDay}-${window.endDay}`
  // If same month, abbreviate: "Apr 5–8"
  const [startMonth] = start.split(' ')
  const [endMonth, endDay] = end.split(' ')
  if (startMonth === endMonth) {
    return `${start}–${endDay}`
  }
  return `${start}–${end}`
}

/**
 * Get the suggested stage and action hint for a nest right now.
 * Used for visit form defaults and alert badges.
 *
 * @param {Object} nest - Breed record
 * @param {number} todayJD - Today's Julian day
 * @returns {Object|null} { stage, hint, color } or null
 */
export function getSuggestedAction(nest, todayJD) {
  let hatchJD = nest.date_hatch ? parseInt(nest.date_hatch) : null
  if (!hatchJD && nest.dfe && nest.eggs) {
    hatchJD = parseInt(nest.dfe) + VISIT_RULES.INCUBATION_DAYS + (parseInt(nest.eggs) - 1)
  }
  if (!hatchJD || isNaN(hatchJD)) return null

  const chickAge = todayJD - hatchJD + 1
  if (chickAge < 1) return null

  // Completion checks use == null to correctly treat 0 as "done"
  // (0 = observed zero, the protocol step WAS completed)
  if (chickAge >= 4 && chickAge <= 7 && (nest.band == null || nest.band === ''))
    return { stage: 'nestling', hint: `Band window! Day ${chickAge}`, color: 'bg-emerald-200 text-emerald-800' }
  if (chickAge >= 9 && chickAge <= 11)
    return { stage: null, hint: `DANGER Day ${chickAge} — DO NOT APPROACH`, color: 'bg-red-200 text-red-800' }
  if (chickAge >= 12 && chickAge <= 14 && (nest.fledge == null || nest.fledge === ''))
    return { stage: 'fledged', hint: `Fledge check! Day ${chickAge}`, color: 'bg-blue-200 text-blue-800' }
  if (chickAge >= 22 && chickAge <= 26 && (nest.indep == null || nest.indep === ''))
    return { stage: 'independent', hint: `Independence check! Day ${chickAge}`, color: 'bg-purple-200 text-purple-800' }
  if (chickAge >= 1 && chickAge <= 3)
    return { stage: 'nestling', hint: `Nestling Day ${chickAge}`, color: 'bg-yellow-100 text-yellow-800' }

  return null
}

// ─── Nest status badge (shared by nests list + territory page) ─
/**
 * Determine the status badge for a nest based on its breed record.
 * Returns { label, color } where color is Tailwind classes.
 *
 * @param {Object} nest - Breed record
 * @returns {{ label: string, color: string }}
 */
export function nestStatusBadge(nest) {
  if (nest.fail_code === '24') return { label: 'Success', color: 'bg-green-100 text-green-700' }
  if (nest.fail_code && nest.fail_code !== '24') return { label: 'Failed', color: 'bg-red-100 text-red-700' }
  if (nest.indep != null) return { label: 'Independent', color: 'bg-green-100 text-green-700' }
  if (nest.fledge != null) return { label: 'Fledged', color: 'bg-blue-100 text-blue-700' }
  if (nest.band != null) return { label: 'Banded', color: 'bg-blue-100 text-blue-700' }
  if (nest.hatch != null) return { label: 'Hatched', color: 'bg-yellow-100 text-yellow-700' }
  if (nest.eggs != null) return { label: 'Eggs', color: 'bg-yellow-100 text-yellow-700' }
  return { label: nest.stage_find || 'Active', color: 'bg-gray-100 text-gray-700' }
}

// ─── Event priority (for sorting: lower = more urgent) ───────
export const EVENT_PRIORITY = {
  danger: 0, band: 1, fledge: 2, indep: 3,
  renest: 4, nestcheck: 5, visit: 6, planned: 7,
}
