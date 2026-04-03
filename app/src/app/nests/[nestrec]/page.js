'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel, calculateDFE, estimateHatchDate, toJulianDay, fromJulianDay, localDateString, localTimeString } from '@/lib/helpers'
import { NEST_STAGES, VISIT_RULES, formatJD } from '@/lib/protocol'

// 2026 field crew — update this list each season
const OBSERVER_LIST = ['Katherine', 'Emma', 'Anna', 'Jon', 'Jen']

export default function NestDetailPage({ params }) {
  const { nestrec: nestParam } = params
  const nestId = parseInt(nestParam)
  const currentYear = new Date().getFullYear()

  const [nest, setNest] = useState(null)
  const [visits, setVisits] = useState([])
  const [failcodes, setFailcodes] = useState([])
  const [male, setMale] = useState(null)
  const [female, setFemale] = useState(null)
  const [kidBirds, setKidBirds] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Card state — mirrors the breed record
  const [card, setCard] = useState({})
  const [nestSequence, setNestSequence] = useState(null)
  const [editingVisit, setEditingVisit] = useState(null) // nest_visit_id being edited
  const [editVisitForm, setEditVisitForm] = useState({})
  const [territoryNotes, setTerritoryNotes] = useState({}) // territory_visit_id -> notes

  // ── Data loading ─────────────────────────────────────────────────────
  useEffect(() => { loadNest(); loadLookups() }, [nestId])

  async function loadLookups() {
    const { data } = await supabase.from('lookup_failcode').select('*')
    setFailcodes(data || [])
  }

  async function loadNest() {
    try {
      let n = null
      const { data: byId } = await supabase.from('breed').select('*').eq('breed_id', nestId).single()
      if (byId) { n = byId }
      else {
        const { data: byNr } = await supabase.from('breed').select('*').eq('nestrec', nestId).single()
        n = byNr
      }
      if (!n) { setNest(null); setLoading(false); return }

      // Visits
      let allVisits = []
      if (n.breed_id) {
        const { data } = await supabase.from('nest_visits').select('*')
          .eq('breed_id', n.breed_id).order('visit_date', { ascending: true })
        allVisits = data || []
      }
      if (n.nestrec) {
        const { data } = await supabase.from('nest_visits').select('*')
          .eq('nestrec', n.nestrec).order('visit_date', { ascending: true })
        const ids = new Set(allVisits.map(v => v.nest_visit_id))
        for (const v of (data || [])) { if (!ids.has(v.nest_visit_id)) allVisits.push(v) }
        allVisits.sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date))
      }

      // Load territory visit notes via FK join
      // nest_visits.territory_visit_id → territory_visits.visit_id
      const tvIds = allVisits.map(v => v.territory_visit_id).filter(Boolean)
      if (tvIds.length > 0) {
        const { data: tvData } = await supabase.from('territory_visits')
          .select('visit_id, notes')
          .in('visit_id', tvIds)
        if (tvData) {
          const noteMap = {}
          for (const tv of tvData) { noteMap[tv.visit_id] = tv.notes }
          setTerritoryNotes(noteMap)
        }
      }

      // Parents
      if (n.male_id) {
        const { data } = await supabase.from('birds')
          .select('band_id, sex, color_combo, is_unbanded, unbanded_description')
          .eq('band_id', n.male_id).single()
        setMale(data || { band_id: n.male_id })
      }
      if (n.female_id) {
        const { data } = await supabase.from('birds')
          .select('band_id, sex, color_combo, is_unbanded, unbanded_description')
          .eq('band_id', n.female_id).single()
        setFemale(data || { band_id: n.female_id })
      }
      // Suggest missing parents from territory assignments
      // Check each parent independently — a nest might have one parent set
      // (e.g., male banded) but the other missing (e.g., female unbanded and
      // not linked when nest was created before the unbanded-parent fix)
      if ((!n.male_id || !n.female_id) && n.territory) {
        const res = await getTerritoryResidents(supabase, n.territory, n.year || currentYear)
        if (!n.male_id && res.male) setMale({ ...res.male, suggested: true })
        if (!n.female_id && res.female) setFemale({ ...res.female, suggested: true })
      }

      // Kid birds
      const kidIds = [n.kid1, n.kid2, n.kid3, n.kid4, n.kid5].filter(Boolean)
      const km = {}
      if (kidIds.length > 0) {
        const { data: kids } = await supabase.from('birds')
          .select('band_id, color_combo, sex').in('band_id', kidIds)
        if (kids) kids.forEach(k => { km[k.band_id] = k })
      }
      setKidBirds(km)

      // Independence sightings — load per-kid independence status from normalized table
      let indepMap = {}
      if (n.breed_id) {
        const { data: sightings } = await supabase.from('independence_sightings')
          .select('band_id').eq('breed_id', n.breed_id)
        if (sightings) sightings.forEach(s => { indepMap[s.band_id] = true })
      }

      // Card state from breed record
      setCard({
        eggs: n.eggs ?? '', hatch: n.hatch ?? '', band: n.band ?? '',
        fledge: n.fledge ?? '', indep: n.indep ?? '',
        date_hatch: n.date_hatch ?? '', dfe: n.dfe ?? '', corr_dfe: n.corr_dfe ?? '',
        cow_egg: n.cow_egg ?? '', cow_hatch: n.cow_hatch ?? '',
        cow_band: n.cow_band ?? '', cow_fledge: n.cow_fledge ?? '',
        kid1: n.kid1 ?? '', kid2: n.kid2 ?? '', kid3: n.kid3 ?? '',
        kid4: n.kid4 ?? '', kid5: n.kid5 ?? '',
        kid1_combo: km[n.kid1]?.color_combo ?? '',
        kid2_combo: km[n.kid2]?.color_combo ?? '',
        kid3_combo: km[n.kid3]?.color_combo ?? '',
        kid4_combo: km[n.kid4]?.color_combo ?? '',
        kid5_combo: km[n.kid5]?.color_combo ?? '',
        kid1_indep: !!(n.kid1 && indepMap[n.kid1]),
        kid2_indep: !!(n.kid2 && indepMap[n.kid2]),
        kid3_indep: !!(n.kid3 && indepMap[n.kid3]),
        kid4_indep: !!(n.kid4 && indepMap[n.kid4]),
        kid5_indep: !!(n.kid5 && indepMap[n.kid5]),
        stage_find: n.stage_find ?? '', whole_clutch: n.whole_clutch ?? '',
        eggs_laid: n.eggs_laid ?? '', unhatch: n.unhatch ?? '',
        broke_egg: n.broke_egg ?? '', nest_height: n.nest_height ?? '',
        vegetation: n.vegetation ?? '', nest_description: n.nest_description ?? '',
        fail_code: n.fail_code ?? '', stage_fail: n.stage_fail ?? '',
        fail_notes: n.fail_notes ?? '',
        eggs_quality: n.eggs_quality ?? '', hatch_quality: n.hatch_quality ?? '',
        band_quality: n.band_quality ?? '', fledge_quality: n.fledge_quality ?? '',
        indep_quality: n.indep_quality ?? '', dfe_quality: n.dfe_quality ?? '',
        brood: n.brood ?? '', male_attempt: n.male_attempt ?? '',
        female_attempt: n.female_attempt ?? '', experiment: n.experiment ?? '',
        file_note: n.file_note ?? '', other_notes: n.other_notes ?? '',
        field_complete: n.field_complete ?? false,
      })

      setNest(n)
      setVisits(allVisits)

      // Calculate nest sequence for this territory+year
      if (n.territory) {
        try {
          const { data: nestList } = await supabase.from('breed')
            .select('breed_id, nestrec')
            .eq('territory', n.territory)
            .eq('year', n.year || currentYear)
            .not('breed_id', 'is', null)
            .order('breed_id', { ascending: true })
          if (nestList) {
            const seq = nestList.findIndex(nt => nt.breed_id === n.breed_id) + 1
            setNestSequence(seq > 0 ? seq : null)
          }
        } catch (err) {
          console.error('Error calculating nest sequence:', err)
        }
      }
    } catch (err) {
      console.error('Error loading nest:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Auto-derive hatch date from chick age visits ─────────────────────
  useEffect(() => {
    if (!nest?.year || visits.length === 0) return
    const chickVisits = visits
      .filter(v => v.chick_age_estimate >= 1 && v.visit_date)
      .map(v => ({ ...v, ...estimateHatchDate(v.visit_date, v.chick_age_estimate, nest.year) }))
      .filter(v => v.hatchJulianDay !== null)
    if (chickVisits.length === 0) return
    const order = { high: 0, medium: 1, low: 2 }
    chickVisits.sort((a, b) => order[a.reliability] - order[b.reliability])
    if (!card.date_hatch && String(card.date_hatch) !== '0') {
      setCard(c => ({ ...c, date_hatch: chickVisits[0].hatchJulianDay }))
    }
  }, [visits, nest?.year])

  // ── Auto-calculate DFE ───────────────────────────────────────────────
  useEffect(() => {
    const dh = parseInt(card.date_hatch)
    const eg = parseInt(card.eggs)
    if (!dh || !eg || !nest?.year) return
    const result = calculateDFE({ year: nest.year, hatchJulianDay: dh, clutchSize: eg })
    if (result.dfe !== null && String(result.dfe) !== String(card.dfe)) {
      setCard(c => ({ ...c, dfe: result.dfe }))
    }
  }, [card.date_hatch, card.eggs, nest?.year])

  // ── Auto-populate empty card fields from visit observations ──────────
  // Only fills fields that are NULL in the breed record — never overwrites
  useEffect(() => {
    if (!nest || visits.length === 0) return
    const updates = {}
    // Eggs: max egg_count observed across visits
    if (nest.eggs == null) {
      const eggCounts = visits.filter(v => v.egg_count != null && v.egg_count > 0).map(v => v.egg_count)
      if (eggCounts.length > 0) updates.eggs = Math.max(...eggCounts)
    }
    // Hatch: first chick_count from hatching/nestling visits only (not fledge/indep visits)
    if (nest.hatch == null) {
      const chickVisits = visits
        .filter(v => v.chick_count != null && v.chick_count > 0
          && (!v.nest_stage || v.nest_stage === 'nestling' || v.nest_stage === 'hatching'))
        .sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date))
      if (chickVisits.length > 0) updates.hatch = chickVisits[0].chick_count
    }
    // Fledge: max chick_count from fledge-stage visits
    if (nest.fledge == null) {
      const fledgeVisits = visits.filter(v => v.chick_count != null && v.chick_count > 0
        && v.nest_stage === 'fledged')
      if (fledgeVisits.length > 0) updates.fledge = Math.max(...fledgeVisits.map(v => v.chick_count))
    }
    // Indep: max chick_count from independence-stage visits
    if (nest.indep == null) {
      const indepVisits = visits.filter(v => v.chick_count != null && v.chick_count > 0
        && v.nest_stage === 'independent')
      if (indepVisits.length > 0) updates.indep = Math.max(...indepVisits.map(v => v.chick_count))
    }
    // Cowbird eggs: max observed
    if (nest.cow_egg == null) {
      const cbEggs = visits.filter(v => v.cowbird_eggs != null && v.cowbird_eggs > 0).map(v => v.cowbird_eggs)
      if (cbEggs.length > 0) updates.cow_egg = Math.max(...cbEggs)
    }
    // Cowbird chicks: max observed
    if (nest.cow_hatch == null) {
      const cbChicks = visits.filter(v => v.cowbird_chicks != null && v.cowbird_chicks > 0).map(v => v.cowbird_chicks)
      if (cbChicks.length > 0) updates.cow_hatch = Math.max(...cbChicks)
    }
    if (Object.keys(updates).length > 0) {
      setCard(c => ({ ...c, ...updates }))
    }
  }, [visits, nest])

  // ── Save handler ─────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()

    // Validate band numbers: only validate NEW bands (not already saved in the DB)
    // This prevents existing test/legacy data from blocking saves
    const kidBands = [1,2,3,4,5].map(i => card[`kid${i}`]).filter(Boolean).map(String)
    const existingKids = [nest.kid1, nest.kid2, nest.kid3, nest.kid4, nest.kid5].filter(Boolean).map(String)
    const newBands = kidBands.filter(b => !existingKids.includes(b))
    // 9-digit check: only for newly entered bands
    for (const b of newBands) {
      if (b.length !== 9 || !/^\d{9}$/.test(b)) {
        alert(`Band number "${b}" must be exactly 9 digits.`); return
      }
    }
    // Duplicate check: only among new bands (existing dupes are legacy data)
    const newBandSet = new Set(newBands)
    if (newBandSet.size !== newBands.length) {
      alert('Duplicate new band numbers. Each chick must have a unique band number.'); return
    }
    // DB uniqueness check: only for new bands
    if (newBands.length > 0) {
      const { data: conflicts } = await supabase.from('birds')
        .select('band_id').in('band_id', newBands.map(Number))
      if (conflicts && conflicts.length > 0) {
        const dupes = conflicts.map(c => c.band_id).join(', ')
        alert(`Band number(s) already in use: ${dupes}. Each band must be unique.`); return
      }
    }

    setSaving(true)
    try {
      const intFields = new Set(['eggs','hatch','band','fledge','indep','dfe','date_hatch',
        'corr_dfe','cow_egg','cow_hatch','kid1','kid2','kid3','kid4','kid5','brood'])
      // cow_band and cow_fledge are TEXT in the schema (preserve uncertainty markers)
      // Fields that should never be sent as NULL (control fields, not data)
      const skipIfEmpty = new Set(['field_complete'])
      const updates = {}
      for (const [k, v] of Object.entries(card)) {
        if (k.endsWith('_combo') || k.endsWith('_indep')) continue
        if (skipIfEmpty.has(k)) continue
        if (v === '' || v === null || v === undefined) {
          // Allow clearing: send NULL for fields that were previously set in the DB
          // This lets students correct mistakes (e.g., wrong egg count entered)
          if (nest[k] != null && nest[k] !== '') {
            updates[k] = null
          }
          continue
        }
        if (intFields.has(k)) {
          const parsed = parseInt(v)
          updates[k] = isNaN(parsed) ? null : parsed  // 0 is a valid value (e.g., eggs=0)
        } else {
          updates[k] = v
        }
      }

      // Quality flags are set explicitly by the student — no auto-defaults.
      // They must choose . (reliable), ? (uncertain), + (minimum), or - (overcount)
      // for each count before marking the card complete.

      // Ensure kid birds exist + save combos
      for (let i = 1; i <= 5; i++) {
        const bandId = updates[`kid${i}`]
        if (!bandId) continue
        // Chicks hatched on Mandarte are NOT immigrants (is_immigrant = 0)
        // natal_year = nest year. ignoreDuplicates: if bird already exists, skip insert.
        await supabase.from('birds').upsert(
          { band_id: bandId, sex: 0, is_immigrant: 0, natal_year: nest.year },
          { onConflict: 'band_id', ignoreDuplicates: true }
        )
        const combo = card[`kid${i}_combo`]?.trim()
        if (combo) {
          await supabase.from('birds').update({ color_combo: combo }).eq('band_id', bandId)
        }
      }

      // Save independence sightings to normalized table
      for (let i = 1; i <= 5; i++) {
        const bandId = card[`kid${i}`] ? parseInt(card[`kid${i}`]) : null
        if (!bandId) continue
        if (card[`kid${i}_indep`]) {
          // Upsert: mark this chick as independent
          const today = localDateString()
          const [ty, tm, td] = today.split('-').map(Number)
          await supabase.from('independence_sightings').upsert({
            band_id: bandId,
            breed_id: nest.breed_id,
            sighting_date: today,
            sighting_jd: toJulianDay(ty, tm, td),
          }, { onConflict: 'band_id,breed_id', ignoreDuplicates: true })
        } else {
          // Remove sighting if toggle was turned off
          await supabase.from('independence_sightings')
            .delete().eq('band_id', bandId).eq('breed_id', nest.breed_id)
        }
      }

      // Auto-calc indep from markers if any are set
      const markedIndep = [1,2,3,4,5].filter(i => card[`kid${i}_indep`]).length
      if (markedIndep > 0) updates.indep = markedIndep

      // Link suggested parents to nest (from territory assignments) if not already set
      if (!nest.male_id && male?.band_id && male?.suggested) {
        updates.male_id = male.band_id
      }
      if (!nest.female_id && female?.band_id && female?.suggested) {
        updates.female_id = female.band_id
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('breed').update(updates).eq('breed_id', nest.breed_id)
        if (error) throw new Error('Card save failed: ' + error.message)
      }

      setEditing(false)
      loadNest()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Save nest visit edit ─────────────────────────────────────────────
  async function handleSaveNestVisitEdit(visitId) {
    try {
      const f = editVisitForm
      const updates = {
        visit_date: f.visit_date,
        visit_time: f.visit_time || null,
        observer: f.observer?.trim() || null,
        nest_stage: f.nest_stage || null,
        egg_count: f.egg_count !== '' && f.egg_count != null ? parseInt(f.egg_count) : null,
        chick_count: f.chick_count !== '' && f.chick_count != null ? parseInt(f.chick_count) : null,
        chick_age_estimate: f.chick_age_estimate !== '' && f.chick_age_estimate != null ? parseInt(f.chick_age_estimate) : null,
        cowbird_eggs: f.cowbird_eggs !== '' && f.cowbird_eggs != null ? parseInt(f.cowbird_eggs) : null,
        cowbird_chicks: f.cowbird_chicks !== '' && f.cowbird_chicks != null ? parseInt(f.cowbird_chicks) : null,
        comments: f.comments?.trim() || null,
      }
      const { error } = await supabase.from('nest_visits').update(updates).eq('nest_visit_id', visitId)
      if (error) throw error
      setEditingVisit(null)
      setEditVisitForm({})
      loadNest()
    } catch (err) {
      alert('Error updating nest visit: ' + err.message)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function julianLabel(jd) {
    if (!jd || !nest?.year) return ''
    const { month, day } = fromJulianDay(nest.year, parseInt(jd))
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${m[month - 1]} ${day}`
  }

  function getWarnings() {
    if (!nest) return []
    const w = []
    const today = new Date()
    const jToday = toJulianDay(today.getFullYear(), today.getMonth() + 1, today.getDate())
    const isFailed = nest.fail_code && nest.fail_code !== '24'

    // If nest failed, show that and skip protocol warnings
    if (isFailed) {
      w.push({ t: 'info', m: `Nest failed (code ${nest.fail_code}). No further protocol actions needed.` })
    }

    let hd = parseInt(nest.date_hatch)
    if (!hd && nest.dfe && nest.eggs) hd = nest.dfe + VISIT_RULES.INCUBATION_DAYS + (nest.eggs - 1)

    if (hd && !isFailed) {
      const age = jToday - hd + 1  // Day 1 = hatch day, per protocol
      // Active warnings — current protocol windows
      if (age >= 9 && age <= 11) w.push({ t: 'danger', m: `DO NOT APPROACH — chicks are Day ${age}, will jump prematurely!` })
      if (age === 7) w.push({ t: 'warn', m: 'Day 7 — handle with extreme care, chicks may jump.' })
      if (age >= 4 && age <= 6) w.push({ t: 'info', m: `Banding window! Chicks ~Day ${age}. Target Day 6.` })
      if (age === 3) w.push({ t: 'warn', m: 'Emergency banding only — 1 metal + 1 color per leg.' })
      if (age >= 12 && age <= 14) w.push({ t: 'info', m: `Fledge check due — chicks ~Day ${age}.` })
      if (age >= 22 && age <= 26) w.push({ t: 'info', m: `Independence check due — chicks ~Day ${age}.` })
      // Overdue warnings — missed protocol steps
      // Use == null so 0 ("observed zero") is correctly treated as "step completed"
      if (age >= 8 && nest.band == null && nest.hatch > 0) w.push({ t: 'warn', m: `Banding may be overdue — chicks are Day ${age}. Record # banded.` })
      if (age >= 15 && nest.fledge == null && nest.hatch > 0) w.push({ t: 'warn', m: `Fledge check overdue — chicks are Day ${age}. Record # fledged.` })
      if (age >= 27 && nest.indep == null && nest.fledge > 0) w.push({ t: 'warn', m: `Independence check overdue — chicks are Day ${age}. Record # independent.` })
    } else if (!hd && !isFailed && nest.eggs_laid === 'Y' && nest.hatch > 0) {
      // Nest has hatched chicks but no hatch date — protocol warnings can't fire
      w.push({ t: 'warn', m: 'No hatch date estimated yet — enter a chick age visit to enable protocol scheduling.' })
    } else if (!hd && !isFailed && (nest.eggs_laid === 'Y' || (nest.eggs && nest.eggs > 0) || nest.stage_find === 'IC' || nest.stage_find === 'EL')) {
      // Active pre-hatch nest — eggs laid or incubating, no hatch yet
      w.push({ t: 'info', m: 'Pre-hatch: keep visiting every 2–3 days to catch hatch and determine chick age for scheduling.' })
    }
    // Parent warnings — distinguish between "no parent assigned" and "parent is unbanded"
    if (!nest.male_id) {
      w.push({ t: 'action', m: 'No male parent assigned — assign on Birds tab or save nest card to link from territory', link: '/birds' })
    } else if (nest.male_id < 0) {
      w.push({ t: 'info', m: 'Male is unbanded — data will link automatically when banded' })
    }
    if (!nest.female_id) {
      w.push({ t: 'action', m: 'No female parent assigned — assign on Birds tab or save nest card to link from territory', link: '/birds' })
    } else if (nest.female_id < 0) {
      w.push({ t: 'info', m: 'Female is unbanded — data will link automatically when banded' })
    }
    return w
  }

  // ── Milestone dates derived from visit log ───────────────────────────
  const milestoneDates = useMemo(() => {
    if (!visits.length || !nest) return {}
    const sorted = [...visits].sort((a, b) => new Date(a.visit_date) - new Date(b.visit_date))
    const yr = nest.year || new Date().getFullYear()
    const result = {}
    const dateToJD = (dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number)
      return toJulianDay(y, m, d)
    }
    const fmtDate = (dateStr) => {
      const jd = dateToJD(dateStr)
      return { jd, label: formatJD(yr, jd), dateStr }
    }
    // Discovery: first visit
    if (sorted.length > 0) {
      result.stage_find = { ...fmtDate(sorted[0].visit_date), comments: sorted[0].comments }
    }
    // Eggs: first visit with eggs observed
    const eggVisit = sorted.find(v => v.egg_count > 0 || v.nest_stage === 'laying' || v.nest_stage === 'incubating')
    if (eggVisit) result.eggs = { ...fmtDate(eggVisit.visit_date), comments: eggVisit.comments }
    // Hatch: from breed record date_hatch, or first nestling visit
    if (nest.date_hatch) {
      const hd = parseInt(nest.date_hatch)
      const hatchVisit = sorted.find(v => v.chick_count > 0 || v.nest_stage === 'nestling')
      result.hatch = { jd: hd, label: formatJD(yr, hd), comments: hatchVisit?.comments }
    } else {
      const hatchVisit = sorted.find(v => v.chick_count > 0 || v.nest_stage === 'nestling')
      if (hatchVisit) result.hatch = { ...fmtDate(hatchVisit.visit_date), comments: hatchVisit.comments }
    }
    // Band: nestling visit with age 4-7
    const bandVisit = sorted.find(v => v.nest_stage === 'nestling' && v.chick_age_estimate >= 4 && v.chick_age_estimate <= 7)
    if (bandVisit) result.band = { ...fmtDate(bandVisit.visit_date), comments: bandVisit.comments }
    // Fledge: first fledge check visit
    const fledgeVisit = sorted.find(v => v.nest_stage === 'fledged')
    if (fledgeVisit) result.fledge = { ...fmtDate(fledgeVisit.visit_date), comments: fledgeVisit.comments }
    // Independence: first independence visit
    const indepVisit = sorted.find(v => v.nest_stage === 'independent')
    if (indepVisit) result.indep = { ...fmtDate(indepVisit.visit_date), comments: indepVisit.comments }
    // Failed/Abandoned: first visit with failed or abandoned stage
    const failVisit = sorted.find(v => v.nest_stage === 'failed' || v.nest_stage === 'abandoned')
    if (failVisit) result.failed = { ...fmtDate(failVisit.visit_date), comments: failVisit.comments }
    return result
  }, [visits, nest])

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) return <div className="text-center py-8 text-gray-500">Loading nest...</div>
  if (!nest) return <div className="text-center py-8 text-gray-500">Nest not found.</div>

  const warnings = getWarnings()
  const displayDFE = nest.corr_dfe || card.dfe

  return (
    <div className="space-y-4 pb-8">
      {/* Nav */}
      <div className="flex items-center gap-2">
        <Link href="/nests" className="text-blue-600 text-sm">&larr; Nests</Link>
        {nest.territory && (
          <Link href={`/territories/${encodeURIComponent(nest.territory)}`}
            className="text-blue-600 text-sm ml-auto">Terr {nest.territory} &rarr;</Link>
        )}
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className={`rounded-lg p-3 text-sm font-semibold ${
          w.t === 'danger' ? 'bg-red-100 text-red-800 border-2 border-red-400' :
          w.t === 'warn' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
          w.t === 'action' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
          'bg-blue-100 text-blue-800 border border-blue-300'
        }`}>
          {w.m}
          {w.link && <Link href={w.link} className="ml-2 underline">Go to Birds</Link>}
        </div>
      ))}

      <form onSubmit={handleSave}>

        {/* ╔═══════════════════════════════════════════════════════════════╗
           ║  NEST CARD HEADER — always visible                          ║
           ╚═══════════════════════════════════════════════════════════════╝ */}
        <div className="bg-white rounded-t-lg border border-b-0 p-4">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-lg font-bold">
              {nest.territory && nestSequence
                ? `Terr ${nest.territory}, Nest #${nestSequence}`
                : nest.nestrec ? `Nest #${nest.nestrec}` : 'Nest (new)'}
            </h2>
            <div className="flex items-center gap-2">
              {nest.field_complete && (
                <span className="bg-green-100 text-green-700 text-[11px] font-bold px-2 py-0.5 rounded-full">Complete</span>
              )}
              <span className="text-xs text-gray-400">Terr {nest.territory} &middot; {nest.year}</span>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-blue-600 font-medium">M </span>
              <span className="font-mono font-semibold">{birdLabel(male)}</span>
              {male?.suggested && <span className="text-orange-500 text-xs ml-1">(suggested)</span>}
            </div>
            <div>
              <span className="text-pink-600 font-medium">F </span>
              <span className="font-mono font-semibold">{birdLabel(female)}</span>
              {female?.suggested && <span className="text-orange-500 text-xs ml-1">(suggested)</span>}
            </div>
          </div>
          {/* Pipeline summary with dates */}
          <div className="mt-3 flex items-center gap-1 text-center">
            {[
              { k: 'eggs', l: 'Eggs' }, { k: 'hatch', l: 'Hatch' },
              { k: 'band', l: 'Band' }, { k: 'fledge', l: 'Fledge' },
              { k: 'indep', l: 'Indep' },
            ].map((s, i) => {
              const val = card[s.k]
              const md = milestoneDates[s.k]
              return (
                <div key={s.k} className="flex items-center">
                  {i > 0 && <span className="text-gray-300 mx-0.5">&rarr;</span>}
                  <div className={`rounded-lg px-2.5 py-1 text-xs ${
                    val !== '' && val != null ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <div className="text-[10px]">{s.l}</div>
                    <div className="text-sm">{val !== '' ? val : '—'}</div>
                    {md && <div className="text-[8px] font-normal opacity-70">{md.label}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          {nest.corr_dfe && (
            <div className="mt-2 text-[10px] text-gray-400">DFE corrected: {nest.corr_dfe} ({julianLabel(nest.corr_dfe)})</div>
          )}
          {/* Offspring summary */}
          {card.kid1 && (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-medium">Offspring: </span>
              {[1,2,3,4,5].map(i => {
                const id = card[`kid${i}`]
                if (!id) return null
                const combo = card[`kid${i}_combo`] || kidBirds[id]?.color_combo
                return <span key={i} className="font-mono">{i > 1 && card[`kid${i-1}`] ? ', ' : ''}{combo ? `${combo} (${id})` : id}</span>
              })}
            </div>
          )}
          {/* Fail display */}
          {nest.fail_code && (
            <div className={`mt-2 text-xs px-2 py-1 rounded ${
              nest.fail_code === '24' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {nest.fail_code === '24' ? 'Success' : `Failed: ${nest.fail_code}`}
              {failcodes.find(f => f.code === nest.fail_code)?.description &&
                ` — ${failcodes.find(f => f.code === nest.fail_code).description}`}
              {milestoneDates.failed && (
                <span className="ml-1 opacity-80">
                  on JD {milestoneDates.failed.jd} ({milestoneDates.failed.label})
                </span>
              )}
              {milestoneDates.failed?.comments && (
                <div className="mt-0.5 text-[11px] opacity-80">Notes: {milestoneDates.failed.comments}</div>
              )}
            </div>
          )}
        </div>

        {/* ╔═══════════════════════════════════════════════════════════════╗
           ║  EDIT BUTTON / EDIT MODE                                    ║
           ╚═══════════════════════════════════════════════════════════════╝ */}
        {!editing ? (
          <>
            {/* ═══════════════════════════════════════════════════════════
                VIEW MODE — read-only display of all card data
                ═══════════════════════════════════════════════════════════ */}
            <div className="bg-gray-50 border-x border-gray-300 p-4 space-y-4">

              {/* SOSP Counts — main pipeline with timing integrated */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">SOSP Counts</p>
                {/* Timing row: DFE, Hatch day, Found */}
                <div className="grid grid-cols-3 gap-1.5 mb-2 text-center">
                  <div className="rounded-lg p-1.5 bg-gray-50 border border-gray-200">
                    <div className="text-[10px] text-gray-400">DFE</div>
                    <div className="text-sm font-bold font-mono">
                      {displayDFE ? displayDFE : <span className="text-gray-300">—</span>}
                    </div>
                    {displayDFE && <div className="text-[8px] text-gray-400">{julianLabel(displayDFE)}</div>}
                    {card.dfe_quality && (
                      <div className={`text-[9px] font-medium ${card.dfe_quality === '.' ? 'text-green-600' : card.dfe_quality === '?' ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {card.dfe_quality === '.' ? '● reliable' : card.dfe_quality === '?' ? '? uncertain' : card.dfe_quality === '+' ? '+ min' : card.dfe_quality}
                      </div>
                    )}
                    <div className="text-[8px] text-gray-300">Date first egg</div>
                  </div>
                  <div className="rounded-lg p-1.5 bg-gray-50 border border-gray-200">
                    <div className="text-[10px] text-gray-400">Hatch Day</div>
                    <div className="text-sm font-bold font-mono">
                      {card.date_hatch ? card.date_hatch : <span className="text-gray-300">—</span>}
                    </div>
                    {card.date_hatch && <div className="text-[8px] text-gray-400">{julianLabel(card.date_hatch)}</div>}
                    <div className="text-[8px] text-gray-300">Julian day</div>
                  </div>
                  <div className="rounded-lg p-1.5 bg-gray-50 border border-gray-200">
                    <div className="text-[10px] text-gray-400">Found</div>
                    <div className="text-sm font-bold font-mono">
                      {card.stage_find || <span className="text-gray-300">—</span>}
                    </div>
                    {milestoneDates.stage_find && <div className="text-[8px] text-gray-400">{milestoneDates.stage_find.label}</div>}
                    <div className="text-[8px] text-gray-300">Stage at discovery</div>
                  </div>
                </div>
                {/* Count pipeline: Eggs → Hatch → Band → Fledge → Indep */}
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {[
                    { k: 'eggs', q: 'eggs_quality', l: 'Eggs', desc: 'Clutch size' },
                    { k: 'hatch', q: 'hatch_quality', l: 'Hatch', desc: 'Eggs hatched' },
                    { k: 'band', q: 'band_quality', l: 'Band', desc: 'Reached day 6' },
                    { k: 'fledge', q: 'fledge_quality', l: 'Fledge', desc: 'Left nest' },
                    { k: 'indep', q: 'indep_quality', l: 'Indep', desc: 'Day 22+' },
                  ].map((f) => {
                    const md = milestoneDates[f.k]
                    return (
                      <div key={f.k} className={`rounded-lg p-1.5 ${
                        card[f.k] !== '' && card[f.k] != null ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'
                      }`}>
                        <div className="text-[10px] text-gray-500 font-medium">{f.l}</div>
                        <div className="text-lg font-bold font-mono">
                          {card[f.k] !== '' && card[f.k] != null ? card[f.k] : <span className="text-gray-300">—</span>}
                        </div>
                        {card[f.q] && (
                          <div className={`text-[9px] font-medium ${
                            card[f.q] === '.' ? 'text-green-600' :
                            card[f.q] === '?' ? 'text-yellow-600' :
                            card[f.q] === '+' ? 'text-blue-600' :
                            card[f.q] === '-' ? 'text-orange-600' : 'text-gray-400'
                          }`}>{card[f.q] === '.' ? '● reliable' : card[f.q] === '?' ? '? uncertain' : card[f.q] === '+' ? '+ min' : card[f.q] === '-' ? '− over' : card[f.q]}</div>
                        )}
                        {md && <div className="text-[8px] text-gray-400">{md.label}</div>}
                        <div className="text-[8px] text-gray-300">{f.desc}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Discovery details */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Discovery & Nesting</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-gray-400">Eggs laid?</div>
                    <div className="font-medium">{card.eggs_laid || <span className="text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Whole clutch?</div>
                    <div className="font-medium">{card.whole_clutch || <span className="text-gray-300">—</span>}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">Brood #</div>
                    <div className="font-medium">{card.brood || <span className="text-gray-300">—</span>}</div>
                  </div>
                  {(card.male_attempt || card.female_attempt) && (
                    <>
                      <div>
                        <div className="text-[10px] text-gray-400">♂ attempt</div>
                        <div className="font-medium">{card.male_attempt || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">♀ attempt</div>
                        <div className="font-medium">{card.female_attempt || '—'}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Nest Site */}
              {(card.nest_height || card.vegetation || card.nest_description) && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Nest Site</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {card.nest_height && (
                      <div>
                        <div className="text-[10px] text-gray-400">Height</div>
                        <div className="font-medium">{card.nest_height}</div>
                      </div>
                    )}
                    {card.vegetation && (
                      <div>
                        <div className="text-[10px] text-gray-400">Vegetation</div>
                        <div className="font-medium">{card.vegetation}</div>
                      </div>
                    )}
                  </div>
                  {card.nest_description && (
                    <div className="mt-1 text-sm">
                      <div className="text-[10px] text-gray-400">Description</div>
                      <div className="font-medium">{card.nest_description}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Cowbird — compact inline */}
              {(card.cow_egg || card.cow_hatch || card.cow_band || card.cow_fledge) && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Cowbird</p>
                  <div className="text-sm text-gray-600">
                    {[
                      card.cow_egg != null && card.cow_egg !== '' && `Eggs: ${card.cow_egg}`,
                      card.cow_hatch != null && card.cow_hatch !== '' && `Hatch: ${card.cow_hatch}`,
                      card.cow_band != null && card.cow_band !== '' && `Band: ${card.cow_band}`,
                      card.cow_fledge != null && card.cow_fledge !== '' && `Fledge: ${card.cow_fledge}`,
                    ].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              )}

              {/* Banded Chicks */}
              {(card.kid1 || card.kid2 || card.kid3) && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Banded Chicks</p>
                  <div className="space-y-1.5">
                    {[1,2,3,4,5].map(i => {
                      const id = card[`kid${i}`]
                      if (!id) return null
                      const combo = card[`kid${i}_combo`] || kidBirds[id]?.color_combo
                      const isIndep = card[`kid${i}_indep`]
                      return (
                        <div key={i} className={`flex items-center gap-2 text-sm rounded-lg px-2.5 py-1.5 ${
                          isIndep ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                        }`}>
                          <span className="text-gray-400 text-xs font-medium">#{i}</span>
                          <span className="font-mono font-semibold">{combo || '—'}</span>
                          <span className="text-gray-400 text-xs">({String(id)})</span>
                          {isIndep
                            ? <span className="ml-auto text-green-600 text-xs font-bold">✓ Independent</span>
                            : <span className="ml-auto text-gray-300 text-xs">not confirmed</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Egg Fate */}
              {(card.unhatch || card.broke_egg) && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Egg Fate</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {card.unhatch && (
                      <div className="bg-gray-50 rounded-lg border border-gray-200 px-2.5 py-1.5">
                        <div className="text-[10px] text-gray-400">Unhatched eggs</div>
                        <div className="font-medium">{card.unhatch}</div>
                      </div>
                    )}
                    {card.broke_egg && (
                      <div className="bg-gray-50 rounded-lg border border-gray-200 px-2.5 py-1.5">
                        <div className="text-[10px] text-gray-400">Broken eggs</div>
                        <div className="font-medium">{card.broke_egg}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {card.other_notes && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Notes</p>
                  <div className="text-sm bg-gray-50 rounded-lg border border-gray-200 px-2.5 py-1.5">{card.other_notes}</div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-b-lg border p-4">
              <button type="button" onClick={() => setEditing(true)}
                className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold">
                Edit Card
              </button>
            </div>
          </>
        ) : (
          <>
            {/* NEST CARD — gray section, all breedfile fields in edit mode */}
            <div className="bg-gray-700 text-white px-4 py-2 text-sm font-bold tracking-wide">
              NEST CARD (EDIT MODE)
            </div>
            <div className="bg-gray-50 border-x border-gray-300 p-4 space-y-4">
              <p className="text-[11px] text-gray-500">
                Update any fields below. Visit data is recorded from the territory page.
              </p>

              {/* Nest Site — moved to top */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Nest Site</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Height of nest above ground in meters">Height (m)</label>
                    <input type="text" value={card.nest_height}
                      onChange={e => setCard({...card, nest_height: e.target.value})}
                      placeholder="e.g. 1.2"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Plant species nest is built in, e.g., Snowberry, Rosa, Grass">Vegetation</label>
                    <input type="text" value={card.vegetation}
                      onChange={e => setCard({...card, vegetation: e.target.value})}
                      placeholder="e.g. Rosa nutkana"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-[11px] text-gray-600 mb-0.5" title="Location description, landmarks, visibility">Nest description</label>
                  <textarea value={card.nest_description}
                    onChange={e => setCard({...card, nest_description: e.target.value})}
                    placeholder="Where is the nest? Structure, visibility, landmarks"
                    className="w-full border rounded px-2 py-1.5 text-sm bg-white" rows={2} />
                </div>
              </div>

              {/* Discovery & Parents */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Discovery & Parents</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-0.5">Stage found</label>
                    <select value={card.stage_find}
                      onChange={e => setCard({...card, stage_find: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">—</option>
                      <option value="NB">NB — Building</option>
                      <option value="EL">EL — Laying</option>
                      <option value="IC">IC — Incubating</option>
                      <option value="HY">HY — Hatched young</option>
                      <option value="FY">FY — Fledged young</option>
                      <option value="MTD">MTD — Empty (had eggs)</option>
                      <option value="MTUK">MTUK — Empty (unknown)</option>
                      <option value="NFN">NFN — Never found nest</option>
                      <option value="UK">UK — Unknown</option>
                    </select>
                    {milestoneDates.stage_find && (
                      <div className="text-[9px] text-gray-400 mt-0.5">JD {milestoneDates.stage_find.jd} ({milestoneDates.stage_find.label})</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Were eggs laid in this nest? Y = yes, at least one egg was laid. N = no, nest was abandoned before egg laying. U = unknown, nest found empty and uncertain.">Eggs laid?</label>
                    <select value={card.eggs_laid}
                      onChange={e => setCard({...card, eggs_laid: e.target.value})}
                      title="Y = yes, eggs were laid. N = no eggs laid. U = unknown."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">—</option>
                      <option value="Y">Y — Yes, eggs laid</option>
                      <option value="N">N — No eggs</option>
                      <option value="U">U — Unknown</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Was the whole clutch observed? Y = you saw the bird incubating (complete clutch). N = uncertain if clutch is complete.">Whole clutch?</label>
                    <select value={card.whole_clutch}
                      onChange={e => setCard({...card, whole_clutch: e.target.value})}
                      title="Y = bird seen incubating, clutch is complete. N = uncertain if all eggs are laid."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">—</option>
                      <option value="Y">Y — Complete clutch</option>
                      <option value="N">N — Not sure</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Successful brood sequence for this pair/territory in the season. 1 = first successful brood, 2 = second, etc. Tracks the pair, not individual.">Brood #</label>
                    <input type="number" min="1" value={card.brood}
                      onChange={e => setCard({...card, brood: e.target.value})}
                      placeholder="1, 2, 3..."
                      title="Successful brood sequence for this pair/territory in the season. 1 = first successful brood, 2 = second, etc."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">♂ attempt #</label>
                    <input type="number" value={card.male_attempt}
                      onChange={e => setCard({...card, male_attempt: e.target.value})}
                      placeholder="1, 2..."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">♀ attempt #</label>
                    <input type="number" value={card.female_attempt}
                      onChange={e => setCard({...card, female_attempt: e.target.value})}
                      placeholder="1, 2..."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                </div>
              </div>

              {/* SOSP counts + quality flags + dates */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">SOSP Counts & Dates</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { k: 'eggs', q: 'eggs_quality', l: 'Eggs', desc: 'Clutch size' },
                    { k: 'hatch', q: 'hatch_quality', l: 'Hatch', desc: 'Eggs hatched' },
                    { k: 'band', q: 'band_quality', l: 'Band', desc: 'Day 6 count' },
                    { k: 'fledge', q: 'fledge_quality', l: 'Fledge', desc: 'Left nest' },
                    { k: 'indep', q: 'indep_quality', l: 'Indep', desc: 'Day 22+' },
                  ].map(f => {
                    const md = milestoneDates[f.k]
                    return (
                      <div key={f.k}>
                        <div className="text-[10px] text-gray-400 text-center">{f.l}</div>
                        <input type="number" min="0" value={card[f.k]}
                          onChange={e => setCard({...card, [f.k]: e.target.value})}
                          placeholder="—"
                          className="w-full border rounded px-1 py-2 text-sm text-center font-mono bg-white" />
                        <select value={card[f.q]}
                          onChange={e => setCard({...card, [f.q]: e.target.value})}
                          className={`w-full border rounded px-0.5 py-1 text-xs text-center mt-0.5 ${
                            card[f.q] ? 'bg-white text-gray-700' : 'bg-yellow-50 text-yellow-600 border-yellow-300'
                          }`}>
                          <option value="">flag</option>
                          <option value=".">. reliable</option>
                          <option value="?">? uncertain</option>
                          <option value="+">+ minimum</option>
                          <option value="-">- overcount</option>
                        </select>
                        {md && (
                          <div className="text-[8px] text-gray-400 text-center mt-0.5 leading-tight">
                            JD {md.jd}<br/>{md.label}
                          </div>
                        )}
                        <div className="text-[8px] text-gray-300 text-center mt-0.5">{f.desc}</div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Set a quality flag for each count when completing the card.</p>
              </div>

              {/* Dates / DFE */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Timing</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Julian day chicks hatched. Auto-derived from chick age visits.">Hatch day</label>
                    <input type="number" min="1" value={card.date_hatch}
                      onChange={e => setCard({...card, date_hatch: e.target.value})}
                      placeholder="Julian day"
                      className="w-full border rounded px-2 py-2 text-sm font-mono bg-white" />
                    {card.date_hatch && <div className="text-[10px] text-gray-400 mt-0.5">{julianLabel(card.date_hatch)}</div>}
                    <div className="text-[10px] text-gray-400">Auto from chick age visits</div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Date of First Egg (Julian day). Auto-calculated: DFE = Hatch date - 13 - (Clutch Size - 1)">DFE</label>
                    <input type="number" value={card.dfe}
                      onChange={e => setCard({...card, dfe: e.target.value})}
                      placeholder="Julian day"
                      className="w-full border rounded px-2 py-2 text-sm font-mono bg-white" />
                    {card.dfe && <div className="text-[10px] text-gray-400 mt-0.5">{julianLabel(card.dfe)}</div>}
                    <select value={card.dfe_quality}
                      onChange={e => setCard({...card, dfe_quality: e.target.value})}
                      className={`w-full border rounded px-1 py-1 text-xs mt-0.5 ${
                        card.dfe_quality ? 'bg-white text-gray-700' : 'bg-yellow-50 text-yellow-600 border-yellow-300'
                      }`}>
                      <option value="">DFE flag</option>
                      <option value=".">. reliable</option>
                      <option value="?">? uncertain</option>
                      <option value="+">+ minimum</option>
                      <option value="-">- overcount</option>
                    </select>
                    <div className="text-[10px] text-gray-400 mt-0.5">Auto: hatch - 13 - (eggs-1)</div>
                  </div>
                </div>
              </div>

              {/* Cowbird */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Cowbird</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { k: 'cow_egg', l: 'Eggs' }, { k: 'cow_hatch', l: 'Hatch' },
                    { k: 'cow_band', l: 'Band' }, { k: 'cow_fledge', l: 'Fledge' },
                  ].map(f => (
                    <div key={f.k}>
                      <div className="text-[10px] text-gray-400 text-center">{f.l}</div>
                      <input type="text" value={card[f.k]}
                        onChange={e => setCard({...card, [f.k]: e.target.value})}
                        placeholder="—"
                        className="w-full border rounded px-1 py-1.5 text-sm text-center font-mono bg-white" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Banded Chicks */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Banded Chicks</p>
                  {[1,2,3,4,5].map(i => {
                    const id = card[`kid${i}`]
                    // Show all 5 slots so crew can band multiple chicks at once
                    return (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-1 items-center">
                        <input type="text" value={card[`kid${i}`]}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '').slice(0, 9)
                            setCard({...card, [`kid${i}`]: v})
                          }}
                          placeholder={`Kid ${i} (9 digits)`}
                          inputMode="numeric" maxLength={9}
                          className="border rounded px-2 py-1.5 text-xs font-mono bg-white" />
                        <input type="text" value={card[`kid${i}_combo`]}
                          onChange={e => setCard({...card, [`kid${i}_combo`]: e.target.value})}
                          placeholder="color combo"
                          className="border rounded px-2 py-1.5 text-xs font-mono bg-white" />
                        <button type="button"
                          onClick={() => {
                            const on = !card[`kid${i}_indep`]
                            const c = { ...card, [`kid${i}_indep`]: on }
                            const n = [1,2,3,4,5].filter(j => j === i ? on : c[`kid${j}_indep`]).length
                            c.indep = n > 0 ? String(n) : ''
                            setCard(c)
                          }}
                          title="Mark this chick as independent"
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border-2 whitespace-nowrap transition ${
                            card[`kid${i}_indep`]
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-white text-gray-400 border-gray-300 hover:border-green-400 hover:text-green-600'
                          }`}>
                          {card[`kid${i}_indep`] ? 'Indep' : 'Indep?'}
                        </button>
                      </div>
                    )
                  })}
              </div>

              {/* Egg Fate */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Egg Fate</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Number/description of unhatched eggs remaining in nest after hatching">Unhatched eggs</label>
                    <input type="text" value={card.unhatch}
                      onChange={e => setCard({...card, unhatch: e.target.value})}
                      placeholder="e.g. 1 unfertilized"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5" title="Description of broken/damaged eggs found in or near nest">Broken eggs</label>
                    <input type="text" value={card.broke_egg}
                      onChange={e => setCard({...card, broke_egg: e.target.value})}
                      placeholder="e.g. shell fragments"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                </div>
              </div>

              {/* Outcome */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Outcome</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Fail code (24 = success)</label>
                      <select value={card.fail_code}
                        onChange={e => setCard({...card, fail_code: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                        <option value="">—</option>
                        <option value="24">24 — Success</option>
                        {failcodes.filter(f => f.code !== '24').map(f => (
                          <option key={f.code} value={f.code}>{f.code} — {f.description}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Stage at failure</label>
                      <select value={card.stage_fail}
                        onChange={e => setCard({...card, stage_fail: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                        <option value="">—</option>
                        <option value="NB">Building</option>
                        <option value="EL">Laying</option>
                        <option value="IC">Incubating</option>
                        <option value="HY">Hatched young</option>
                      </select>
                    </div>
                  </div>
                </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] text-gray-600 mb-0.5">Other notes</label>
                <textarea value={card.other_notes}
                  onChange={e => setCard({...card, other_notes: e.target.value})}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-white" rows={2} />
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="bg-white rounded-b-lg border p-4 space-y-3">
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => { setEditing(false); loadNest() }}
                  className="px-6 border-2 rounded-lg py-3 text-sm text-gray-600 font-medium">
                  Cancel
                </button>
              </div>

              {/* Mark Complete / Reopen */}
              {!card.field_complete ? (
                <button type="button" onClick={async () => {
                  // FIRST: save pending card changes to the database
                  try {
                    const intFields = new Set(['eggs','hatch','band','fledge','indep','dfe','date_hatch',
                      'corr_dfe','cow_egg','cow_hatch','kid1','kid2','kid3','kid4','kid5','brood'])
                    const skipIfEmpty = new Set(['field_complete'])
                    const pendingUpdates = {}
                    for (const [k, v] of Object.entries(card)) {
                      if (k.endsWith('_combo') || k.endsWith('_indep')) continue
                      if (skipIfEmpty.has(k)) continue
                      if (v === '' || v === null || v === undefined) {
                        if (nest[k] != null && nest[k] !== '') pendingUpdates[k] = null
                        continue
                      }
                      if (intFields.has(k)) {
                        const parsed = parseInt(v)
                        pendingUpdates[k] = isNaN(parsed) ? null : parsed
                      } else {
                        pendingUpdates[k] = v
                      }
                    }
                    if (Object.keys(pendingUpdates).length > 0) {
                      const { error } = await supabase.from('breed').update(pendingUpdates).eq('breed_id', nest.breed_id)
                      if (error) { alert('Save failed: ' + error.message); return }
                    }
                  } catch (err) { alert('Save failed: ' + err.message); return }

                  // ── Validate all required breedfile fields ──
                  const missing = []
                  const has = (v) => v !== '' && v !== null && v !== undefined

                  // Must have at least one visit
                  if (visits.length === 0) missing.push('At least one visit recorded')

                  // Always required
                  if (!nest.male_id && !nest.female_id) missing.push('At least one parent')
                  if (!card.stage_find) missing.push('Stage of find')
                  if (!card.eggs_laid) missing.push('Eggs laid? (Y/N/U)')
                  if (!card.fail_code) missing.push('Fail code (24 = success)')

                  // Did eggs get laid?
                  const eggsLaid = card.eggs_laid === 'Y'

                  if (eggsLaid) {
                    // Full reproductive pipeline required when eggs were laid
                    if (!has(card.eggs)) missing.push('Eggs count')
                    if (has(card.eggs) && parseInt(card.eggs) === 0) missing.push('Eggs laid=Y but eggs=0 — contradiction')
                    if (!has(card.dfe)) missing.push('DFE (date of first egg)')
                    if (!has(card.date_hatch) && has(card.hatch) && parseInt(card.hatch) > 0) missing.push('Hatch date (Julian day)')
                    if (!has(card.hatch)) missing.push('Hatch count (0 if none hatched)')
                    if (!has(card.band)) missing.push('Band count (0 if none banded)')
                    if (!has(card.fledge)) missing.push('Fledge count (0 if none fledged)')
                    if (!has(card.indep)) missing.push('Indep count (0 if none independent)')
                    if (!card.whole_clutch) missing.push('Whole clutch? (Y/N)')

                    // If nest failed (not code 24), require stage at failure
                    if (card.fail_code && card.fail_code !== '24' && !card.stage_fail) {
                      missing.push('Stage at failure')
                    }
                    // Note: fail_code=24 + indep=0 is valid — nest "succeeded" (fledged)
                    // but all fledglings may have died before independence (Day 24)
                  } else {
                    // No eggs — still need eggs count explicitly set (even if 0)
                    if (!has(card.eggs)) missing.push('Eggs count (0 if no eggs)')
                    // eggs_laid=N or U shouldn't have eggs > 0
                    if (has(card.eggs) && parseInt(card.eggs) > 0 && card.eggs_laid === 'N') {
                      missing.push('Eggs count > 0 but eggs laid=N — contradiction')
                    }
                  }

                  // Quality flags — required for every count that has a value
                  const qPairs = [
                    ['eggs', 'eggs_quality', 'Eggs'], ['hatch', 'hatch_quality', 'Hatch'],
                    ['band', 'band_quality', 'Band'], ['fledge', 'fledge_quality', 'Fledge'],
                    ['indep', 'indep_quality', 'Indep'], ['dfe', 'dfe_quality', 'DFE'],
                  ]
                  for (const [countK, qualK, label] of qPairs) {
                    if (has(card[countK]) && !card[qualK]) {
                      missing.push(`${label} quality flag`)
                    }
                  }

                  if (missing.length > 0) {
                    alert('Cannot mark complete. Missing:\n\n• ' + missing.join('\n• '))
                    return
                  }
                  const { error } = await supabase.from('breed')
                    .update({ field_complete: true }).eq('breed_id', nest.breed_id)
                  if (error) { alert('Error: ' + error.message); return }
                  setCard(c => ({ ...c, field_complete: true }))
                  setNest(n => ({ ...n, field_complete: true }))
                }}
                  className="w-full border-2 border-green-500 text-green-700 rounded-lg py-3 text-sm font-semibold hover:bg-green-50 transition">
                  Mark Card Complete
                </button>
              ) : (
                <button type="button" onClick={async () => {
                  const { error } = await supabase.from('breed')
                    .update({ field_complete: false }).eq('breed_id', nest.breed_id)
                  if (error) { alert('Error: ' + error.message); return }
                  setCard(c => ({ ...c, field_complete: false }))
                  setNest(n => ({ ...n, field_complete: false }))
                }}
                  className="w-full border-2 border-gray-300 text-gray-500 rounded-lg py-3 text-sm font-medium">
                  Reopen Card
                </button>
              )}
            </div>
          </>
        )}
      </form>

      {/* ═══════════════════════════════════════════════════════════════
          VISIT LOG
          ═══════════════════════════════════════════════════════════════ */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Visit Log ({visits.length})
        </h3>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-lg border p-4">No visits recorded yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase">
                <th className="py-1 pr-1 font-medium">Date</th>
                <th className="py-1 pr-1 font-medium">Time</th>
                <th className="py-1 pr-1 font-medium">Obs</th>
                <th className="py-1 pr-1 font-medium">Stage</th>
                <th className="py-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
            {visits.map(v => {
              const isEditingThis = editingVisit === v.nest_visit_id

              if (isEditingThis) {
                return (
                  <tr key={v.nest_visit_id}><td colSpan={5} className="py-1">
                  <div className="bg-yellow-50 rounded-lg border-2 border-yellow-300 px-3 py-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Date</label>
                        <input type="date" value={editVisitForm.visit_date || ''}
                          onChange={e => setEditVisitForm({ ...editVisitForm, visit_date: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Time</label>
                        <input type="time" value={editVisitForm.visit_time || ''}
                          onChange={e => setEditVisitForm({ ...editVisitForm, visit_time: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Observer</label>
                        <select value={editVisitForm.observer || ''}
                          onChange={e => setEditVisitForm({ ...editVisitForm, observer: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                          <option value="">Select...</option>
                          {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Stage</label>
                        <select value={editVisitForm.nest_stage || ''}
                          onChange={e => setEditVisitForm({ ...editVisitForm, nest_stage: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                          <option value="">—</option>
                          {['building', 'laying', 'incubating', 'hatching', 'nestling', 'fledged', 'independent', 'failed'].map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* Stage-aware fields — only show what's relevant */}
                    {(editVisitForm.nest_stage === 'laying' || editVisitForm.nest_stage === 'incubating') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Egg count</label>
                          <input type="number" min="0" value={editVisitForm.egg_count ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, egg_count: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">CB eggs</label>
                          <input type="number" min="0" value={editVisitForm.cowbird_eggs ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, cowbird_eggs: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}
                    {editVisitForm.nest_stage === 'hatching' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Chicks hatched</label>
                          <input type="number" min="0" value={editVisitForm.chick_count ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, chick_count: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">CB chicks</label>
                          <input type="number" min="0" value={editVisitForm.cowbird_chicks ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, cowbird_chicks: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}
                    {editVisitForm.nest_stage === 'nestling' && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Chick count</label>
                          <input type="number" min="0" value={editVisitForm.chick_count ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, chick_count: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">Chick age (days)</label>
                          <input type="number" min="0" value={editVisitForm.chick_age_estimate ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, chick_age_estimate: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">CB chicks</label>
                          <input type="number" min="0" value={editVisitForm.cowbird_chicks ?? ''}
                            onChange={e => setEditVisitForm({ ...editVisitForm, cowbird_chicks: e.target.value })}
                            className="w-full border rounded px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}
                    {(editVisitForm.nest_stage === 'fledged' || editVisitForm.nest_stage === 'independent') && (
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">
                          {editVisitForm.nest_stage === 'fledged' ? 'Fledge count' : 'Independent count'}
                        </label>
                        <input type="number" min="0" value={editVisitForm.chick_count ?? ''}
                          onChange={e => setEditVisitForm({ ...editVisitForm, chick_count: e.target.value })}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Comments</label>
                      <textarea value={editVisitForm.comments || ''}
                        onChange={e => setEditVisitForm({ ...editVisitForm, comments: e.target.value })}
                        className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleSaveNestVisitEdit(v.nest_visit_id)}
                        className="flex-1 bg-blue-600 text-white rounded py-1.5 text-xs font-semibold">
                        Save
                      </button>
                      <button type="button" onClick={() => { setEditingVisit(null); setEditVisitForm({}) }}
                        className="px-4 border rounded py-1.5 text-xs text-gray-600">
                        Cancel
                      </button>
                    </div>
                  </div>
                  </td></tr>
                )
              }

              // Build content summary (like paper card's "content" column)
              const content = [
                v.egg_count != null ? `${v.egg_count} eggs` : null,
                v.chick_count != null ? `${v.chick_count} chicks` : null,
                v.chick_age_estimate != null ? `D${v.chick_age_estimate}` : null,
                v.cowbird_eggs > 0 ? `${v.cowbird_eggs} CB eggs` : null,
                v.cowbird_chicks > 0 ? `${v.cowbird_chicks} CB chicks` : null,
              ].filter(Boolean).join(', ') || '—'

              // Status = stage + comments (like paper card's "status" column)
              const stage = v.nest_stage ? v.nest_stage.charAt(0).toUpperCase() + v.nest_stage.slice(1) : ''

              // Format date as M/D
              const fmtVisitDate = (d) => {
                if (!d) return ''
                const [y, m, day] = d.split('-')
                return `${parseInt(m)}/${parseInt(day)}`
              }
              // Format time as h:mm AM/PM
              const fmtTime = (t) => {
                if (!t) return ''
                const [h, m] = t.split(':').map(Number)
                const ampm = h >= 12 ? 'PM' : 'AM'
                return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${ampm}`
              }

              // Look up territory visit notes via FK
              const tvNotes = v.territory_visit_id ? territoryNotes[v.territory_visit_id] : null
              // Show territory visit notes as the primary notes; fall back to nest_visits.comments
              const displayNotes = tvNotes || v.comments || ''

              return (
                <tr key={v.nest_visit_id} className="border-t border-gray-200 align-top">
                  <td className="py-1.5 pr-1 text-[11px] text-gray-600 whitespace-nowrap">{fmtVisitDate(v.visit_date)}</td>
                  <td className="py-1.5 pr-1 text-[11px] text-gray-400 whitespace-nowrap">{fmtTime(v.visit_time)}</td>
                  <td className="py-1.5 pr-1 text-[11px] text-gray-600">{content}</td>
                  <td className="py-1.5 pr-1 text-[11px]">
                    {stage && <span className="text-blue-700 font-medium">{stage}</span>}
                  </td>
                  <td className="py-1.5 text-[11px]">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-gray-600">{displayNotes}</span>
                      <button type="button"
                        onClick={() => {
                          setEditingVisit(v.nest_visit_id)
                          setEditVisitForm({
                            visit_date: v.visit_date || '',
                            visit_time: v.visit_time || '',
                            observer: v.observer || '',
                            nest_stage: v.nest_stage || '',
                            egg_count: v.egg_count ?? '',
                            chick_count: v.chick_count ?? '',
                            chick_age_estimate: v.chick_age_estimate ?? '',
                            cowbird_eggs: v.cowbird_eggs ?? '',
                            cowbird_chicks: v.cowbird_chicks ?? '',
                            comments: v.comments || '',
                          })
                        }}
                        className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0">
                        edit
                      </button>
                    </div>
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
