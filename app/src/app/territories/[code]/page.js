'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel, localDateString, localTimeString, toJulianDay, fromJulianDay } from '@/lib/helpers'

// 2026 field crew — update this list each season
const OBSERVER_LIST = ['Katherine', 'Emma', 'Anna', 'Jon', 'Jen']

export default function TerritoryDetailPage({ params }) {
  const { code } = params
  const router = useRouter()
  const territoryCode = decodeURIComponent(code)
  const currentYear = new Date().getFullYear()

  const [male, setMale] = useState(null)
  const [female, setFemale] = useState(null)
  const [allAssignments, setAllAssignments] = useState([]) // all assignments this year (current + ended)
  const [visits, setVisits] = useState([])
  const [nests, setNests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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

  const [nestObs, setNestObs] = useState({}) // keyed by breed_id: { stage, egg_count, chick_count, chick_age_estimate, cowbird_eggs, cowbird_chicks, comments }

  useEffect(() => { loadAll() }, [territoryCode])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mandarte_observer') : null
    if (saved) setVisitForm(f => ({ ...f, observer: saved }))
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      // Get ALL assignments for this territory this year (current + ended)
      const { data: allAssign } = await supabase
        .from('territory_assignments')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .neq('role', 'floater')
        .order('start_date', { ascending: true })
      setAllAssignments(allAssign || [])

      // Current residents (end_date IS NULL)
      const currentMale = (allAssign || []).find(a => a.sex === 2 && !a.end_date) || null
      const currentFemale = (allAssign || []).find(a => a.sex === 1 && !a.end_date) || null
      setMale(currentMale)
      setFemale(currentFemale)

      // Get visits
      const { data: visitData } = await supabase
        .from('territory_visits')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .order('visit_date', { ascending: false })
      setVisits(visitData || [])

      // Get nests
      const { data: nestData } = await supabase
        .from('breed')
        .select('*')
        .eq('territory', territoryCode)
        .eq('year', currentYear)
        .order('nestrec', { ascending: true })
      setNests(nestData || [])
    } catch (err) {
      console.error('Error loading territory:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitVisit(e) {
    e.preventDefault()
    if (!visitForm.observer || !visitForm.notes) {
      alert('Observer and notes are required.')
      return
    }
    if (visitForm.notes.length < 3) {
      alert('Please add at least a brief observation.')
      return
    }

    setSubmitting(true)
    try {
      // Determine if any nest observations were recorded
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
              comments: visitForm.notes.trim(),
            }
          })

        if (nestVisitsToInsert.length > 0) {
          const { error: nestError } = await supabase.from('nest_visits').insert(nestVisitsToInsert)
          if (nestError) throw nestError
        }
      }

      // Save observer to localStorage
      if (typeof window !== 'undefined') localStorage.setItem('mandarte_observer', visitForm.observer.trim())

      // If new nest found, redirect to create nest card
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

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  // Days since last visit — use UTC parsing to avoid timezone shift
  // new Date('2026-03-23') parses as UTC midnight, which in PDT is "yesterday"
  // So we compare using local-date-only arithmetic instead
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Link href="/territories" className="text-blue-600 text-sm">&larr; Territories</Link>
      </div>

      {/* Territory card header — like the paper card top */}
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

        {/* Resident birds — the fixed header with full assignment timeline */}
        <div className="mt-3 space-y-3">
          {/* Males */}
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
          {/* Females */}
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

      {/* Lightweight visit form */}
      {showVisitForm && (
        <form onSubmit={handleSubmitVisit} className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-700">Log Visit</h3>

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
            <select value={OBSERVER_LIST.includes(visitForm.observer) ? visitForm.observer : (visitForm.observer ? '__other__' : '')}
              onChange={e => {
                const v = e.target.value
                if (v === '__other__') setVisitForm({ ...visitForm, observer: '' })
                else setVisitForm({ ...visitForm, observer: v })
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white" required>
              <option value="">Select observer...</option>
              {OBSERVER_LIST.map(name => <option key={name} value={name}>{name}</option>)}
              <option value="__other__">Other...</option>
            </select>
            {!OBSERVER_LIST.includes(visitForm.observer) && visitForm.observer !== '' && (
              <input type="text" value={visitForm.observer}
                onChange={e => setVisitForm({ ...visitForm, observer: e.target.value })}
                placeholder="Enter name" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            )}
          </div>

          {/* Seen checkboxes — simple, no band re-entry */}
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
              <input type="number" value={visitForm.minutes_spent}
                onChange={e => setVisitForm({ ...visitForm, minutes_spent: e.target.value })}
                placeholder="e.g., 15" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nest activity</label>
              <select value={visitForm.nest_status_flag}
                onChange={e => setVisitForm({ ...visitForm, nest_status_flag: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="no_change">None</option>
                <option value="existing_nest_checked">Checked nest</option>
                <option value="new_nest_found">New nest!</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Other birds seen</label>
            <input type="text" value={visitForm.other_birds_notes}
              onChange={e => setVisitForm({ ...visitForm, other_birds_notes: e.target.value })}
              placeholder="Color combos or descriptions"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Observations *</label>
            <textarea value={visitForm.notes}
              onChange={e => setVisitForm({ ...visitForm, notes: e.target.value })}
              placeholder="Describe what you observed: behavior, song, interactions, locations..."
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={4} required />
            {visitForm.notes.length > 0 && visitForm.notes.length < 3 && (
              <p className="text-xs text-red-500 mt-1">Please add at least a brief observation.</p>
            )}
          </div>

          {/* Nest observations section — one card per active nest */}
          {nests.filter(n => !n.fail_code).length > 0 && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Active Nest Observations</h4>
              <div className="space-y-4">
                {nests.filter(n => !n.fail_code).map(nest => {
                  const obs = nestObs[nest.breed_id] || {}
                  return (
                    <div key={nest.breed_id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="text-xs font-semibold text-gray-700">
                        Nest #{nest.nestrec || `(ID ${nest.breed_id})`}
                        {nest.territory && <span className="text-gray-500 ml-1">— Territory {nest.territory}</span>}
                      </div>

                      {/* Stage selector */}
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Stage</label>
                        <div className="flex flex-wrap gap-1">
                          {['building', 'laying', 'incubating', 'nestling', 'fledged', 'independent', 'failed', 'no_change'].map(stage => (
                            <button
                              key={stage}
                              type="button"
                              onClick={() => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, stage } })}
                              className={`text-xs px-2 py-1 rounded ${
                                obs.stage === stage
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {stage === 'no_change' ? 'No change' : stage.charAt(0).toUpperCase() + stage.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Stage-specific fields */}
                      {obs.stage && obs.stage !== 'no_change' && (
                        <div className="space-y-2">
                          {(obs.stage === 'laying' || obs.stage === 'incubating') && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1" title="Number of SOSP eggs visible in nest">
                                  Egg count
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={obs.egg_count || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, egg_count: e.target.value } })}
                                  placeholder="0"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1" title="Number of brown-headed cowbird eggs observed">
                                  Cowbird eggs
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={obs.cowbird_eggs || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_eggs: e.target.value } })}
                                  placeholder="0"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                            </>
                          )}

                          {obs.stage === 'nestling' && (
                            <>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1" title="Number of SOSP chicks alive in nest">
                                  Chick count
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={obs.chick_count || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_count: e.target.value } })}
                                  placeholder="0"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1" title="Estimated age in days. Day 1 = hatch day. Day 6 = pins breaking (banding age)">
                                  Chick age (days)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={obs.chick_age_estimate || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, chick_age_estimate: e.target.value } })}
                                  placeholder="0"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1" title="Number of cowbird chicks observed in nest">
                                  Cowbird chicks
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={obs.cowbird_chicks || ''}
                                  onChange={e => setNestObs({ ...nestObs, [nest.breed_id]: { ...obs, cowbird_chicks: e.target.value } })}
                                  placeholder="0"
                                  className="w-full border rounded-lg px-3 py-2 text-sm"
                                />
                              </div>
                            </>
                          )}
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

      {/* Active nests */}
      {nests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Nests</h3>
          <div className="space-y-2">
            {nests.map(nest => (
              <Link key={nest.breed_id} href={`/nests/${nest.nestrec || nest.breed_id}`}
                className="block bg-white rounded-lg border p-3 active:bg-gray-50">
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-sm">Nest #{nest.nestrec || `(ID ${nest.breed_id})`}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    nest.fail_code === '24' ? 'bg-green-100 text-green-700' :
                    nest.fail_code && nest.fail_code !== '24' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {nest.fail_code === '24' ? 'Success' :
                     nest.fail_code ? 'Failed' :
                     nest.stage_find || 'Active'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex gap-3">
                  {nest.eggs != null && <span>Eggs: {nest.eggs}</span>}
                  {nest.hatch != null && <span>Hatched: {nest.hatch}</span>}
                  {nest.fledge != null && <span>Fledged: {nest.fledge}</span>}
                  {nest.indep != null && <span>Indep: {nest.indep}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Nest Protocol Schedule — visual timeline per active nest */}
      {nests.length > 0 && (() => {
        const now = new Date()
        const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
        const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        const fmtDate = (jd) => {
          if (jd < 1) return '?'
          const { month, day } = fromJulianDay(currentYear, jd)
          return `${monthNames[month]} ${day}`
        }

        // Build schedule for each active nest
        const schedules = nests
          .filter(n => !n.fail_code || n.fail_code === '24') // active or successful
          .map(nest => {
            // Determine hatch julian day from best available data
            let hatchJD = nest.date_hatch ? parseInt(nest.date_hatch) : null
            let hatchSource = 'observed'
            if (!hatchJD && nest.dfe && nest.eggs) {
              // Back-calculate: DFE + 13 incubation + (clutch-1) laying = hatch
              hatchJD = parseInt(nest.dfe) + 13 + (parseInt(nest.eggs) - 1)
              hatchSource = 'estimated'
            }

            // If we still have no hatch date, show a minimal card
            if (!hatchJD || isNaN(hatchJD)) {
              return { nest, hatchJD: null, hatchSource: null, chickAge: null, windows: null }
            }

            const chickAge = todayJD - hatchJD + 1 // Day 1 = hatch day

            // Protocol windows (day relative to hatch, Day 1 = hatch)
            const windows = [
              { key: 'band', label: 'Band', startDay: 4, endDay: 7, idealDay: 6,
                bg: 'bg-emerald-100', bgActive: 'bg-emerald-200', bgIdeal: 'bg-emerald-400',
                textDone: 'text-emerald-700', borderDone: 'border-emerald-300',
                completed: nest.band != null && nest.band !== '' },
              { key: 'danger', label: 'DANGER — do not approach', startDay: 9, endDay: 11, idealDay: null,
                bg: 'bg-red-100', bgActive: 'bg-red-300', bgIdeal: 'bg-red-400',
                textDone: '', borderDone: '',
                isDanger: true, completed: false },
              { key: 'fledge', label: 'Fledge check', startDay: 12, endDay: 14, idealDay: null,
                bg: 'bg-blue-100', bgActive: 'bg-blue-200', bgIdeal: 'bg-blue-400',
                textDone: 'text-blue-700', borderDone: 'border-blue-300',
                completed: nest.fledge != null && nest.fledge !== '' },
              { key: 'indep', label: 'Independence', startDay: 22, endDay: 26, idealDay: 24,
                bg: 'bg-purple-100', bgActive: 'bg-purple-200', bgIdeal: 'bg-purple-400',
                textDone: 'text-purple-700', borderDone: 'border-purple-300',
                completed: nest.indep != null && nest.indep !== '' },
            ]

            return { nest, hatchJD, hatchSource, chickAge, windows }
          })
          .filter(Boolean)

        if (schedules.length === 0) return null

        return (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Nest Schedule</h3>
            <div className="space-y-3">
              {schedules.map(({ nest, hatchJD, hatchSource, chickAge, windows }) => {
                // No hatch data — show minimal card
                if (!hatchJD) {
                  return (
                    <div key={nest.breed_id} className="bg-white rounded-lg border p-3">
                      <div className="flex justify-between items-start mb-1">
                        <Link href={`/nests/${nest.nestrec || nest.breed_id}`}
                          className="font-semibold text-sm text-blue-700 underline">
                          Nest #{nest.nestrec || `(${nest.breed_id})`}
                        </Link>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Awaiting data</span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-1 mt-1">
                        {nest.eggs != null ? (
                          <p>{nest.eggs} egg{nest.eggs !== 1 ? 's' : ''} recorded — need hatch date or DFE to show protocol timeline</p>
                        ) : (
                          <p>No eggs recorded yet — record egg count on nest card to start tracking</p>
                        )}
                        <div className="flex gap-1.5 mt-1.5 text-[10px] text-gray-400">
                          <span className="bg-emerald-100 px-1.5 py-0.5 rounded">Band Day 4–7</span>
                          <span className="bg-red-100 px-1.5 py-0.5 rounded">Danger 9–11</span>
                          <span className="bg-blue-100 px-1.5 py-0.5 rounded">Fledge 12–14</span>
                          <span className="bg-purple-100 px-1.5 py-0.5 rounded">Indep 22–26</span>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Total days to display (up to Day 28 or today+3, whichever is larger)
                const maxDay = Math.max(28, chickAge + 3)
                const displayDays = Math.min(maxDay, 30) // cap at 30

                return (
                  <div key={nest.breed_id} className="bg-white rounded-lg border p-3">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-1">
                      <Link href={`/nests/${nest.nestrec || nest.breed_id}`}
                        className="font-semibold text-sm text-blue-700 underline">
                        Nest #{nest.nestrec || `(${nest.breed_id})`}
                      </Link>
                      <div className="text-right">
                        {chickAge > 0 ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            chickAge >= 9 && chickAge <= 11 ? 'bg-red-100 text-red-700' :
                            chickAge >= 4 && chickAge <= 7 ? 'bg-emerald-100 text-emerald-700' :
                            chickAge >= 12 && chickAge <= 14 ? 'bg-blue-100 text-blue-700' :
                            chickAge >= 22 && chickAge <= 26 ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>Day {chickAge}</span>
                        ) : chickAge <= 0 ? (
                          <span className="text-xs text-gray-400">Hatch in {1 - chickAge}d</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 mb-2">
                      Hatch: {fmtDate(hatchJD)}{hatchSource === 'estimated' ? ' (est.)' : ''}
                    </div>

                    {/* Visual day strip */}
                    <div className="flex gap-px mb-2 overflow-x-auto">
                      {Array.from({ length: displayDays }, (_, i) => {
                        const day = i + 1
                        const isToday = day === chickAge

                        // Determine which window this day falls in
                        let cellBg = 'bg-gray-50'
                        let cellBorder = ''
                        for (const w of windows) {
                          if (day >= w.startDay && day <= w.endDay) {
                            if (w.completed) {
                              cellBg = 'bg-gray-200' // completed = muted
                            } else if (w.isDanger) {
                              cellBg = day === chickAge ? 'bg-red-400' : 'bg-red-200'
                            } else if (w.idealDay && day === w.idealDay) {
                              cellBg = w.bgIdeal
                            } else if (day === chickAge) {
                              cellBg = w.bgActive
                            } else {
                              cellBg = w.bg
                            }
                            break
                          }
                        }

                        if (isToday) {
                          cellBorder = 'ring-2 ring-gray-800 ring-offset-1'
                        }

                        return (
                          <div key={day}
                            className={`w-[10px] h-[18px] rounded-sm ${cellBg} ${cellBorder} flex-shrink-0`}
                            title={`Day ${day} — ${fmtDate(hatchJD + day - 1)}`}
                          />
                        )
                      })}
                    </div>

                    {/* Date range labels under the strip */}
                    <div className="flex justify-between text-[9px] text-gray-400 mb-2 px-0.5">
                      <span>{fmtDate(hatchJD)}</span>
                      <span>{fmtDate(hatchJD + displayDays - 1)}</span>
                    </div>

                    {/* Protocol checklist */}
                    <div className="space-y-1.5">
                      {windows.map(w => {
                        const startJD = hatchJD + w.startDay - 1
                        const endJD = hatchJD + w.endDay - 1
                        const isActive = chickAge >= w.startDay && chickAge <= w.endDay
                        const isPast = chickAge > w.endDay
                        const isOverdue = isPast && !w.completed && !w.isDanger

                        return (
                          <div key={w.key} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${
                            w.completed ? 'bg-gray-50' :
                            w.isDanger && isActive ? 'bg-red-50 border border-red-200' :
                            isActive ? 'bg-yellow-50 border border-yellow-200' :
                            isOverdue ? 'bg-orange-50 border border-orange-200' :
                            'bg-white'
                          }`}>
                            {/* Status icon */}
                            <span className="mt-0.5 flex-shrink-0">
                              {w.completed ? '✅' :
                               w.isDanger && isActive ? '🚫' :
                               w.isDanger ? '⚠️' :
                               isOverdue ? '⏰' :
                               isActive ? '👉' :
                               '○'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium ${
                                w.completed ? 'text-gray-400 line-through' :
                                w.isDanger && isActive ? 'text-red-700 font-bold' :
                                isOverdue ? 'text-orange-700' :
                                isActive ? 'text-yellow-800' :
                                'text-gray-600'
                              }`}>
                                {w.label}
                                {w.idealDay && !w.isDanger ? ` (target Day ${w.idealDay})` : ''}
                                {w.completed && w.key === 'band' && nest.band != null ? ` — ${nest.band} banded` : ''}
                                {w.completed && w.key === 'fledge' && nest.fledge != null ? ` — ${nest.fledge} fledged` : ''}
                                {w.completed && w.key === 'indep' && nest.indep != null ? ` — ${nest.indep} indep` : ''}
                              </div>
                              <div className="text-gray-400">
                                Day {w.startDay}–{w.endDay} · {fmtDate(startJD)} – {fmtDate(endJD)}
                                {isOverdue && <span className="text-orange-600 font-semibold ml-1">OVERDUE</span>}
                                {w.isDanger && isActive && <span className="text-red-600 font-semibold ml-1">NOW — STAY AWAY</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Visit history */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Visit Log ({visits.length})
        </h3>
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-lg border p-4">No visits logged yet.</p>
        ) : (
          <div className="space-y-2">
            {visits.map(v => (
              <div key={v.visit_id} className="bg-white rounded-lg border p-3">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-gray-500">{v.observer}</span>
                  <span className="text-xs text-gray-400">{v.visit_date}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs">
                  <span className={v.male_seen ? 'text-blue-600' : 'text-gray-300'}>
                    ♂ {v.male_seen ? '✓' : '✗'}
                  </span>
                  <span className={v.female_seen ? 'text-pink-600' : 'text-gray-300'}>
                    ♀ {v.female_seen ? '✓' : '✗'}
                  </span>
                  {v.minutes_spent && <span className="text-gray-400">{v.minutes_spent} min</span>}
                  {v.nest_status_flag === 'new_nest_found' && (
                    <span className="text-green-600">New nest</span>
                  )}
                </div>
                {v.other_birds_notes && (
                  <p className="text-xs text-gray-400 mt-1">Other: {v.other_birds_notes}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">{v.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
