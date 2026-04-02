'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel, localDateString, localTimeString, toJulianDay, fromJulianDay } from '@/lib/helpers'

// 2026 field crew — update this list each season
const OBSERVER_LIST = ['Katherine', 'Emma', 'Anna', 'Jon', 'Jen']

// Stage progression options for nest visit observations
const NEST_STAGES = ['building', 'laying', 'incubating', 'hatching', 'nestling', 'fledged', 'independent', 'failed']

// Safe parseInt that returns null instead of NaN (prevents corrupt DB writes)
const safeInt = (v) => { const n = parseInt(v); return isNaN(n) ? null : n }

// Visit log date/time formatters
const fmtVisitDate = (d) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}` }
const fmtVisitTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

function nestStatusBadge(nest) {
  if (nest.fail_code === '24') return { label: 'Success', color: 'bg-green-100 text-green-700' }
  if (nest.fail_code && nest.fail_code !== '24') return { label: 'Failed', color: 'bg-red-100 text-red-700' }
  if (nest.indep != null) return { label: 'Independent', color: 'bg-green-100 text-green-700' }
  if (nest.fledge != null) return { label: 'Fledged', color: 'bg-blue-100 text-blue-700' }
  if (nest.band != null) return { label: 'Banded', color: 'bg-blue-100 text-blue-700' }
  if (nest.hatch != null) return { label: 'Hatched', color: 'bg-yellow-100 text-yellow-700' }
  if (nest.eggs != null) return { label: 'Eggs', color: 'bg-yellow-100 text-yellow-700' }
  return { label: nest.stage_find || 'Active', color: 'bg-gray-100 text-gray-700' }
}

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

  // Merged visit log: territory + nest visits, sorted oldest-first
  const mergedVisits = useMemo(() => {
    const allNestVisits = Object.values(nestVisitsMap).flat()
    return [
      ...visits.map(v => ({ ...v, type: 'territory' })),
      ...allNestVisits.map(v => ({ ...v, type: 'nest', nestLabel: `Nest #${nestSeq[v.breed_id] || '?'}` })),
    ].sort((a, b) => {
      const dateA = a.visit_date || ''
      const dateB = b.visit_date || ''
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      const timeA = a.visit_time || ''
      const timeB = b.visit_time || ''
      return timeA.localeCompare(timeB)
    })
  }, [visits, nestVisitsMap, nestSeq])

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
  function getSuggestedStage(nest) {
    const now = new Date()
    const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
    let hatchJD = nest.date_hatch ? parseInt(nest.date_hatch) : null
    if (!hatchJD && nest.dfe && nest.eggs) {
      hatchJD = parseInt(nest.dfe) + 13 + (parseInt(nest.eggs) - 1)
    }
    if (!hatchJD || isNaN(hatchJD)) return null

    const chickAge = todayJD - hatchJD + 1
    if (chickAge >= 4 && chickAge <= 7 && (!nest.band || nest.band === '')) return { stage: 'nestling', hint: `Band window! Day ${chickAge}`, color: 'bg-emerald-200 text-emerald-800' }
    if (chickAge >= 9 && chickAge <= 11) return { stage: null, hint: `DANGER Day ${chickAge} — DO NOT APPROACH`, color: 'bg-red-200 text-red-800' }
    if (chickAge >= 12 && chickAge <= 14 && (!nest.fledge || nest.fledge === '')) return { stage: 'fledged', hint: `Fledge check! Day ${chickAge}`, color: 'bg-blue-200 text-blue-800' }
    if (chickAge >= 22 && chickAge <= 26 && (!nest.indep || nest.indep === '')) return { stage: 'independent', hint: `Independence check! Day ${chickAge}`, color: 'bg-purple-200 text-purple-800' }
    if (chickAge >= 1 && chickAge <= 3) return { stage: 'nestling', hint: `Nestling Day ${chickAge}`, color: 'bg-yellow-100 text-yellow-800' }
    return null
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

      const { error } = await supabase.from('territory_visits').insert({
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
      })

      if (error) throw error

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

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

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

  // Protocol schedule helpers
  const now = new Date()
  const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const fmtDate = (jd) => {
    if (jd < 1) return '?'
    const { month, day } = fromJulianDay(currentYear, jd)
    return `${monthNames[month]} ${day}`
  }

  const activeNests = nests.filter(n => !n.fail_code)
  const hasActiveNests = activeNests.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/territories" className="text-blue-600 text-sm">&larr; Territories</Link>
      </div>

      {/* Territory card header */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">Territory {territoryCode}</h2>
          {daysSince !== null && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              daysSince <= 4 ? 'bg-green-100 text-green-700' :
              daysSince <= 7 ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {daysSince === 0 ? 'Visited today' : `${daysSince}d ago`}
            </span>
          )}
        </div>

        {/* Resident birds */}
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-blue-600 mb-1">♂ Males</div>
            {allAssignments.filter(a => a.sex === 2).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>— No male assigned</span>
                <Link href="/birds" className="text-xs text-blue-600 underline">Assign</Link>
              </div>
            ) : (
              <div className="space-y-1">
                {allAssignments.filter(a => a.sex === 2).map(a => (
                  <div key={a.assignment_id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${
                    !a.end_date ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${a.end_date ? 'text-gray-400' : ''}`}>
                        {birdLabel(a)}
                      </span>
                      {a.confirmed && <span className="text-xs text-green-500">✓</span>}
                      {!a.end_date && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">current</span>}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {a.start_date}{a.end_date ? ` → ${a.end_date}` : ' → present'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-pink-600 mb-1">♀ Females</div>
            {allAssignments.filter(a => a.sex === 1).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>— No female assigned</span>
                <Link href="/birds" className="text-xs text-blue-600 underline">Assign</Link>
              </div>
            ) : (
              <div className="space-y-1">
                {allAssignments.filter(a => a.sex === 1).map(a => (
                  <div key={a.assignment_id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${
                    !a.end_date ? 'bg-pink-50 border border-pink-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-semibold ${a.end_date ? 'text-gray-400' : ''}`}>
                        {birdLabel(a)}
                      </span>
                      {a.confirmed && <span className="text-xs text-green-500">✓</span>}
                      {!a.end_date && <span className="text-[10px] bg-pink-600 text-white px-1.5 py-0.5 rounded">current</span>}
                    </div>
                    <span className="text-[11px] text-gray-400">
                      {a.start_date}{a.end_date ? ` → ${a.end_date}` : ' → present'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 mt-2">
          {visits.length} visits · {nests.length} nest{nests.length !== 1 ? 's' : ''} this season
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowVisitForm(!showVisitForm)}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-center text-sm font-semibold"
        >
          Log Visit
        </button>
        <Link
          href={`/nests/new?territory=${encodeURIComponent(territoryCode)}`}
          className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-center text-sm font-semibold"
        >
          New Nest
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          VISIT FORM
          ═══════════════════════════════════════════════════════════════ */}
      {showVisitForm && (
        <form onSubmit={handleSubmitVisit} className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-700">Log Territory Visit</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={visitForm.visit_date}
                onChange={e => setVisitForm({ ...visitForm, visit_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time</label>
              <input type="time" value={visitForm.visit_time}
                onChange={e => setVisitForm({ ...visitForm, visit_time: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Observer *</label>
            <select value={visitForm.observer}
              onChange={e => setVisitForm({ ...visitForm, observer: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white" required>
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
              {male?.color_combo && <span className="font-mono text-xs text-gray-400">{male.color_combo}</span>}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visitForm.female_seen}
                onChange={e => setVisitForm({ ...visitForm, female_seen: e.target.checked })}
                className="w-5 h-5 rounded" />
              <span>♀ Female seen</span>
              {female?.color_combo && <span className="font-mono text-xs text-gray-400">{female.color_combo}</span>}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Minutes spent</label>
              <input type="number" min="0" value={visitForm.minutes_spent}
                onChange={e => setVisitForm({ ...visitForm, minutes_spent: e.target.value })}
                placeholder="e.g., 15" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nest activity</label>
              {hasActiveNests ? (
                <>
                  <select value={visitForm.nest_status_flag}
                    onChange={e => setVisitForm({ ...visitForm, nest_status_flag: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="no_change">Use nest cards below</option>
                    <option value="new_nest_found">New nest!</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-0.5">Record nest observations in the cards below</p>
                </>
              ) : (
                <select value={visitForm.nest_status_flag}
                  onChange={e => setVisitForm({ ...visitForm, nest_status_flag: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="no_change">None</option>
                  <option value="existing_nest_checked">Checked nest</option>
                  <option value="new_nest_found">New nest!</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Visit notes *</label>
            <textarea value={visitForm.notes}
              onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })}
              placeholder="Territory + nest observations, behavior, song, location..."
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} required />
            {visitForm.notes.trim().length > 0 && visitForm.notes.trim().length < 3 && (
              <p className="text-xs text-red-500 mt-1">Please add at least a brief observation.</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Other sparrows seen <span className="text-gray-400 font-normal">(optional — band combos of floaters, neighbours, etc.)</span></label>
            <input type="text" value={visitForm.other_birds_notes}
              onChange={e => setVisitForm({ ...visitForm, other_birds_notes: e.target.value })}
              placeholder="e.g. RW-SG on south edge"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* ── Nest observations within visit form ── */}
          {hasActiveNests && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Nest Observations</h4>
              <p className="text-[10px] text-gray-400 mb-2">Stage and counts saved to each nest&apos;s card.</p>

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
                            ? 'bg-blue-600 text-white border-blue-600'
                            : hasObs
                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
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
                    <div key={nest.breed_id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-700">
                          Nest #{nestSeq[nest.breed_id] || '?'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
                      </div>

                      {/* Context-aware suggestion banner */}
                      {suggested && (
                        <div className={`text-[11px] font-semibold px-2 py-1 rounded ${suggested.color}`}>
                          {suggested.hint}
                        </div>
                      )}

                      {/* Stage selector */}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">What did you observe?</label>
                        <div className="flex flex-wrap gap-1">
                          {[...NEST_STAGES, 'no_change'].map(stage => {
                            const isSuggested = suggested?.stage === stage
                            return (
                              <button
                                key={stage}
                                type="button"
                                onClick={() => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, stage } })}
                                className={`text-xs px-2 py-1 rounded ${
                                  obs.stage === stage
                                    ? 'bg-blue-600 text-white'
                                    : isSuggested
                                    ? 'bg-yellow-100 border-2 border-yellow-400 text-yellow-800 font-semibold'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
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
                        <div className="space-y-2">
                          {(obs.stage === 'laying' || obs.stage === 'incubating') && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Egg count</label>
                                  <input type="number" min="0" value={obs.egg_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, egg_count: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Eggs quality</label>
                                  <select value={obs.eggs_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, eggs_quality: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
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
                                  <label className="block text-xs text-gray-600 mb-1">Cowbird eggs</label>
                                  <input type="number" min="0" value={obs.cowbird_eggs || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_eggs: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Was the whole clutch observed? Y = bird seen incubating, clutch complete.">Whole clutch?</label>
                                  <select value={obs.whole_clutch || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, whole_clutch: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                                    <option value="">—</option>
                                    <option value="Y">Y — Complete clutch</option>
                                    <option value="N">N — Not sure</option>
                                  </select>
                                </div>
                              </div>
                              {obs.stage === 'laying' && (
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Were eggs laid? Y = at least one egg. N = nest abandoned before laying. U = unknown.">Eggs laid?</label>
                                  <select value={obs.eggs_laid || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, eggs_laid: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
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
                                  <label className="block text-xs text-gray-600 mb-1">Chicks hatched</label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Hatch quality</label>
                                  <select value={obs.hatch_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, hatch_quality: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
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
                                  <label className="block text-xs text-gray-600 mb-1">Unhatched eggs</label>
                                  <input type="text" value={obs.unhatch || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, unhatch: e.target.value } })}
                                    placeholder="e.g. 1 unfertilized"
                                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Broken eggs</label>
                                  <input type="text" value={obs.broke_egg || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, broke_egg: e.target.value } })}
                                    placeholder="0"
                                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Cowbird chicks hatched</label>
                                <input type="number" min="0" value={obs.cowbird_chicks || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_chicks: e.target.value } })}
                                  placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                              </div>
                            </>
                          )}

                          {obs.stage === 'nestling' && (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Chick count</label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Day 1 = hatch day. Day 6 = pins breaking (banding age)">
                                    Chick age (days)
                                  </label>
                                  <input type="number" min="0" value={obs.chick_age_estimate || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_age_estimate: e.target.value } })}
                                    placeholder="e.g. 6" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Band quality</label>
                                  <select value={obs.band_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, band_quality: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
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
                                  <label className="block text-xs text-gray-600 mb-1">Cowbird chicks</label>
                                  <input type="number" min="0" value={obs.cowbird_chicks || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_chicks: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Number of cowbird chicks banded">Cowbird band</label>
                                  <input type="text" value={obs.cow_band || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cow_band: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                              </div>

                              {/* Banding fields */}
                              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                                <p className="text-xs font-bold text-emerald-700 mb-1.5">Band Chicks</p>
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
                                        className="border rounded-lg px-3 py-2 text-xs font-mono bg-white" />
                                      <input type="text" value={obs[`kid${i}_combo`] || ''}
                                        onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, [`kid${i}_combo`]: e.target.value } })}
                                        placeholder="color combo"
                                        className="border rounded-lg px-3 py-2 text-xs font-mono bg-white" />
                                    </div>
                                  )
                                })}
                                <p className="text-[10px] text-emerald-600 mt-1">Band # = 9-digit metal band. Color combo = e.g. &quot;Y/G RW/M&quot;</p>
                              </div>
                            </>
                          )}

                          {obs.stage === 'fledged' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Number of SOSP fledglings seen alive near nest area (day 12-14)">
                                    Fledge count
                                  </label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Fledge quality</label>
                                  <select value={obs.fledge_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, fledge_quality: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                                    <option value="">flag</option>
                                    <option value=".">. reliable</option>
                                    <option value="?">? uncertain</option>
                                    <option value="+">+ minimum</option>
                                    <option value="-">- overcount</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Cowbird fledge count</label>
                                <input type="number" min="0" value={obs.cow_fledge || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cow_fledge: e.target.value } })}
                                  placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                              </div>
                            </>
                          )}

                          {obs.stage === 'independent' && (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1" title="Number of juveniles confirmed independent (day 22-24+)">
                                    Independent count
                                  </label>
                                  <input type="number" min="0" value={obs.chick_count || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                    placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-600 mb-1">Indep quality</label>
                                  <select value={obs.indep_quality || ''}
                                    onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, indep_quality: e.target.value } })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
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
                                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                                  <p className="text-xs font-bold text-purple-700 mb-2">Which banded chicks confirmed independent?</p>
                                  <div className="space-y-1.5">
                                    {[1,2,3,4,5].map(i => {
                                      if (!nest[`kid${i}`]) return null
                                      const kidBand = String(nest[`kid${i}`])
                                      const combo = kidBirds[nest[`kid${i}`]]?.color_combo
                                      const isIndep = obs[`kid${i}_indep`] || false
                                      return (
                                        <label key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition ${
                                          isIndep ? 'bg-green-100 border border-green-300' : 'bg-white border border-gray-200'
                                        }`}>
                                          <input type="checkbox" checked={isIndep}
                                            onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, [`kid${i}_indep`]: e.target.checked } })}
                                            className="w-4 h-4 rounded" />
                                          <span className="text-xs text-gray-400 font-medium">#{i}</span>
                                          <span className="text-sm font-mono font-semibold">{combo || '—'}</span>
                                          <span className="text-xs text-gray-400">({kidBand})</span>
                                          {isIndep && <span className="ml-auto text-green-600 text-xs font-bold">✓</span>}
                                        </label>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {obs.stage === 'failed' && (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Fail code</label>
                                <select value={obs.fail_code || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, fail_code: e.target.value } })}
                                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                                  <option value="">Select...</option>
                                  {failcodes.filter(f => f.code !== '24').map(f => (
                                    <option key={f.code} value={f.code}>{f.code} — {f.description}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Failed at stage</label>
                                <select value={obs.stage_fail || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, stage_fail: e.target.value } })}
                                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                                  <option value="">Select...</option>
                                  {['building', 'laying', 'incubating', 'hatching', 'nestling'].map(s => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">What happened?</label>
                                <input type="text" value={obs.nest_comment || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, nest_comment: e.target.value } })}
                                  placeholder="Empty nest, broken eggs, predator signs..."
                                  className="w-full border rounded-lg px-3 py-2 text-sm" />
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
            <p className="text-xs text-blue-600 font-medium">
              After saving, you&apos;ll be taken to create a nest card.
            </p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Visit'}
          </button>
        </form>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          NESTS — combined section: status, schedule, and inline card
          ═══════════════════════════════════════════════════════════════ */}
      {nests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Nests</h3>
          <div className="space-y-3">
            {nests.map(nest => {
              const status = nestStatusBadge(nest)
              const isExpanded = expandedNest === nest.breed_id
              const nestVisits = nestVisitsMap[nest.breed_id] || []
              const isFailed = nest.fail_code && nest.fail_code !== '24'
              const isSuccess = nest.fail_code === '24'

              // Protocol schedule data
              let hatchJD = nest.date_hatch ? parseInt(nest.date_hatch) : null
              let hatchSource = 'observed'
              if (!hatchJD && nest.dfe && nest.eggs) {
                hatchJD = parseInt(nest.dfe) + 13 + (parseInt(nest.eggs) - 1)
                hatchSource = 'estimated'
              }
              if (hatchJD && isNaN(hatchJD)) hatchJD = null

              const chickAge = hatchJD ? todayJD - hatchJD + 1 : null

              const windows = [
                { key: 'band', label: 'Band', startDay: 4, endDay: 7, idealDay: 6,
                  bg: 'bg-emerald-100', bgActive: 'bg-emerald-200', bgIdeal: 'bg-emerald-400',
                  completed: nest.band != null && nest.band !== '' },
                { key: 'danger', label: 'DANGER — do not approach', startDay: 9, endDay: 11,
                  bg: 'bg-red-100', bgActive: 'bg-red-300', isDanger: true, completed: false },
                { key: 'fledge', label: 'Fledge check', startDay: 12, endDay: 14,
                  bg: 'bg-blue-100', bgActive: 'bg-blue-200',
                  completed: nest.fledge != null && nest.fledge !== '' },
                { key: 'indep', label: 'Independence', startDay: 22, endDay: 26, idealDay: 24,
                  bg: 'bg-purple-100', bgActive: 'bg-purple-200',
                  completed: nest.indep != null && nest.indep !== '' },
              ]

              return (
                <div key={nest.breed_id} className="bg-white rounded-lg border overflow-hidden">
                  {/* Nest summary row — always visible */}
                  <button
                    type="button"
                    onClick={() => setExpandedNest(isExpanded ? null : nest.breed_id)}
                    className="w-full text-left p-3 active:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold text-sm">Nest #{nestSeq[nest.breed_id] || '?'}</span>
                        {chickAge && chickAge > 0 && !isFailed && (
                          <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${
                            chickAge >= 9 && chickAge <= 11 ? 'bg-red-100 text-red-700' :
                            chickAge >= 4 && chickAge <= 7 ? 'bg-emerald-100 text-emerald-700' :
                            chickAge >= 12 && chickAge <= 14 ? 'bg-blue-100 text-blue-700' :
                            chickAge >= 22 && chickAge <= 26 ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>Day {chickAge}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {nest.field_complete && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-200 text-green-800 font-bold">Done</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
                        <span className="text-gray-400 text-sm">{isExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>

                    {/* Counts summary */}
                    <div className="text-xs text-gray-500 mt-1 flex gap-3">
                      {nest.eggs != null && <span>Eggs: {nest.eggs}</span>}
                      {nest.hatch != null && <span>Hatch: {nest.hatch}</span>}
                      {nest.band != null && <span>Band: {nest.band}</span>}
                      {nest.fledge != null && <span>Fledge: {nest.fledge}</span>}
                      {nest.indep != null && <span>Indep: {nest.indep}</span>}
                    </div>

                    {/* Protocol checklist — compact, always visible for active nests */}
                    {hatchJD && !isFailed && (
                      <div className="flex gap-1 mt-2">
                        {windows.map(w => {
                          const isActive = chickAge >= w.startDay && chickAge <= w.endDay
                          const isPast = chickAge > w.endDay
                          const isOverdue = isPast && !w.completed && !w.isDanger
                          return (
                            <span key={w.key} className={`text-[10px] px-1.5 py-0.5 rounded ${
                              w.completed ? 'bg-gray-200 text-gray-500 line-through' :
                              w.isDanger && isActive ? 'bg-red-200 text-red-800 font-bold' :
                              isActive ? 'bg-yellow-100 text-yellow-800 font-semibold' :
                              isOverdue ? 'bg-orange-100 text-orange-700 font-semibold' :
                              'bg-gray-100 text-gray-400'
                            }`}>
                              {w.key === 'danger' ? '⚠️ D9-11' : `${w.label} D${w.startDay}-${w.endDay}`}
                              {w.completed && w.key === 'band' && nest.band != null ? ` ✓${nest.band}` : ''}
                              {w.completed && w.key === 'fledge' && nest.fledge != null ? ` ✓${nest.fledge}` : ''}
                              {w.completed && w.key === 'indep' && nest.indep != null ? ` ✓${nest.indep}` : ''}
                              {isOverdue ? ' ⏰' : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* No hatch data message */}
                    {!hatchJD && !isFailed && !isSuccess && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {nest.eggs != null ? 'Need hatch date to show schedule' : 'No eggs recorded yet'}
                      </p>
                    )}
                  </button>

                  {/* Expanded nest card content */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Protocol schedule detail */}
                      {hatchJD && !isFailed && (
                        <div className="px-3 pt-3 pb-2">
                          <div className="text-[11px] text-gray-400 mb-1.5">
                            Hatch: {fmtDate(hatchJD)}{hatchSource === 'estimated' ? ' (est.)' : ''}
                            {chickAge > 0 && ` · Day ${chickAge}`}
                          </div>
                          {/* Visual day strip */}
                          <div className="flex gap-px mb-1 overflow-x-auto">
                            {Array.from({ length: Math.min(Math.max(28, (chickAge || 0) + 3), 30) }, (_, i) => {
                              const day = i + 1
                              const isToday = day === chickAge
                              let cellBg = 'bg-gray-50'
                              for (const w of windows) {
                                if (day >= w.startDay && day <= w.endDay) {
                                  if (w.completed) { cellBg = 'bg-gray-200' }
                                  else if (w.isDanger) { cellBg = day === chickAge ? 'bg-red-400' : 'bg-red-200' }
                                  else if (w.idealDay && day === w.idealDay) { cellBg = w.bgIdeal || w.bgActive }
                                  else if (day === chickAge) { cellBg = w.bgActive }
                                  else { cellBg = w.bg }
                                  break
                                }
                              }
                              return (
                                <div key={day}
                                  className={`w-[10px] h-[18px] rounded-sm ${cellBg} ${isToday ? 'ring-2 ring-gray-800 ring-offset-1' : ''} flex-shrink-0`}
                                  title={`Day ${day} — ${fmtDate(hatchJD + day - 1)}`} />
                              )
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-400 px-0.5">
                            <span>{fmtDate(hatchJD)}</span>
                            <span>{fmtDate(hatchJD + Math.min(Math.max(28, (chickAge || 0) + 3), 30) - 1)}</span>
                          </div>
                        </div>
                      )}

                      {/* Pipeline counts */}
                      <div className="px-3 py-2 flex items-center gap-1 text-center">
                        {[
                          { k: 'eggs', l: 'Eggs' }, { k: 'hatch', l: 'Hatch' },
                          { k: 'band', l: 'Band' }, { k: 'fledge', l: 'Fledge' },
                          { k: 'indep', l: 'Indep' },
                        ].map((s, i) => {
                          const val = nest[s.k]
                          return (
                            <div key={s.k} className="flex items-center">
                              {i > 0 && <span className="text-gray-300 mx-0.5">&rarr;</span>}
                              <div className={`rounded-lg px-2 py-1 text-xs ${
                                val != null && val !== '' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-gray-100 text-gray-400'
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
                          isSuccess ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {isSuccess ? 'Success' : `Failed: code ${nest.fail_code}`}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="px-3 py-2 border-t flex justify-between items-center">
                        {!isFailed && !isSuccess && (
                          <p className="text-[10px] text-gray-400">Log observations via territory visit form above</p>
                        )}
                        <Link href={`/nests/${nest.nestrec || nest.breed_id}`}
                          className="text-[11px] text-blue-600 font-medium">
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
          COMBINED VISIT LOG — territory + nest visits, oldest first
          ═══════════════════════════════════════════════════════════════ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Visit Log ({mergedVisits.length})
        </h3>
        {mergedVisits.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-lg border p-4">No visits logged yet.</p>
        ) : (
          <table className="w-full text-left bg-white rounded-lg border overflow-hidden">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase border-b bg-gray-50">
                <th className="py-1.5 px-2 font-medium">Date</th>
                <th className="py-1.5 pr-1 font-medium">Time</th>
                <th className="py-1.5 pr-1 font-medium">Content</th>
                <th className="py-1.5 pr-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {mergedVisits.map((v, idx) => {
                const isTerritory = v.type === 'territory'
                const isEditing = isTerritory && editingVisit === v.visit_id

                if (isEditing) {
                  return (
                    <tr key={`t-${v.visit_id}`}><td colSpan={4} className="p-2">
                      <div className="bg-yellow-50 rounded-lg border-2 border-yellow-300 p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">Date</label>
                            <input type="date" value={editForm.visit_date || ''}
                              onChange={e => setEditForm({ ...editForm, visit_date: e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 mb-0.5">Time</label>
                            <input type="time" value={editForm.visit_time || ''}
                              onChange={e => setEditForm({ ...editForm, visit_time: e.target.value })}
                              className="w-full border rounded px-2 py-1.5 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Observer</label>
                          <select value={editForm.observer || ''}
                            onChange={e => setEditForm({ ...editForm, observer: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                            <option value="">Select observer...</option>
                            {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-4 flex-wrap">
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={editForm.male_seen || false}
                              onChange={e => setEditForm({ ...editForm, male_seen: e.target.checked })}
                              className="w-4 h-4 rounded" />
                            ♂ seen
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" checked={editForm.female_seen || false}
                              onChange={e => setEditForm({ ...editForm, female_seen: e.target.checked })}
                              className="w-4 h-4 rounded" />
                            ♀ seen
                          </label>
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Notes</label>
                          <textarea value={editForm.notes || ''}
                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleSaveVisitEdit(v.visit_id)}
                            className="flex-1 bg-blue-600 text-white rounded py-1.5 text-xs font-semibold">Save</button>
                          <button type="button" onClick={() => { setEditingVisit(null); setEditForm({}) }}
                            className="px-4 border rounded py-1.5 text-xs text-gray-600">Cancel</button>
                        </div>
                      </div>
                    </td></tr>
                  )
                }

                if (isTerritory) {
                  const content = [
                    v.male_seen ? '♂ ✓' : null,
                    v.female_seen ? '♀ ✓' : null,
                    v.minutes_spent ? `${v.minutes_spent} min` : null,
                    v.other_birds_notes || null,
                  ].filter(Boolean).join(', ') || '—'
                  return (
                    <tr key={`t-${v.visit_id}`} className="border-t border-gray-100 align-top">
                      <td className="py-1.5 px-2 text-[11px] text-gray-600 whitespace-nowrap">{fmtVisitDate(v.visit_date)}</td>
                      <td className="py-1.5 pr-1 text-[11px] text-gray-400 whitespace-nowrap">{fmtVisitTime(v.visit_time)}</td>
                      <td className="py-1.5 pr-1 text-[11px] text-gray-600">
                        <span className="bg-gray-100 text-gray-500 px-1 py-0.5 rounded text-[9px] font-medium mr-1">TERR</span>
                        {content}
                      </td>
                      <td className="py-1.5 pr-2 text-[11px]">
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-gray-600">{v.notes}</span>
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
                            className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0">edit</button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                // Nest visit row
                const content = [
                  v.egg_count != null ? `${v.egg_count} eggs` : null,
                  v.chick_count != null ? `${v.chick_count} chicks` : null,
                  v.chick_age_estimate != null ? `D${v.chick_age_estimate}` : null,
                  v.cowbird_eggs > 0 ? `${v.cowbird_eggs} CB eggs` : null,
                  v.cowbird_chicks > 0 ? `${v.cowbird_chicks} CB chicks` : null,
                ].filter(Boolean).join(', ') || '—'
                return (
                  <tr key={`n-${v.nest_visit_id}`} className="border-t border-gray-100 align-top bg-blue-50/30">
                    <td className="py-1.5 px-2 text-[11px] text-gray-600 whitespace-nowrap">{fmtVisitDate(v.visit_date)}</td>
                    <td className="py-1.5 pr-1 text-[11px] text-gray-400 whitespace-nowrap">{fmtVisitTime(v.visit_time)}</td>
                    <td className="py-1.5 pr-1 text-[11px] text-gray-600">
                      <span className="bg-blue-100 text-blue-600 px-1 py-0.5 rounded text-[9px] font-medium mr-1">{v.nestLabel}</span>
                      {content}
                    </td>
                    <td className="py-1.5 pr-2 text-[11px]">
                      {v.nest_stage && <span className="text-blue-700 font-medium">{v.nest_stage.charAt(0).toUpperCase() + v.nest_stage.slice(1)}</span>}
                      {v.comments && <span className="text-gray-500 ml-1">{v.comments}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
