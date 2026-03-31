'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel, calculateDFE, estimateHatchDate, toJulianDay, fromJulianDay, localDateString, localTimeString } from '@/lib/helpers'

// 2026 field crew — update this list each season
const OBSERVER_LIST = ['Katherine']

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
  // Visit observation — what you're recording right now
  const [visit, setVisit] = useState({
    visit_date: localDateString(),
    visit_time: localTimeString(),
    observer: '',
    nest_stage: '',
    egg_count: '',
    chick_count: '',
    chick_age_estimate: '',
    cowbird_eggs: '',
    cowbird_chicks: '',
    comments: '',
  })

  // ── Data loading ─────────────────────────────────────────────────────
  useEffect(() => { loadNest(); loadLookups() }, [nestId])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mandarte_observer') : null
    if (saved) setVisit(v => ({ ...v, observer: saved }))
  }, [])

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
          .eq('breed_id', n.breed_id).order('visit_date', { ascending: false })
        allVisits = data || []
      }
      if (n.nestrec) {
        const { data } = await supabase.from('nest_visits').select('*')
          .eq('nestrec', n.nestrec).order('visit_date', { ascending: false })
        const ids = new Set(allVisits.map(v => v.nest_visit_id))
        for (const v of (data || [])) { if (!ids.has(v.nest_visit_id)) allVisits.push(v) }
        allVisits.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))
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

  // ── Save handler ─────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault()
    if (!visit.observer.trim()) { alert('Observer name is required.'); return }
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

      // Log the visit — include per-kid independence data when doing an indep check
      let visitComments = visit.comments || ''
      if (visit.nest_stage === 'independent') {
        const indepKids = [1,2,3,4,5]
          .filter(i => card[`kid${i}`] && card[`kid${i}_indep`])
          .map(i => `${card[`kid${i}_combo`] || 'kid' + i} (${card[`kid${i}`]})`)
        if (indepKids.length > 0) {
          const indepNote = `Independent: ${indepKids.join(', ')}`
          visitComments = visitComments ? `${visitComments} | ${indepNote}` : indepNote
        }
      }

      await supabase.from('nest_visits').insert({
        breed_id: nest.breed_id,
        nestrec: nest.nestrec || null,
        visit_date: visit.visit_date,
        visit_time: visit.visit_time || null,
        observer: visit.observer.trim(),
        nest_stage: visit.nest_stage || null,
        egg_count: visit.egg_count ? parseInt(visit.egg_count) : null,
        chick_count: visit.chick_count ? parseInt(visit.chick_count) : null,
        chick_age_estimate: visit.chick_age_estimate ? parseInt(visit.chick_age_estimate) : null,
        cowbird_eggs: visit.cowbird_eggs ? parseInt(visit.cowbird_eggs) : null,
        cowbird_chicks: visit.cowbird_chicks ? parseInt(visit.cowbird_chicks) : null,
        comments: visitComments || null,
      })

      // Save observer to localStorage
      if (typeof window !== 'undefined') localStorage.setItem('mandarte_observer', visit.observer.trim())

      setVisit(v => ({ ...v,
        visit_date: localDateString(),
        visit_time: localTimeString(),
        nest_stage: '', egg_count: '', chick_count: '', chick_age_estimate: '',
        cowbird_eggs: '', cowbird_chicks: '', comments: '',
      }))
      setEditing(false)
      loadNest()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
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
    let hd = parseInt(nest.date_hatch)
    if (!hd && nest.dfe && nest.eggs) hd = nest.dfe + 13 + (nest.eggs - 1)
    if (hd) {
      const age = jToday - hd
      // Active warnings — current protocol windows
      if (age >= 9 && age <= 11) w.push({ t: 'danger', m: `DO NOT APPROACH — chicks are Day ${age}, will jump prematurely!` })
      if (age === 7) w.push({ t: 'warn', m: 'Day 7 — handle with extreme care, chicks may jump.' })
      if (age >= 4 && age <= 6) w.push({ t: 'info', m: `Banding window! Chicks ~Day ${age}. Target Day 6.` })
      if (age === 3) w.push({ t: 'warn', m: 'Emergency banding only — 1 metal + 1 color per leg.' })
      if (age >= 12 && age <= 14) w.push({ t: 'info', m: `Fledge check due — chicks ~Day ${age}.` })
      if (age >= 22 && age <= 26) w.push({ t: 'info', m: `Independence check due — chicks ~Day ${age}.` })
      // Overdue warnings — missed protocol steps
      if (age >= 8 && !nest.band && nest.hatch > 0) w.push({ t: 'warn', m: `Banding may be overdue — chicks are Day ${age}. Record # banded.` })
      if (age >= 15 && !nest.fledge && nest.hatch > 0) w.push({ t: 'warn', m: `Fledge check overdue — chicks are Day ${age}. Record # fledged.` })
      if (age >= 27 && !nest.indep && nest.fledge > 0) w.push({ t: 'warn', m: `Independence check overdue — chicks are Day ${age}. Record # independent.` })
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

  // Current visit stage for conditional fields
  const stage = visit.nest_stage

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
              {nest.nestrec ? `Nest #${nest.nestrec}` : 'Nest (draft)'}
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
          {/* Pipeline summary */}
          <div className="mt-3 flex items-center gap-1 text-center">
            {[
              { k: 'eggs', l: 'Eggs' }, { k: 'hatch', l: 'Hatch' },
              { k: 'band', l: 'Band' }, { k: 'fledge', l: 'Fledge' },
              { k: 'indep', l: 'Indep' },
            ].map((s, i) => {
              const val = card[s.k]
              return (
                <div key={s.k} className="flex items-center">
                  {i > 0 && <span className="text-gray-300 mx-0.5">&rarr;</span>}
                  <div className={`rounded-lg px-2.5 py-1 text-xs ${
                    val !== '' && val != null ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <div className="text-[10px]">{s.l}</div>
                    <div className="text-sm">{val !== '' ? val : '—'}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-gray-500 space-y-0.5">
            {displayDFE && <div>DFE: {displayDFE} ({julianLabel(displayDFE)}) {nest.corr_dfe ? '(corrected)' : ''}</div>}
            {card.date_hatch && <div>Hatch date: {card.date_hatch} ({julianLabel(card.date_hatch)})</div>}
          </div>
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
            </div>
          )}
        </div>

        {/* ╔═══════════════════════════════════════════════════════════════╗
           ║  UPDATE CARD BUTTON / EDIT MODE                             ║
           ╚═══════════════════════════════════════════════════════════════╝ */}
        {!editing ? (
          <div className="bg-white rounded-b-lg border p-4">
            <button type="button" onClick={() => setEditing(true)}
              className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold">
              Update Card
            </button>
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════════════
                THIS VISIT — blue section, clearly separate
                ═══════════════════════════════════════════════════════════ */}
            <div className="bg-blue-600 text-white px-4 py-2 text-sm font-bold tracking-wide">
              THIS VISIT
            </div>
            <div className="bg-blue-50 border-x border-blue-200 p-4 space-y-3">
              {/* Date / Time / Observer */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-blue-800 font-medium mb-0.5">Date *</label>
                  <input type="date" value={visit.visit_date} required
                    onChange={e => setVisit({...visit, visit_date: e.target.value})}
                    className="w-full border border-blue-200 rounded px-2 py-2 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] text-blue-800 font-medium mb-0.5">Time</label>
                  <input type="time" value={visit.visit_time}
                    onChange={e => setVisit({...visit, visit_time: e.target.value})}
                    className="w-full border border-blue-200 rounded px-2 py-2 text-sm bg-white" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-blue-800 font-medium mb-0.5">Observer *</label>
                  <select value={OBSERVER_LIST.includes(visit.observer) ? visit.observer : (visit.observer ? '__other__' : '')}
                    onChange={e => {
                      const v = e.target.value
                      if (v === '__other__') setVisit({ ...visit, observer: '' })
                      else setVisit({ ...visit, observer: v })
                    }}
                    className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm bg-white" required>
                    <option value="">Select observer...</option>
                    {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
                    <option value="__other__">Other...</option>
                  </select>
                  {!OBSERVER_LIST.includes(visit.observer) && visit.observer !== '' && (
                    <input type="text" value={visit.observer}
                      onChange={e => setVisit({ ...visit, observer: e.target.value })}
                      placeholder="Enter name" className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm mt-1 bg-white" />
                  )}
                </div>
              </div>

              {/* Stage selector */}
              <div>
                <label className="block text-[11px] text-blue-800 font-medium mb-1">What stage is this nest at?</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { v: 'building', l: 'Building' },
                    { v: 'laying', l: 'Laying' },
                    { v: 'incubating', l: 'Incubating' },
                    { v: 'nestling', l: 'Nestling' },
                    { v: 'fledged', l: 'Fledge check' },
                    { v: 'independent', l: 'Indep check' },
                    { v: 'failed', l: 'Failed' },
                    { v: 'abandoned', l: 'Abandoned' },
                  ].map(s => (
                    <button key={s.v} type="button"
                      onClick={() => setVisit({...visit, nest_stage: visit.nest_stage === s.v ? '' : s.v})}
                      className={`px-3 py-2 rounded-full text-xs font-medium transition min-h-[44px] ${
                        visit.nest_stage === s.v
                          ? 'bg-blue-700 text-white shadow'
                          : 'bg-white text-blue-800 border border-blue-200'
                      }`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Stage-specific fields ── */}

              {/* BUILDING / LAYING: just notes + nest location */}
              {(stage === 'building' || stage === 'laying') && (
                <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-200">
                  <p className="text-xs text-gray-600">Record nest location and any observations.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Nest height (m)</label>
                      <input type="text" value={card.nest_height}
                        onChange={e => setCard({...card, nest_height: e.target.value})}
                        placeholder="e.g. 1.2"
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Vegetation</label>
                      <input type="text" value={card.vegetation}
                        onChange={e => setCard({...card, vegetation: e.target.value})}
                        placeholder="e.g. Rosa nutkana"
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">Nest description / location</label>
                    <textarea value={card.nest_description}
                      onChange={e => setCard({...card, nest_description: e.target.value})}
                      placeholder="Where is the nest? Structure, visibility, landmarks"
                      className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                  </div>
                  {stage === 'laying' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-0.5">Eggs seen today</label>
                        <input type="number" value={visit.egg_count}
                          onChange={e => setVisit({...visit, egg_count: e.target.value})}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-0.5">Cowbird eggs</label>
                        <input type="number" value={visit.cowbird_eggs}
                          onChange={e => setVisit({...visit, cowbird_eggs: e.target.value})}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* INCUBATING: egg count, cowbird */}
              {stage === 'incubating' && (
                <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-200">
                  <p className="text-xs text-gray-600">How many eggs? Is the female incubating?</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">SOSP eggs</label>
                      <input type="number" value={visit.egg_count}
                        onChange={e => setVisit({...visit, egg_count: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">CB eggs</label>
                      <input type="number" value={visit.cowbird_eggs}
                        onChange={e => setVisit({...visit, cowbird_eggs: e.target.value})}
                        className="w-full border rounded px-2 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Whole clutch?</label>
                      <select value={card.whole_clutch}
                        onChange={e => setCard({...card, whole_clutch: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                        <option value="">—</option>
                        <option value="Y">Yes</option>
                        <option value="N">No</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* NESTLING: chick count, age, banding fields */}
              {stage === 'nestling' && (
                <div className="bg-white rounded-lg p-3 space-y-3 border border-blue-200">
                  <p className="text-xs text-gray-600">How many chicks? What day? If banding today, enter bands below.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Chicks</label>
                      <input type="number" value={visit.chick_count}
                        onChange={e => setVisit({...visit, chick_count: e.target.value})}
                        className="w-full border rounded px-2 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Age (day)</label>
                      <input type="number" value={visit.chick_age_estimate}
                        onChange={e => setVisit({...visit, chick_age_estimate: e.target.value})}
                        placeholder="e.g. 6"
                        className="w-full border rounded px-2 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">CB chicks</label>
                      <input type="number" value={visit.cowbird_chicks}
                        onChange={e => setVisit({...visit, cowbird_chicks: e.target.value})}
                        className="w-full border rounded px-2 py-2 text-sm" />
                    </div>
                  </div>

                  {/* Banding section */}
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Banding chicks</p>
                    <p className="text-[11px] text-gray-500 mb-2">
                      Enter the 9-digit metal band number and color band combination for each chick you banded.
                      Leave blank for unbanded chicks.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-1">
                      <div className="text-xs text-gray-400 px-0.5">Metal band #</div>
                      <div className="text-xs text-gray-400 px-0.5">Color combo</div>
                    </div>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="grid grid-cols-2 gap-2 mb-1.5">
                        <input type="text" value={card[`kid${i}`]}
                          onChange={e => setCard({...card, [`kid${i}`]: e.target.value})}
                          placeholder={`Chick ${i}`}
                          className="border rounded px-2 py-1.5 text-xs font-mono" />
                        <input type="text" value={card[`kid${i}_combo`]}
                          onChange={e => setCard({...card, [`kid${i}_combo`]: e.target.value})}
                          placeholder="color combo"
                          className="border rounded px-2 py-1.5 text-xs font-mono" />
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-0.5"># banded</label>
                        <input type="number" value={card.band}
                          onChange={e => setCard({...card, band: e.target.value})}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-600 mb-0.5">CB at banding</label>
                        <input type="text" value={card.cow_band}
                          onChange={e => setCard({...card, cow_band: e.target.value})}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FLEDGE CHECK: # fledged + notes */}
              {stage === 'fledged' && (
                <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-200">
                  <p className="text-xs text-gray-600">
                    Check nest is empty. Count fledglings seen near the nest.
                    Describe nest contents (empty, dead chick, unhatched eggs) in notes below.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5"># fledglings seen</label>
                      <input type="number" value={card.fledge}
                        onChange={e => setCard({...card, fledge: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">CB fledged</label>
                      <input type="text" value={card.cow_fledge}
                        onChange={e => setCard({...card, cow_fledge: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Unhatched eggs</label>
                      <input type="text" value={card.unhatch}
                        onChange={e => setCard({...card, unhatch: e.target.value})}
                        placeholder="e.g. 1 unfertilized"
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* INDEPENDENCE CHECK: kid checklist */}
              {stage === 'independent' && (
                <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-200">
                  <p className="text-xs text-gray-600">
                    Which chicks from this nest are feeding independently? Check each one you confirmed.
                    If you can't read bands, just enter a count below.
                  </p>
                  {/* Kid checklist */}
                  {[1,2,3,4,5].map(i => {
                    const id = card[`kid${i}`]
                    if (!id) return null
                    const combo = card[`kid${i}_combo`] || kidBirds[id]?.color_combo || ''
                    return (
                      <button key={i} type="button"
                        onClick={() => {
                          const on = !card[`kid${i}_indep`]
                          const c = { ...card, [`kid${i}_indep`]: on }
                          const n = [1,2,3,4,5].filter(j => j === i ? on : c[`kid${j}_indep`]).length
                          if (n > 0) c.indep = String(n)
                          setCard(c)
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition ${
                          card[`kid${i}_indep`]
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 bg-white'
                        }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          card[`kid${i}_indep`]
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-200 text-gray-400'
                        }`}>
                          {card[`kid${i}_indep`] ? '\u2713' : i}
                        </div>
                        <div>
                          <div className="font-mono text-sm font-medium">{combo || `Kid ${i}`}</div>
                          <div className="text-[11px] text-gray-400">Band: {id}</div>
                        </div>
                        {card[`kid${i}_indep`] && (
                          <span className="ml-auto text-xs font-bold text-green-700">INDEPENDENT</span>
                        )}
                      </button>
                    )
                  })}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">
                        # independent (or enter manually)
                      </label>
                      <input type="number" value={card.indep}
                        onChange={e => setCard({...card, indep: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* FAILED / ABANDONED */}
              {(stage === 'failed' || stage === 'abandoned') && (
                <div className="bg-white rounded-lg p-3 space-y-2 border border-blue-200">
                  <p className="text-xs text-gray-600">What happened to this nest?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Fail code</label>
                      <select value={card.fail_code}
                        onChange={e => setCard({...card, fail_code: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                        <option value="">Select...</option>
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
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">What happened?</label>
                    <input type="text" value={card.fail_notes}
                      onChange={e => setCard({...card, fail_notes: e.target.value})}
                      placeholder="Describe the failure"
                      className="w-full border rounded px-2 py-1.5 text-sm" />
                  </div>
                </div>
              )}

              {/* Comments — always shown */}
              <div>
                <label className="block text-[11px] text-blue-800 font-medium mb-0.5">Notes / comments</label>
                <textarea value={visit.comments}
                  onChange={e => setVisit({...visit, comments: e.target.value})}
                  placeholder="What did you observe? Behavior, location of fledglings, nest contents, concerns..."
                  className="w-full border border-blue-200 rounded px-2 py-1.5 text-sm bg-white" rows={2} />
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════
                NEST CARD — gray section, all breedfile fields
                ═══════════════════════════════════════════════════════════ */}
            <div className="bg-gray-700 text-white px-4 py-2 text-sm font-bold tracking-wide">
              NEST CARD
            </div>
            <div className="bg-gray-50 border-x border-gray-300 p-4 space-y-4">
              <p className="text-[11px] text-gray-500">
                These are the running totals for this nest. Values are saved from previous visits.
                Update anything that changed.
              </p>

              {/* Discovery */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Discovery</p>
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
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">Eggs laid?</label>
                    <select value={card.eggs_laid}
                      onChange={e => setCard({...card, eggs_laid: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">—</option>
                      <option value="Y">Yes</option>
                      <option value="N">No</option>
                      <option value="U">Unknown</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">Whole clutch?</label>
                    <select value={card.whole_clutch}
                      onChange={e => setCard({...card, whole_clutch: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">—</option>
                      <option value="Y">Yes</option>
                      <option value="N">No</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">Brood #</label>
                    <input type="number" value={card.brood}
                      onChange={e => setCard({...card, brood: e.target.value})}
                      placeholder="1, 2, 3..."
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                  </div>
                </div>
              </div>

              {/* SOSP counts + quality flags */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">SOSP counts</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { k: 'eggs', q: 'eggs_quality', l: 'Eggs' },
                    { k: 'hatch', q: 'hatch_quality', l: 'Hatch' },
                    { k: 'band', q: 'band_quality', l: 'Band' },
                    { k: 'fledge', q: 'fledge_quality', l: 'Fledge' },
                    { k: 'indep', q: 'indep_quality', l: 'Indep' },
                  ].map(f => (
                    <div key={f.k}>
                      <div className="text-[10px] text-gray-400 text-center">{f.l}</div>
                      <input type="number" value={card[f.k]}
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
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Set a quality flag for each count when completing the card.</p>
              </div>

              {/* Dates / DFE */}
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Timing</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">Hatch day</label>
                    <input type="number" value={card.date_hatch}
                      onChange={e => setCard({...card, date_hatch: e.target.value})}
                      placeholder="Julian day"
                      className="w-full border rounded px-2 py-2 text-sm font-mono bg-white" />
                    {card.date_hatch && <div className="text-[10px] text-gray-400 mt-0.5">{julianLabel(card.date_hatch)}</div>}
                    <div className="text-[10px] text-gray-400">Auto from chick age visits</div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-0.5">DFE</label>
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

              {/* Chicks / I buttons (outside of nestling stage) */}
              {stage !== 'nestling' && stage !== 'independent' && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Banded chicks</p>
                  {[1,2,3,4,5].map(i => {
                    const id = card[`kid${i}`]
                    if (!id && i > 1 && !card[`kid${i-1}`]) return null // hide empty trailing slots
                    return (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 mb-1 items-center">
                        <input type="text" value={card[`kid${i}`]}
                          onChange={e => setCard({...card, [`kid${i}`]: e.target.value})}
                          placeholder={`Kid ${i} band #`}
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
                            if (n > 0) c.indep = String(n)
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
              )}

              {/* Other fields */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-600 mb-0.5">Unhatched eggs</label>
                  <input type="text" value={card.unhatch}
                    onChange={e => setCard({...card, unhatch: e.target.value})}
                    placeholder="e.g. 1 unfertilized"
                    className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 mb-0.5">Broken eggs</label>
                  <input type="text" value={card.broke_egg}
                    onChange={e => setCard({...card, broke_egg: e.target.value})}
                    className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                </div>
              </div>

              {/* Outcome */}
              {stage !== 'failed' && stage !== 'abandoned' && (
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
              )}

              {/* Nest site (if not already shown in visit) */}
              {stage !== 'building' && stage !== 'laying' && (
                <div>
                  <p className="text-[11px] text-gray-400 font-bold uppercase mb-1">Nest site</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Height (m)</label>
                      <input type="text" value={card.nest_height}
                        onChange={e => setCard({...card, nest_height: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-0.5">Vegetation</label>
                      <input type="text" value={card.vegetation}
                        onChange={e => setCard({...card, vegetation: e.target.value})}
                        className="w-full border rounded px-2 py-1.5 text-sm bg-white" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="block text-[11px] text-gray-600 mb-0.5">Nest description</label>
                    <textarea value={card.nest_description}
                      onChange={e => setCard({...card, nest_description: e.target.value})}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-white" rows={2} />
                  </div>
                </div>
              )}

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
          <div className="space-y-1.5">
            {visits.map(v => (
              <div key={v.nest_visit_id} className="bg-white rounded-lg border px-3 py-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-gray-700">
                    {v.visit_date}{v.visit_time ? ` ${v.visit_time}` : ''}
                    <span className="text-gray-400 ml-1.5">{v.observer}</span>
                  </span>
                  {v.nest_stage && (
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[11px] font-medium">
                      {v.nest_stage.replace('nestling_', 'Nestling D')}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                  {v.egg_count != null && <span>Eggs: {v.egg_count}</span>}
                  {v.chick_count != null && <span>Chicks: {v.chick_count}</span>}
                  {v.chick_age_estimate != null && <span>Age: D{v.chick_age_estimate}</span>}
                  {v.cowbird_eggs > 0 && <span>CB eggs: {v.cowbird_eggs}</span>}
                  {v.cowbird_chicks > 0 && <span>CB chicks: {v.cowbird_chicks}</span>}
                </div>
                {v.comments && <p className="text-xs text-gray-600 mt-0.5">{v.comments}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
