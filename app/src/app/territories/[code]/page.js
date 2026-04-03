'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel, localDateString, localTimeString, toJulianDay, fromJulianDay } from '@/lib/helpers'
import { NEST_STAGES, MONTH_NAMES, TERRITORY_STATUS, deriveNestLifecycle, getProtocolWindows, formatWindowDates, formatJD, getSuggestedAction, nestStatusBadge, classifyTerritory } from '@/lib/protocol'

// 2026 field crew — update this list each season
const OBSERVER_LIST = ['Katherine', 'Emma', 'Anna', 'Jon', 'Jen']

// Safe parseInt that returns null instead of NaN (prevents corrupt DB writes)
const safeInt = (v) => { const n = parseInt(v); return isNaN(n) ? null : n }

// Visit log date/time formatters
const fmtVisitDate = (d) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}` }
const fmtVisitTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

export default function TerritoryDetailPage({ params }) {
  const { code } = params
  const router = useRouter()
  const territoryCode = decodeURIComponent(code)
  const currentYear = new Date().getFullYear()

  const [male, setMale] = useState(null)
  const [female, setFemale] = useState(null)
  const [allAssignments, setAllAssignments] = useState([])
  const [visits, setVisits] = useState([])
  const [nests, setNests] = useState([])
  const [nestVisitsMap, setNestVisitsMap] = useState({}) // breed_id -> [nest_visits]
  const [loading, setLoading] = useState(true)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedNest, setExpandedNest] = useState(null) // breed_id of expanded nest card
  const [editingVisit, setEditingVisit] = useState(null) // visit_id being edited
  const [editForm, setEditForm] = useState({}) // editable fields for the visit being edited
  const [failcodes, setFailcodes] = useState([]) // lookup_failcode rows

  const [visitForm, setVisitForm] = useState({
    visit_date: localDateString(),
    visit_time: localTimeString(),
    observer: '',
    male_seen: false,
    female_seen: false,
    minutes_spent: '',
    other_birds_notes: '',
    nest_status_flag: 'no_change',
    notes: '',
  })

  const [nestObs, setNestObs] = useState({}) // keyed by breed_id
  const [selectedNestForObs, setSelectedNestForObs] = useState(null) // breed_id of nest selected for observation in visit form
  const [kidBirds, setKidBirds] = useState({}) // band_id -> { color_combo } for banded chicks

  // Nest sequence: earliest breed_id on this territory = #1
  const nestSeq = useMemo(() => {
    const sorted = [...nests].sort((a, b) => a.breed_id - b.breed_id)
    const m = {}
    sorted.forEach((n, i) => { m[n.breed_id] = i + 1 })
    return m
  }, [nests])

  // Grouped visit log: territory visits as anchors, nest visits folded in
  const groupedVisits = useMemo(() => {
    const allNestVisits = Object.values(nestVisitsMap).flat()

    // Territory visits are the anchors — attach matching nest visits
    const groups = visits.map(tv => ({
      ...tv,
      type: 'territory',
      nestObs: [],
    }))

    // Match nest visits to territory visits by date + time + observer
    const unmatched = []
    for (const nv of allNestVisits) {
      const match = groups.find(g =>
        g.visit_date === nv.visit_date &&
        g.visit_time === nv.visit_time &&
        g.observer === nv.observer
      )
      if (match) {
        match.nestObs.push({ ...nv, nestLabel: `Nest #${nestSeq[nv.breed_id] || '?'}` })
      } else {
        // Orphaned nest visit (no matching territory visit) — show standalone
        unmatched.push({ ...nv, type: 'nest_only', nestLabel: `Nest #${nestSeq[nv.breed_id] || '?'}`, nestObs: [] })
      }
    }

    return [...groups, ...unmatched].sort((a, b) => {
      const dateA = a.visit_date || ''
      const dateB = b.visit_date || ''
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return (a.visit_time || '').localeCompare(b.visit_time || '')
    })
  }, [visits, nestVisitsMap, nestSeq])

  const totalVisitCount = visits.length + Object.values(nestVisitsMap).flat().length

  useEffect(() => { loadAll() }, [territoryCode])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mandarte_observer') : null
    if (saved) setVisitForm(f => ({ ...f, observer: saved }))
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      // Load fail codes for nest failure dropdown
      if (failcodes.length === 0) {
        const { data: fcData } = await supabase.from('lookup_failcode').select('*')
        if (fcData) setFailcodes(fcData)
      }

      const { data: allAssign } = await supabase
        .from('territory_assignments')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .neq('role', 'floater')
        .order('start_date', { ascending: true })
      setAllAssignments(allAssign || [])

      const currentMale = (allAssign || []).find(a => a.sex === 2 && !a.end_date) || null
      const currentFemale = (allAssign || []).find(a => a.sex === 1 && !a.end_date) || null
      setMale(currentMale)
      setFemale(currentFemale)

      const { data: visitData } = await supabase
        .from('territory_visits')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .order('visit_date', { ascending: true })
      setVisits(visitData || [])

      const { data: nestData } = await supabase
        .from('breed')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .order('nestrec', { ascending: true })
      setNests(nestData || [])

      // Load color combos for banded chicks (for independence display)
      if (nestData) {
        const kidIds = nestData.flatMap(n =>
          [n.kid1, n.kid2, n.kid3, n.kid4, n.kid5].filter(Boolean)
        )
        if (kidIds.length > 0) {
          const { data: birds } = await supabase.from('birds')
            .select('band_id, color_combo').in('band_id', kidIds)
          const birdMap = {}
          for (const b of (birds || [])) { birdMap[b.band_id] = b }
          setKidBirds(birdMap)
        }
      }

      // Load nest visits for all nests on this territory
      if (nestData && nestData.length > 0) {
        const breedIds = nestData.map(n => n.breed_id)
        const { data: nvData } = await supabase
          .from('nest_visits')
          .select('*')
          .in('breed_id', breedIds)
          .order('visit_date', { ascending: true })
        const nvMap = {}
        for (const nv of (nvData || [])) {
          if (!nvMap[nv.breed_id]) nvMap[nv.breed_id] = []
          nvMap[nv.breed_id].push(nv)
        }
        setNestVisitsMap(nvMap)
      } else {
        setNestVisitsMap({})
      }
    } catch (err) {
      console.error('Error loading territory:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Determine suggested stage for each nest based on protocol ──
  // Uses shared protocol module for consistent logic
  function getSuggestedStage(nest) {
    return getSuggestedAction(nest, todayJD)
  }

  // Shared: validate and save banding data from an observation object
  // obs has kid1..kid5 (band numbers) and kid1_combo..kid5_combo (color combos)
  // Returns { ok: true } or { ok: false, error: 'message' }
  async function saveBandingData(breedId, obs, nestYear) {
    const kids = []
    for (let i = 1; i <= 5; i++) {
      const bandId = obs[`kid${i}`]?.trim()
      if (!bandId) continue
      // Validate: must be exactly 9 digits
      if (bandId.length !== 9 || !/^\d{9}$/.test(bandId)) {
        return { ok: false, error: `Chick ${i} band # must be exactly 9 digits (got "${bandId}")` }
      }
      const combo = obs[`kid${i}_combo`]?.trim() || null
      kids.push({ slot: i, bandId: parseInt(bandId), combo })
    }
    if (kids.length === 0) return { ok: true }

    // Check for duplicate band numbers within this banding
    const bandIds = kids.map(k => k.bandId)
    const uniqueIds = new Set(bandIds)
    if (uniqueIds.size !== bandIds.length) {
      return { ok: false, error: 'Duplicate band numbers entered — each chick needs a unique band.' }
    }

    // Check for duplicates against existing kids already on this nest
    const nest = nests.find(n => n.breed_id === breedId)
    if (nest) {
      const existingKids = [nest.kid1, nest.kid2, nest.kid3, nest.kid4, nest.kid5].filter(Boolean)
      for (const kid of kids) {
        if (existingKids.includes(kid.bandId)) {
          return { ok: false, error: `Band ${String(kid.bandId)} is already recorded on this nest.` }
        }
      }
    }

    // Upsert bird records (create if new, don't overwrite existing)
    for (const kid of kids) {
      const { error: upsertErr } = await supabase.from('birds').upsert(
        { band_id: kid.bandId, sex: 0, is_immigrant: 0, natal_year: nestYear },
        { onConflict: 'band_id', ignoreDuplicates: true }
      )
      if (upsertErr) return { ok: false, error: `Failed to create bird record for ${kid.bandId}: ${upsertErr.message}` }

      // Update color combo if provided (separate update so it doesn't overwrite existing combo)
      if (kid.combo) {
        await supabase.from('birds').update({ color_combo: kid.combo }).eq('band_id', kid.bandId)
      }
    }

    // Update breed.kid1-kid5 — fill into FIRST EMPTY slots sequentially, not by input position
    const breedKidUpdates = {}
    let nextSlot = 1
    for (const kid of kids) {
      // Skip slots that already have a value
      while (nextSlot <= 5 && nest && nest[`kid${nextSlot}`] != null) nextSlot++
      if (nextSlot > 5) break // no more empty slots
      breedKidUpdates[`kid${nextSlot}`] = kid.bandId
      nextSlot++
    }
    // Update band count: existing kids + new kids
    if (nest && nest.band == null) {
      const existingCount = [nest.kid1, nest.kid2, nest.kid3, nest.kid4, nest.kid5].filter(Boolean).length
      breedKidUpdates.band = existingCount + kids.length
    }
    if (Object.keys(breedKidUpdates).length > 0) {
      const { error: breedErr } = await supabase.from('breed').update(breedKidUpdates).eq('breed_id', breedId)
      if (breedErr) return { ok: false, error: `Failed to update nest card: ${breedErr.message}` }
    }

    return { ok: true }
  }

  async function handleSubmitVisit(e) {
    e.preventDefault()
    if (!visitForm.observer || !visitForm.notes?.trim()) {
      alert('Observer and territory notes are required.')
      return
    }
    if (visitForm.notes.trim().length < 3) {
      alert('Please add at least a brief observation.')
      return
    }

    setSubmitting(true)
    try {
      const hasNestObs = Object.values(nestObs).some(obs => obs.stage && obs.stage !== 'no_change')
      const finalNestStatusFlag = hasNestObs ? 'existing_nest_checked' : visitForm.nest_status_flag

      const { data: tvData, error } = await supabase.from('territory_visits').insert({
        territory: territoryCode,
        year: currentYear,
        visit_date: visitForm.visit_date,
        visit_time: visitForm.visit_time || null,
        observer: visitForm.observer.trim(),
        male_seen: visitForm.male_seen,
        male_band_id: male?.band_id > 0 ? male.band_id : null,
        male_color_combo: male?.color_combo || null,
        female_seen: visitForm.female_seen,
        female_band_id: female?.band_id > 0 ? female.band_id : null,
        female_color_combo: female?.color_combo || null,
        minutes_spent: visitForm.minutes_spent ? parseInt(visitForm.minutes_spent) : null,
        other_birds_notes: visitForm.other_birds_notes || null,
        nest_status_flag: finalNestStatusFlag,
        notes: visitForm.notes.trim(),
      }).select('visit_id').single()

      if (error) throw error
      const territoryVisitId = tvData?.visit_id || null

      // Insert nest_visits rows for each nest with observations
      if (hasNestObs) {
        const nestVisitsToInsert = Object.entries(nestObs)
          .filter(([_, obs]) => obs.stage && obs.stage !== 'no_change')
          .map(([breedIdStr, obs]) => {
            const breedId = parseInt(breedIdStr)
            const nest = nests.find(n => n.breed_id === breedId)
            return {
              breed_id: breedId,
              nestrec: nest?.nestrec || null,
              territory_visit_id: territoryVisitId,
              visit_date: visitForm.visit_date,
              visit_time: visitForm.visit_time || null,
              observer: visitForm.observer.trim(),
              nest_stage: obs.stage,
              egg_count: obs.egg_count ? parseInt(obs.egg_count) : null,
              chick_count: obs.chick_count ? parseInt(obs.chick_count) : null,
              chick_age_estimate: obs.chick_age_estimate ? parseInt(obs.chick_age_estimate) : null,
              cowbird_eggs: obs.cowbird_eggs ? parseInt(obs.cowbird_eggs) : null,
              cowbird_chicks: obs.cowbird_chicks ? parseInt(obs.cowbird_chicks) : null,
              comments: obs.nest_comment?.trim() || null,
            }
          })

        if (nestVisitsToInsert.length > 0) {
          const { error: nestError } = await supabase.from('nest_visits').insert(nestVisitsToInsert)
          if (nestError) throw nestError
        }

        // Auto-populate breed fields + banding for each nest observation

        for (const [breedIdStr, obs] of Object.entries(nestObs)) {
          if (!obs.stage || obs.stage === 'no_change') continue
          const breedId = parseInt(breedIdStr)
          const nest = nests.find(n => n.breed_id === breedId)
          if (!nest) continue

          const breedUpdates = {}
          if (obs.stage === 'laying') {
            if (safeInt(obs.egg_count) != null && nest.eggs == null) breedUpdates.eggs = safeInt(obs.egg_count)
            if (obs.eggs_quality && !nest.eggs_quality) breedUpdates.eggs_quality = obs.eggs_quality
            if (obs.eggs_laid && !nest.eggs_laid) breedUpdates.eggs_laid = obs.eggs_laid
            if (obs.whole_clutch && !nest.whole_clutch) breedUpdates.whole_clutch = obs.whole_clutch
            // DFE = date first egg. Back-calculate: one egg per day.
            if (nest.dfe == null) {
              const [y, m, d] = visitForm.visit_date.split('-').map(Number)
              const visitJD = toJulianDay(y, m, d)
              const eggsSeen = safeInt(obs.egg_count)
              breedUpdates.dfe = eggsSeen != null && eggsSeen > 1 ? visitJD - (eggsSeen - 1) : visitJD
            }
          }
          if (obs.stage === 'incubating') {
            if (safeInt(obs.egg_count) != null && nest.eggs == null) breedUpdates.eggs = safeInt(obs.egg_count)
            if (obs.eggs_quality && !nest.eggs_quality) breedUpdates.eggs_quality = obs.eggs_quality
            if (obs.whole_clutch && !nest.whole_clutch) breedUpdates.whole_clutch = obs.whole_clutch
          }
          if (obs.stage === 'laying' || obs.stage === 'incubating') {
            if (safeInt(obs.cowbird_eggs) != null && nest.cow_egg == null) breedUpdates.cow_egg = safeInt(obs.cowbird_eggs)
          }
          if (obs.stage === 'hatching') {
            if (safeInt(obs.chick_count) != null && nest.hatch == null) breedUpdates.hatch = safeInt(obs.chick_count)
            if (obs.hatch_quality && !nest.hatch_quality) breedUpdates.hatch_quality = obs.hatch_quality
            if (obs.unhatch && !nest.unhatch) breedUpdates.unhatch = obs.unhatch
            if (obs.broke_egg && !nest.broke_egg) breedUpdates.broke_egg = obs.broke_egg
            if (safeInt(obs.cowbird_chicks) != null && nest.cow_hatch == null) breedUpdates.cow_hatch = safeInt(obs.cowbird_chicks)
            if (nest.date_hatch == null) {
              const [y, m, d] = visitForm.visit_date.split('-').map(Number)
              breedUpdates.date_hatch = toJulianDay(y, m, d)
            }
          }
          if (obs.stage === 'nestling') {
            if (safeInt(obs.chick_count) != null && nest.hatch == null) breedUpdates.hatch = safeInt(obs.chick_count)
            if (safeInt(obs.cowbird_chicks) != null && nest.cow_hatch == null) breedUpdates.cow_hatch = safeInt(obs.cowbird_chicks)
            if (obs.band_quality && !nest.band_quality) breedUpdates.band_quality = obs.band_quality
            if (obs.cow_band && !nest.cow_band) breedUpdates.cow_band = obs.cow_band
          }
          if (obs.stage === 'fledged') {
            if (safeInt(obs.chick_count) != null && nest.fledge == null) breedUpdates.fledge = safeInt(obs.chick_count)
            if (obs.fledge_quality && !nest.fledge_quality) breedUpdates.fledge_quality = obs.fledge_quality
            if (obs.cow_fledge && nest.cow_fledge == null) breedUpdates.cow_fledge = String(obs.cow_fledge)
          }
          if (obs.stage === 'independent') {
            if (safeInt(obs.chick_count) != null && nest.indep == null) breedUpdates.indep = safeInt(obs.chick_count)
            if (obs.indep_quality && !nest.indep_quality) breedUpdates.indep_quality = obs.indep_quality
          }
          if (obs.stage === 'failed') {
            if (obs.fail_code && !nest.fail_code) breedUpdates.fail_code = obs.fail_code
            if (obs.stage_fail && !nest.stage_fail) breedUpdates.stage_fail = obs.stage_fail
          }
          if (Object.keys(breedUpdates).length > 0) {
            await supabase.from('breed').update(breedUpdates).eq('breed_id', breedId)
          }

          // Save independence sightings to normalized table
          if (obs.stage === 'independent') {
            const [y, m, d] = visitForm.visit_date.split('-').map(Number)
            const jd = toJulianDay(y, m, d)
            for (let i = 1; i <= 5; i++) {
              if (obs[`kid${i}_indep`] && nest[`kid${i}`]) {
                await supabase.from('independence_sightings').upsert({
                  band_id: nest[`kid${i}`],
                  breed_id: breedId,
                  sighting_date: visitForm.visit_date,
                  sighting_jd: jd,
                  observer: visitForm.observer.trim(),
                }, { onConflict: 'band_id,breed_id', ignoreDuplicates: true })
              }
            }
          }

          // Save banding data if nestling with kid band numbers
          if (obs.stage === 'nestling' && (obs.kid1 || obs.kid2 || obs.kid3 || obs.kid4 || obs.kid5)) {
            const result = await saveBandingData(breedId, obs, currentYear)
            if (!result.ok) throw new Error(result.error)
          }
        }
      }

      if (typeof window !== 'undefined') localStorage.setItem('mandarte_observer', visitForm.observer.trim())

      if (visitForm.nest_status_flag === 'new_nest_found') {
        const params = new URLSearchParams({
          territory: territoryCode,
          visit_date: visitForm.visit_date,
          observer: visitForm.observer.trim(),
        })
        router.push(`/nests/new?${params.toString()}`)
        return
      }

      setShowVisitForm(false)
      setVisitForm(f => ({
        ...f,
        visit_date: localDateString(),
        visit_time: localTimeString(),
        male_seen: false, female_seen: false,
        minutes_spent: '', other_birds_notes: '',
        nest_status_flag: 'no_change', notes: '',
      }))
      setNestObs({})
      loadAll()
    } catch (err) {
      alert('Error saving visit: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveVisitEdit(visitId) {
    try {
      // Find the original visit to know old date/observer for syncing nest visits
      const original = visits.find(v => v.visit_id === visitId)
      const updates = {
        visit_date: editForm.visit_date,
        visit_time: editForm.visit_time || null,
        observer: editForm.observer?.trim() || null,
        notes: editForm.notes?.trim() || null,
        other_birds_notes: editForm.other_birds_notes?.trim() || null,
        male_seen: editForm.male_seen,
        female_seen: editForm.female_seen,
        minutes_spent: editForm.minutes_spent ? parseInt(editForm.minutes_spent) : null,
      }
      const { error } = await supabase.from('territory_visits').update(updates).eq('visit_id', visitId)
      if (error) throw error

      // Sync nest visits that were created with this territory visit
      // (same date + observer + nest belongs to this territory)
      const origObserver = original?.observer || ''
      const newObserver = editForm.observer?.trim() || ''
      if (original && (original.visit_date !== editForm.visit_date || origObserver !== newObserver)) {
        const breedIds = nests.map(n => n.breed_id)
        if (breedIds.length > 0) {
          const nestUpdates = {
            visit_date: editForm.visit_date,
            visit_time: editForm.visit_time || null,
            observer: newObserver || null,
          }
          let query = supabase.from('nest_visits')
            .update(nestUpdates)
            .in('breed_id', breedIds)
            .eq('visit_date', original.visit_date)
          // Handle null vs non-null observer matching
          if (original.observer) {
            query = query.eq('observer', original.observer)
          } else {
            query = query.is('observer', null)
          }
          const { error: nvErr } = await query
          if (nvErr) console.error('Warning: nest visit sync failed:', nvErr.message)
        }
      }

      setEditingVisit(null)
      setEditForm({})
      loadAll()
    } catch (err) {
      alert('Error updating visit: ' + err.message)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-forest-300 border-t-forest-600"></div>
    </div>
  )

  const lastVisitDate = visits[0]?.visit_date
  const daysSince = lastVisitDate
    ? (() => {
        const [ly, lm, ld] = lastVisitDate.split('-').map(Number)
        const now = new Date()
        const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
        const visitMs = Date.UTC(ly, lm - 1, ld)
        return Math.floor((todayMs - visitMs) / (1000 * 60 * 60 * 24))
      })()
    : null

  // Protocol schedule helpers (using shared protocol module)
  const now = new Date()
  const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const fmtDate = (jd) => formatJD(currentYear, jd)

  const activeNests = nests.filter(n => !n.fail_code)
  const hasActiveNests = activeNests.length > 0

  // Territory status classification (visit frequency per protocol)
  // allAssignments includes current + ended; filter to current (no end_date)
  const currentAssignments = allAssignments.filter(a => !a.end_date)
  const hasFemale = currentAssignments.some(a => a.sex === 1)
  const hasMale = currentAssignments.some(a => a.sex === 2)
  const terrStatus = classifyTerritory({ hasFemale, hasMale, nests, todayJD, year: currentYear })
  const visitInterval = terrStatus.visitInterval
  const isOverdue = daysSince !== null && daysSince >= visitInterval

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/territories" className="text-forest-600 font-semibold hover:text-forest-700 text-sm">&larr; Territories</Link>
      </div>

      {/* Territory card header */}
      <div className="card p-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold text-forest-800">Territory {territoryCode}</h2>
          {daysSince !== null && (
            <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${
              !isOverdue ? 'badge badge-success' :
              daysSince <= visitInterval + 2 ? 'badge badge-warning' :
              'badge badge-danger'
            }`}>
              {daysSince === 0 ? 'Visited today' : `${daysSince}d ago`}
            </span>
          )}
        </div>

        {/* Territory status + visit schedule */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-2xs text-bark-600">Visit every {visitInterval}d</span>
          {terrStatus.status === TERRITORY_STATUS.SINGLE_MALE && (
            <span className="badge badge-info text-2xs">♂ Single male</span>
          )}
          {(terrStatus.status === TERRITORY_STATUS.RENEST_WATCH || terrStatus.status === TERRITORY_STATUS.RENEST_URGENT) && (
            <span className={`${
              terrStatus.status === TERRITORY_STATUS.RENEST_URGENT
                ? 'badge badge-danger' : 'badge badge-warning'
            } text-2xs`}>
              {terrStatus.label}
            </span>
          )}
        </div>

        {/* Resident birds */}
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-2xs font-bold text-forest-600 mb-2">♂ Males</div>
            {allAssignments.filter(a => a.sex === 2).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-bark-600">
                <span>— No male assigned</span>
                <Link href="/birds" className="text-2xs text-forest-600 font-semibold hover:underline">Assign</Link>
              </div>
            ) : (
              <div className="space-y-1">
                {allAssignments.filter(a => a.sex === 2).map(a => (
                  <div key={a.assignment_id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${
                    !a.end_date ? 'bg-forest-50 border border-forest-200' : 'bg-cream-100 border border-cream-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`band-id ${a.end_date ? 'text-bark-500' : 'text-forest-700'}`}>
                        {birdLabel(a)}
                      </span>
                      {a.confirmed && <span className="text-2xs text-sage-400">✓</span>}
                      {!a.end_date && <span className="text-2xs bg-forest-600 text-white px-1.5 py-0.5 rounded">current</span>}
                    </div>
                    <span className="text-2xs text-bark-600">
                      {a.start_date}{a.end_date ? ` → ${a.end_date}` : ' → present'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-2xs font-bold text-rust-500 mb-2">♀ Females</div>
            {allAssignments.filter(a => a.sex === 1).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-bark-600">
                <span>— No female assigned</span>
                <Link href="/birds" className="text-2xs text-forest-600 font-semibold hover:underline">Assign</Link>
              </div>
            ) : (
              <div className="space-y-1">
                {allAssignments.filter(a => a.sex === 1).map(a => (
                  <div key={a.assignment_id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${
                    !a.end_date ? 'bg-rust-50 border border-rust-200' : 'bg-cream-100 border border-cream-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`band-id ${a.end_date ? 'text-bark-500' : 'text-rust-600'}`}>
                        {birdLabel(a)}
                      </span>
                      {a.confirmed && <span className="text-2xs text-sage-400">✓</span>}
                      {!a.end_date && <span className="text-2xs bg-rust-500 text-white px-1.5 py-0.5 rounded">current</span>}
                    </div>
                    <span className="text-2xs text-bark-600">
                      {a.start_date}{a.end_date ? ` → ${a.end_date}` : ' → present'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-2xs text-bark-600 mt-3">
          {visits.length} visits · {nests.length} nest{nests.length !== 1 ? 's' : ''} this season
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowVisitForm(!showVisitForm)}
          className="flex-1 btn-primary btn-md"
        >
          Log Visit
        </button>
        <Link
          href={`/nests/new?territory=${encodeURIComponent(territoryCode)}`}
          className="flex-1 btn-accent btn-md text-center"
        >
          New Nest
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          VISIT FORM
          ═══════════════════════════════════════════════════════════════ */}
      {showVisitForm && (
        <form onSubmit={handleSubmitVisit} className="card p-4 space-y-4">
          <h3 className="section-title">Log Territory Visit</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={visitForm.visit_date}
                onChange={e => setVisitForm({ ...visitForm, visit_date: e.target.value })}
                className="input w-full" />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" value={visitForm.visit_time}
                onChange={e => setVisitForm({ ...visitForm, visit_time: e.target.value })}
                className="input w-full" />
            </div>
          </div>

          <div>
            <label className="label">Observer *</label>
            <select value={visitForm.observer}
              onChange={e => setVisitForm({ ...visitForm, observer: e.target.value })}
              className="input w-full" required>
              <option value="">Select observer...</option>
              {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          {/* Seen checkboxes */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visitForm.male_seen}
                onChange={e => setVisitForm({ ...visitForm, male_seen: e.target.checked })}
                className="w-5 h-5 rounded" />
              <span>♂ Male seen</span>
              {male?.color_combo && <span className="band-id">{male.color_combo}</span>}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visitForm.female_seen}
                onChange={e => setVisitForm({ ...visitForm, female_seen: e.target.checked })}
                className="w-5 h-5 rounded" />
              <span>♀ Female seen</span>
              {female?.color_combo && <span className="band-id">{female.color_combo}</span>}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Minutes spent</label>
              <input type="number" min="0" value={visitForm.minutes_spent}
                onChange={e => setVisitForm({ ...visitForm, minutes_spent: e.target.value })}
                placeholder="e.g., 15" className="input w-full" />
            </div>
            <div>
              <label className="label">Nest activity</label>
              {hasActiveNests ? (
                <>
                  <select value={visitForm.nest_status_flag}
                    onChange={e => setVisitForm({ ...visitForm, nest_status_flag: e.target.value })}
                    className="input w-full">
                    <option value="no_change">Use nest cards below</option>
                    <option value="new_nest_found">New nest!</option>
                  </select>
                  <p className="text-2xs text-bark-600 mt-0.5">Record nest observations in the cards below</p>
                </>
              ) : (
                <select value={visitForm.nest_status_flag}
                  onChange={e => setVisitForm({ ...visitForm, nest_status_flag: e.target.value })}
                  className="input w-full">
                  <option value="no_change">None</option>
                  <option value="existing_nest_checked">Checked nest</option>
                  <option value="new_nest_found">New nest!</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="label">Visit notes *</label>
            <textarea value={visitForm.notes}
              onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })}
              placeholder="Territory + nest observations, behavior, song, location..."
              className="input w-full" rows={3} required />
            {visitForm.notes.trim().length > 0 && visitForm.notes.trim().length < 3 && (
              <p className="text-2xs text-rust-600 mt-1">Please add at least a brief observation.</p>
            )}
          </div>

          <div>
            <label className="label">Other sparrows seen <span className="text-bark-600 font-normal text-2xs">(optional — band combos of floaters, neighbours, etc.)</span></label>
            <input type="text" value={visitForm.other_birds_notes}
              onChange={e => setVisitForm({ ...visitForm, other_birds_notes: e.target.value })}
              placeholder="e.g. RW-SG on south edge"
              className="input w-full" />
          </div>

          {/* ── Nest observations within visit form ── */}
          {hasActiveNests && (
            <div className="border-t border-cream-300 pt-4">
              <h4 className="section-subtitle mb-1">Nest Observations</h4>
              <p className="text-2xs text-bark-600 mb-3">Stage and counts saved to each nest's card.</p>

              {/* Nest selector — show buttons when multiple nests */}
              {activeNests.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {activeNests.map(nest => {
                    const status = nestStatusBadge(nest)
                    const isSelected = selectedNestForObs === nest.breed_id
                    const hasObs = nestObs[nest.breed_id]?.stage && nestObs[nest.breed_id]?.stage !== 'no_change'
                    return (
                      <button key={nest.breed_id} type="button"
                        onClick={() => setSelectedNestForObs(isSelected ? null : nest.breed_id)}
                        className={`text-xs px-3 py-1.5 rounded-lg border-2 font-semibold transition ${
                          isSelected
                            ? 'bg-forest-600 text-white border-forest-600'
                            : hasObs
                            ? 'bg-forest-50 text-forest-700 border-forest-300'
                            : 'bg-white text-bark-700 border-bark-300 hover:border-forest-400'
                        }`}>
                        Nest #{nestSeq[nest.breed_id] || '?'}
                        {hasObs && !isSelected && ' ✓'}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Show form for selected nest (or the only nest) */}
              <div className="space-y-4">
                {activeNests
                  .filter(nest => activeNests.length === 1 || selectedNestForObs === nest.breed_id)
                  .map(nest => {
                  const obs = nestObs[nest.breed_id] || {}
                  const status = nestStatusBadge(nest)
                  const suggested = getSuggestedStage(nest)

                  return (
                    <div key={nest.breed_id} className="bg-cream-100 rounded-card p-3 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-semibold text-forest-700">
                          Nest #{nestSeq[nest.breed_id] || '?'}
                        </span>
                        <span className={`text-2xs px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
                      </div>

                      {/* Context-aware suggestion banner */}
                      {suggested && (
                        <div className={`text-2xs font-semibold px-2 py-1 rounded ${suggested.color}`}>
                          {suggested.hint}
                        </div>
                      )}

                      {/* Stage selector */}
                      <div>
                        <label className="label text-2xs">What did you observe?</label>
                        <div className="flex flex-wrap gap-1">
                          {[...NEST_STAGES, 'no_change'].map(stage => {
                            const isSuggested = suggested?.stage === stage
                            return (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, stage } })}
                                className={`text-2xs px-2 py-1 rounded ${
                                  obs.stage === stage
                                    ? 'bg-forest-600 text-white'
                                    : isSuggested
                                    ? 'bg-rust-100 border-2 border-rust-400 text-rust-700 font-semibold'
                                    : 'bg-white border border-cream-300 text-bark-700 hover:bg-cream-50'
                                }`}
                              >
                                {stage === 'no_change' ? 'No change' : stage.charAt(0).toUpperCase() + stage.slice(1)}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Stage-specific fields */}
                      {obs.stage && obs.stage !== 'no_change' && (
                        <div className="space-y-3">
                          {(obs.stage === 'laying' || obs.stage === 'incubating') && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs">Egg count</label>
                                  <input type="number" min="0" value={obs.egg_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, egg_count: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Eggs quality</label>
                                  <select value={obs.eggs_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, eggs_quality: e.target.value } })}
                                    className="input w-full">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs">Cowbird eggs</label>
                                  <input type="number" min="0" value={obs.cowbird_eggs || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_eggs: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs" title="Was the whole clutch observed? Y = bird seen incubating, clutch complete.">Whole clutch?</label>
                                  <select value={obs.whole_clutch || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, whole_clutch: e.target.value } })}
                                    className="input w-full">
                                    <option value="">—</option>
                                    <option value="Y">Y — Complete clutch</option>
                                    <option value="N">N — Not sure</option>
                                  </select>
                                </div>
                              </div>
                              {obs.stage === 'laying' && (
                                <div>
                                  <label className="label text-2xs" title="Were eggs laid? Y = at least one egg. N = nest abandoned before laying. U = unknown.">Eggs laid?</label>
                                  <select value={obs.eggs_laid || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, eggs_laid: e.target.value } })}
                                    className="input w-full">
                                    <option value="">—</option>
                                    <option value="Y">Y — Yes, eggs laid</option>
                                    <option value="N">N — No eggs</option>
                                    <option value="U">U — Unknown</option>
                                  </select>
                                </div>
                              )}
                            </>
                          )}

                          {obs.stage === 'hatching' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs">Chicks hatched</label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Hatch quality</label>
                                  <select value={obs.hatch_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, hatch_quality: e.target.value } })}
                                    className="input w-full">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs">Unhatched eggs</label>
                                  <input type="text" value={obs.unhatch || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, unhatch: e.target.value } })}
                                    placeholder="e.g. 1 unfertilized"
                                    className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Broken eggs</label>
                                  <input type="text" value={obs.broke_egg || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, broke_egg: e.target.value } })}
                                    placeholder="0"
                                    className="input w-full" />
                                </div>
                              </div>
                              <div>
                                <label className="label text-2xs">Cowbird chicks hatched</label>
                                <input type="number" min="0" value={obs.cowbird_chicks || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_chicks: e.target.value } })}
                                  placeholder="0" className="input w-full" />
                              </div>
                            </>
                          )}

                          {obs.stage === 'nestling' && (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="label text-2xs">Chick count</label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs" title="Day 1 = hatch day. Day 6 = pins breaking (banding age)">
                                    Chick age (days)
                                  </label>
                                  <input type="number" min="0" value={obs.chick_age_estimate || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_age_estimate: e.target.value } })}
                                    placeholder="e.g. 6" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Band quality</label>
                                  <select value={obs.band_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, band_quality: e.target.value } })}
                                    className="input w-full">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs">Cowbird chicks</label>
                                  <input type="number" min="0" value={obs.cowbird_chicks || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_chicks: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs" title="Number of cowbird chicks banded">Cowbird band</label>
                                  <input type="text" value={obs.cow_band || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cow_band: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                              </div>

                              {/* Banding fields */}
                              <div className="bg-sage-100 rounded-card p-3 border border-sage-200">
                                <p className="text-2xs font-bold text-sage-700 mb-2">Band Chicks</p>
                                {[1,2,3,4,5].map(i => {
                                  // Show all 5 slots so crew can band multiple chicks at once
                                  return (
                                    <div key={i} className="grid grid-cols-2 gap-1.5 mb-1">
                                      <input type="text" value={obs[`kid${i}`] || ''}
                                        onChange={e => {
                                          const v = e.target.value.replace(/\D/g, '').slice(0, 9)
                                          setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, [`kid${i}`]: v } })
                                        }}
                                        placeholder={`Chick ${i} band # (9 digits)`}
                                        inputMode="numeric" maxLength={9}
                                        className="input w-full text-2xs font-mono" />
                                      <input type="text" value={obs[`kid${i}_combo`] || ''}
                                        onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, [`kid${i}_combo`]: e.target.value } })}
                                        placeholder="color combo"
                                        className="input w-full text-2xs font-mono" />
                                    </div>
                                  )
                                })}
                                <p className="text-2xs text-sage-700 mt-1">Band # = 9-digit metal band. Color combo = e.g. "Y/G RW/M"</p>
                              </div>
                            </>
                          )}

                          {obs.stage === 'fledged' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs" title="Number of SOSP fledglings seen alive near nest area (day 12-14)">
                                    Fledge count
                                  </label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Fledge quality</label>
                                  <select value={obs.fledge_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, fledge_quality: e.target.value } })}
                                    className="input w-full">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="label text-2xs">Cowbird fledge count</label>
                                <input type="number" min="0" value={obs.cow_fledge || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cow_fledge: e.target.value } })}
                                  placeholder="0" className="input w-full" />
                              </div>
                            </>
                          )}

                          {obs.stage === 'independent' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="label text-2xs" title="Number of juveniles confirmed independent (day 22-24+)">
                                    Independent count
                                  </label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="input w-full" />
                                </div>
                                <div>
                                  <label className="label text-2xs">Indep quality</label>
                                  <select value={obs.indep_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, indep_quality: e.target.value } })}
                                    className="input w-full">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              {/* Kid independence toggles — show banded chicks so crew can mark which ones seen */}
                              {(nest.kid1 || nest.kid2 || nest.kid3 || nest.kid4 || nest.kid5) && (
                                <div className="bg-sage-100 rounded-card p-3 border border-sage-200">
                                  <p className="text-2xs font-bold text-sage-700 mb-2">Which banded chicks confirmed independent?</p>
                                  <div className="space-y-1.5">
                                    {[1,2,3,4,5].map(i => {
                                      if (!nest[`kid${i}`]) return null
                                      const kidBand = String(nest[`kid${i}`])
                                      const combo = kidBirds[nest[`kid${i}`]]?.color_combo
                                      const isIndep = obs[`kid${i}_indep`] || false
                                      return (
                                        <label key={i} className={`flex items-center gap-2 rounded-card px-2.5 py-2 cursor-pointer transition ${
                                          isIndep ? 'bg-sage-200 border border-sage-400' : 'bg-cream-100 border border-cream-300'
                                        }`}>
                                          <input type="checkbox" checked={isIndep}
                                            onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, [`kid${i}_indep`]: e.target.checked } })}
                                            className="w-4 h-4 rounded" />
                                          <span className="text-2xs text-bark-600 font-medium">#{i}</span>
                                          <span className="text-sm font-mono font-semibold text-bark-600">{combo || '—'}</span>
                                          <span className="text-2xs text-bark-600">({kidBand})</span>
                                          {isIndep && <span className="ml-auto text-sage-600 text-2xs font-bold">✓</span>}
                                        </label>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {obs.stage === 'failed' && (
                            <div className="space-y-3">
                              <div>
                                <label className="label text-2xs">Fail code</label>
                                <select value={obs.fail_code || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, fail_code: e.target.value } })}
                                  className="input w-full">
                                  <option value="">Select...</option>
                                  {failcodes.filter(f => f.code !== '24').map(f => (
                                    <option key={f.code} value={f.code}>{f.code} — {f.description}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label text-2xs">Failed at stage</label>
                                <select value={obs.stage_fail || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, stage_fail: e.target.value } })}
                                  className="input w-full">
                                  <option value="">Select...</option>
                                  {['building', 'laying', 'incubating', 'hatching', 'nestling'].map(s => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="label text-2xs">What happened?</label>
                                <input type="text" value={obs.nest_comment || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, nest_comment: e.target.value } })}
                                  placeholder="Empty nest, broken eggs, predator signs..."
                                  className="input w-full" />
                              </div>
                            </div>
                          )}

                          {/* Note: nest-specific observations go in the territory notes field above */}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {visitForm.nest_status_flag === 'new_nest_found' && (
            <p className="text-2xs text-forest-600 font-semibold">
              After saving, you'll be taken to create a nest card.
            </p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full btn-primary btn-md disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Visit'}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          NESTS — combined section: status, schedule, and inline card
          ═══════════════════════════════════════════════════════════════ */}
      {nests.length > 0 && (
        <div>
          <h3 className="section-title mb-3">Nests</h3>
          <div className="space-y-3">
            {nests.map(nest => {
              const status = nestStatusBadge(nest)
              const isExpanded = expandedNest === nest.breed_id
              const nestVisits = nestVisitsMap[nest.breed_id] || []
              const isFailed = nest.fail_code && nest.fail_code !== '24'
              const isSuccess = nest.fail_code === '24'

              // ── Derive full nest lifecycle from shared protocol module ──
              const lifecycle = deriveNestLifecycle(nest, todayJD, currentYear, nestVisits)
              const { hatchJD, hatchSource, dfeJD, layingEndJD, incubationStartJD, chickAge, currentStage } = lifecycle
              const windows = getProtocolWindows(nest)

              // Pre-hatch stage for display: which stage is active right now?
              const preHatchStages = [
                { key: 'building', label: 'Building', active: currentStage === 'building',
                  date: null, color: 'bg-bark-100 text-bark-700' },
                { key: 'laying', label: 'Laying', active: currentStage === 'laying',
                  date: dfeJD ? fmtDate(dfeJD) : null, color: 'bg-rust-100 text-rust-700' },
                { key: 'incubating', label: 'Incubating', active: currentStage === 'incubating',
                  date: hatchJD ? `est. hatch ${fmtDate(hatchJD)}` : null, color: 'bg-cream-300 text-bark-700' },
              ]

              return (
                <div key={nest.breed_id} className="card overflow-hidden">
                  {/* Nest summary row — always visible */}
                  <button
                    type="button"
                    onClick={() => setExpandedNest(isExpanded ? null : nest.breed_id)}
                    className="w-full text-left p-3 hover:bg-cream-50 active:bg-cream-100 transition"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">Nest #{nestSeq[nest.breed_id] || '?'}</span>
                        {chickAge != null && chickAge > 0 && !isFailed && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            chickAge >= 9 && chickAge <= 11 ? 'bg-red-100 text-red-700' :
                            chickAge >= 4 && chickAge <= 7 ? 'bg-sage-100 text-sage-700' :
                            chickAge >= 12 && chickAge <= 14 ? 'bg-forest-100 text-forest-700' :
                            chickAge >= 22 && chickAge <= 26 ? 'bg-bark-200 text-bark-700' :
                            'bg-cream-200 text-bark-600'
                          }`}>Day {chickAge}</span>
                        )}
                        {/* Pre-hatch stage badge (when no chick age yet) */}
                        {(chickAge == null || chickAge < 1) && !isFailed && !isSuccess && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            preHatchStages.find(s => s.active)?.color || 'bg-cream-200 text-bark-500'
                          }`}>
                            {preHatchStages.find(s => s.active)?.label || currentStage}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {nest.field_complete && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded badge-success font-bold">Done</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
                        <span className="text-bark-500 text-sm">{isExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>

                    {/* Full lifecycle pipeline — always visible */}
                    {/* Pre-hatch stages (Building → Laying → Incubating) shown when no hatch yet */}
                    {/* Post-hatch counts (Eggs → Hatch → Band → Fledge → Indep) always shown */}
                    <div className="mt-2 flex items-center gap-0.5 text-center flex-wrap">
                      {/* Pre-hatch stage indicators (compact, only when pre-hatch) */}
                      {(chickAge == null || chickAge < 1) && !isFailed && !isSuccess && preHatchStages.map((s, i) => {
                        const isPast = (s.key === 'building' && (currentStage !== 'building'))
                          || (s.key === 'laying' && ['incubating', 'nestling', 'banded', 'fledged', 'independent'].includes(currentStage))
                        const isCurrent = s.active
                        return (
                          <div key={s.key} className="flex items-center">
                            {i > 0 && <span className="text-bark-300 mx-0.5">&rarr;</span>}
                            <div className={`rounded-lg px-1.5 py-0.5 text-[9px] ${
                              isCurrent ? s.color + ' font-bold' :
                              isPast ? 'bg-bark-200 text-bark-600' :
                              'bg-cream-200 text-bark-500'
                            }`}>
                              {s.label}
                              {isCurrent && s.date && <div className="text-[8px] font-normal opacity-70">{s.date}</div>}
                            </div>
                          </div>
                        )
                      })}
                      {/* Arrow between pre-hatch and post-hatch sections */}
                      {(chickAge == null || chickAge < 1) && !isFailed && !isSuccess && (
                        <span className="text-bark-300 mx-0.5">&rarr;</span>
                      )}
                      {/* Post-hatch count stages */}
                      {[
                        { k: 'eggs', l: 'Eggs' }, { k: 'hatch', l: 'Hatch' },
                        { k: 'band', l: 'Band' }, { k: 'fledge', l: 'Fledge' },
                        { k: 'indep', l: 'Indep' },
                      ].map((s, i) => {
                        const val = nest[s.k]
                        return (
                          <div key={s.k} className="flex items-center">
                            {i > 0 && <span className="text-bark-300 mx-0.5">&rarr;</span>}
                            <div className={`stage-box ${
                              val != null && val !== '' ? 'stage-box-filled' : 'stage-box-empty'
                            }`}>
                              <div className="text-[9px] leading-tight">{s.l}</div>
                              <div className="text-sm leading-tight">{val != null && val !== '' ? val : '—'}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Protocol schedule — date-informed badges */}
                    {hatchJD && !isFailed && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {windows.map(w => {
                          const isActive = chickAge >= w.startDay && chickAge <= w.endDay
                          const isPast = chickAge > w.endDay
                          const isOverdue = isPast && !w.completed && !w.isDanger
                          const dateRange = formatWindowDates(w, hatchJD, currentYear)
                          return (
                            <span key={w.key} className={`text-[10px] px-1.5 py-0.5 rounded ${
                              w.completed ? 'bg-bark-200 text-bark-600 line-through' :
                              w.isDanger && isActive ? 'bg-red-200 text-red-800 font-bold' :
                              isActive ? 'bg-amber-100 text-amber-800 font-semibold' :
                              isOverdue ? 'bg-rust-100 text-rust-700 font-semibold' :
                              'bg-cream-200 text-bark-500'
                            }`}>
                              {w.isDanger ? `⚠️ ${dateRange}` : `${w.label} ${dateRange}`}
                              {w.completed && w.field && nest[w.field] != null ? ` ✓${nest[w.field]}` : ''}
                              {isOverdue ? ' ⏰' : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Pre-hatch: show estimated hatch date if available */}
                    {!hatchJD && !isFailed && !isSuccess && nest.eggs != null && (
                      <p className="text-[10px] text-bark-500 mt-1">
                        Need hatch date for protocol schedule
                      </p>
                    )}
                    {hatchJD && !isFailed && (chickAge == null || chickAge < 1) && (
                      <p className="text-[10px] text-amber-700 mt-1 font-medium">
                        Est. hatch {fmtDate(hatchJD)}{hatchSource && hatchSource !== 'observed' ? ` (${hatchSource})` : ''}
                      </p>
                    )}
                  </button>

                  {/* Expanded nest card content */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Full lifecycle timeline with dates */}
                      <div className="px-3 pt-3 pb-2">
                        {/* Date milestones */}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-bark-600 mb-1.5">
                          {dfeJD && <span>DFE: {fmtDate(dfeJD)}{lifecycle.dfeSource !== 'observed' ? ' (est.)' : ''}</span>}
                          {hatchJD && <span>Hatch: {fmtDate(hatchJD)}{hatchSource !== 'observed' ? ' (est.)' : ''}</span>}
                          {chickAge != null && chickAge > 0 && <span>Day {chickAge}</span>}
                          {currentStage && !isFailed && !isSuccess && <span className="font-medium text-forest-800">Stage: {currentStage}</span>}
                        </div>

                        {/* Visual day strip — now includes pre-hatch if we have DFE */}
                        {(hatchJD || dfeJD) && !isFailed && (() => {
                          // Calculate strip range: from DFE (or hatch) to Day 28+
                          const stripStartJD = dfeJD && dfeJD < (hatchJD || Infinity) ? dfeJD : hatchJD
                          const stripEndJD = hatchJD
                            ? hatchJD + Math.min(Math.max(28, (chickAge || 0) + 3), 30) - 1
                            : stripStartJD + 30
                          const stripLen = stripEndJD - stripStartJD + 1

                          return (
                            <>
                              <div className="flex gap-px mb-1 overflow-x-auto">
                                {Array.from({ length: stripLen }, (_, i) => {
                                  const cellJD = stripStartJD + i
                                  const isToday = cellJD === todayJD
                                  const chickDay = hatchJD ? cellJD - hatchJD + 1 : null
                                  let cellBg = 'bg-cream-100'

                                  // Pre-hatch coloring
                                  if (hatchJD && cellJD < hatchJD) {
                                    if (layingEndJD && cellJD <= layingEndJD) {
                                      cellBg = 'bg-rust-100' // Laying
                                    } else {
                                      cellBg = 'bg-cream-300' // Incubating
                                    }
                                  }
                                  // Post-hatch protocol windows
                                  else if (chickDay && chickDay >= 1) {
                                    for (const w of windows) {
                                      if (chickDay >= w.startDay && chickDay <= w.endDay) {
                                        if (w.completed) { cellBg = 'bg-bark-200' }
                                        else if (w.isDanger) { cellBg = cellJD === todayJD ? 'bg-red-400' : 'bg-red-200' }
                                        else if (w.idealDay && chickDay === w.idealDay) { cellBg = w.bgIdeal || w.bgActive }
                                        else if (cellJD === todayJD) { cellBg = w.bgActive }
                                        else { cellBg = w.bg }
                                        break
                                      }
                                    }
                                  }

                                  const title = chickDay && chickDay >= 1
                                    ? `Day ${chickDay} — ${fmtDate(cellJD)}`
                                    : `${fmtDate(cellJD)}${layingEndJD && cellJD <= layingEndJD ? ' (laying)' : hatchJD && cellJD < hatchJD ? ' (incubating)' : ''}`

                                  return (
                                    <div key={i}
                                      className={`w-[10px] h-[18px] rounded-sm ${cellBg} ${isToday ? 'ring-2 ring-gray-800 ring-offset-1' : ''} flex-shrink-0`}
                                      title={title} />
                                  )
                                })}
                              </div>
                              <div className="flex justify-between text-[9px] text-bark-500 px-0.5">
                                <span>{fmtDate(stripStartJD)}</span>
                                <span>{fmtDate(stripEndJD)}</span>
                              </div>
                            </>
                          )
                        })()}
                      </div>

                      {/* Pipeline counts (expanded view — slightly larger) */}
                      <div className="px-3 py-2 flex items-center gap-1 text-center">
                        {[
                          { k: 'eggs', l: 'Eggs' }, { k: 'hatch', l: 'Hatch' },
                          { k: 'band', l: 'Band' }, { k: 'fledge', l: 'Fledge' },
                          { k: 'indep', l: 'Indep' },
                        ].map((s, i) => {
                          const val = nest[s.k]
                          return (
                            <div key={s.k} className="flex items-center">
                              {i > 0 && <span className="text-bark-300 mx-0.5">&rarr;</span>}
                              <div className={`stage-box py-1 ${
                                val != null && val !== '' ? 'stage-box-filled' : 'stage-box-empty'
                              }`}>
                                <div className="text-[10px]">{s.l}</div>
                                <div className="text-sm">{val != null && val !== '' ? val : '—'}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Fail/success display */}
                      {nest.fail_code && (
                        <div className={`mx-3 mb-2 text-xs px-2 py-1 rounded ${
                          isSuccess ? 'bg-forest-50 text-forest-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {isSuccess ? 'Success' : `Failed: code ${nest.fail_code}`}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="px-3 py-2 border-t flex justify-between items-center">
                        {!isFailed && !isSuccess && (
                          <p className="text-[10px] text-bark-500">Log observations via territory visit form above</p>
                        )}
                        <Link href={`/nests/${nest.nestrec || nest.breed_id}`}
                          className="text-[11px] text-forest-600 font-medium">
                          Full nest card &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          VISIT LOG — one row per visit, nest observations folded in
          ═══════════════════════════════════════════════════════════════ */}
      <div>
        <h3 className="section-title mb-3">
          Visit Log ({groupedVisits.length})
        </h3>
        {groupedVisits.length === 0 ? (
          <p className="text-sm text-bark-600 card p-4">No visits logged yet.</p>
        ) : (
          <div className="card overflow-hidden divide-y divide-cream-200">
            {groupedVisits.map((v, idx) => {
              const isTerritory = v.type === 'territory'
              const isEditing = isTerritory && editingVisit === v.visit_id

              if (isEditing) {
                return (
                  <div key={`edit-${v.visit_id}`} className="p-3">
                    <div className="bg-rust-100 rounded-card border-2 border-rust-300 p-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label text-2xs">Date</label>
                          <input type="date" value={editForm.visit_date || ''}
                            onChange={e => setEditForm({ ...editForm, visit_date: e.target.value })}
                            className="input w-full" />
                        </div>
                        <div>
                          <label className="label text-2xs">Time</label>
                          <input type="time" value={editForm.visit_time || ''}
                            onChange={e => setEditForm({ ...editForm, visit_time: e.target.value })}
                            className="input w-full" />
                        </div>
                      </div>
                      <div>
                        <label className="label text-2xs">Observer</label>
                        <select value={editForm.observer || ''}
                          onChange={e => setEditForm({ ...editForm, observer: e.target.value })}
                          className="input w-full">
                          <option value="">Select observer...</option>
                          {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        <label className="flex items-center gap-1.5 text-2xs">
                          <input type="checkbox" checked={editForm.male_seen || false}
                            onChange={e => setEditForm({ ...editForm, male_seen: e.target.checked })}
                            className="w-4 h-4 rounded" />
                          ♂ seen
                        </label>
                        <label className="flex items-center gap-1.5 text-2xs">
                          <input type="checkbox" checked={editForm.female_seen || false}
                            onChange={e => setEditForm({ ...editForm, female_seen: e.target.checked })}
                            className="w-4 h-4 rounded" />
                          ♀ seen
                        </label>
                      </div>
                      <div>
                        <label className="label text-2xs">Notes</label>
                        <textarea value={editForm.notes || ''}
                          onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          className="input w-full" rows={2} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleSaveVisitEdit(v.visit_id)}
                          className="flex-1 btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setEditingVisit(null); setEditForm({}) }}
                          className="px-4 btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  </div>
                )
              }

              if (isTerritory) {
                // Territory visit with nest observations folded in
                const seenParts = [
                  v.male_seen ? '♂ ✓' : null,
                  v.female_seen ? '♀ ✓' : null,
                ].filter(Boolean).join(', ')
                return (
                  <div key={`t-${v.visit_id}`} className="px-3 py-3">
                    {/* Header line: date, time, observer, seen, edit */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 text-2xs">
                        <span className="text-forest-700 font-semibold whitespace-nowrap">{fmtVisitDate(v.visit_date)}</span>
                        <span className="text-bark-600 whitespace-nowrap">{fmtVisitTime(v.visit_time)}</span>
                        {seenParts && <span className="text-bark-600">{seenParts}</span>}
                        {v.minutes_spent != null && <span className="text-bark-600">{v.minutes_spent} min</span>}
                      </div>
                      <button type="button"
                        onClick={() => {
                          setEditingVisit(v.visit_id)
                          setEditForm({
                            visit_date: v.visit_date || '', visit_time: v.visit_time || '',
                            observer: v.observer || '', male_seen: v.male_seen || false,
                            female_seen: v.female_seen || false, minutes_spent: v.minutes_spent || '',
                            other_birds_notes: v.other_birds_notes || '', notes: v.notes || '',
                          })
                        }}
                        className="text-2xs text-forest-600 hover:text-forest-700 font-semibold shrink-0">edit</button>
                    </div>
                    {/* Notes */}
                    {v.notes && <p className="text-2xs text-bark-600 mt-1 leading-snug">{v.notes}</p>}
                    {v.other_birds_notes && <p className="text-2xs text-bark-600 mt-1">Other birds: {v.other_birds_notes}</p>}
                    {/* Nest observations from this visit */}
                    {v.nestObs.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {v.nestObs.map(nv => {
                          const nestContent = [
                            nv.nest_stage ? nv.nest_stage.charAt(0).toUpperCase() + nv.nest_stage.slice(1) : null,
                            nv.egg_count != null ? `${nv.egg_count} eggs` : null,
                            nv.chick_count != null ? `${nv.chick_count} chicks` : null,
                            nv.chick_age_estimate != null ? `D${nv.chick_age_estimate}` : null,
                            nv.cowbird_eggs > 0 ? `${nv.cowbird_eggs} CB eggs` : null,
                            nv.cowbird_chicks > 0 ? `${nv.cowbird_chicks} CB chicks` : null,
                          ].filter(Boolean).join(', ')
                          return (
                            <div key={nv.nest_visit_id} className="flex items-baseline gap-1.5 text-2xs">
                              <span className="badge badge-info text-2xs shrink-0">{nv.nestLabel}</span>
                              <span className="text-forest-700">{nestContent || '—'}</span>
                              {nv.comments && <span className="text-bark-600">— {nv.comments}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              // Orphaned nest visit (no matching territory visit)
              const nestContent = [
                v.nest_stage ? v.nest_stage.charAt(0).toUpperCase() + v.nest_stage.slice(1) : null,
                v.egg_count != null ? `${v.egg_count} eggs` : null,
                v.chick_count != null ? `${v.chick_count} chicks` : null,
                v.chick_age_estimate != null ? `D${v.chick_age_estimate}` : null,
                v.cowbird_eggs > 0 ? `${v.cowbird_eggs} CB eggs` : null,
                v.cowbird_chicks > 0 ? `${v.cowbird_chicks} CB chicks` : null,
              ].filter(Boolean).join(', ')
              return (
                <div key={`n-${v.nest_visit_id}`} className="px-3 py-3 bg-cream-50">
                  <div className="flex items-baseline gap-2 text-2xs">
                    <span className="text-forest-700 font-semibold whitespace-nowrap">{fmtVisitDate(v.visit_date)}</span>
                    <span className="text-bark-600 whitespace-nowrap">{fmtVisitTime(v.visit_time)}</span>
                    <span className="badge badge-info text-2xs">{v.nestLabel}</span>
                  </div>
                  <p className="text-2xs text-forest-700 mt-1">{nestContent || '—'}</p>
                  {v.comments && <p className="text-2xs text-bark-600 mt-1">{v.comments}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
