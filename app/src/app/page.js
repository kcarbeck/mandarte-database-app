'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { localDateString, toJulianDay, fromJulianDay } from '@/lib/helpers'
import {
  PROTOCOL_WINDOWS, RENEST_WINDOW, VISIT_RULES, TERRITORY_STATUS, MONTH_NAMES,
  getNestEvent, EVENT_PRIORITY, formatJD, jdToDateStr, dateStrToJD,
  classifyTerritory,
} from '@/lib/protocol'

// ─── Layout constants ────────────────────────────────────────
const COL_W = 28
const LABEL_W = 80
const CELL_H = 38
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function Home() {
  const [territories, setTerritories] = useState([])
  const [nestsByTerritory, setNestsByTerritory] = useState({})
  const [visitDates, setVisitDates] = useState({}) // { territory: Set<dateStr> }
  const [plannedActions, setPlannedActions] = useState([])
  const [manualTasks, setManualTasks] = useState([])
  const [birdsByTerritory, setBirdsByTerritory] = useState({}) // { territory: [{ band_id, color_combo, sex }] }
  const [stats, setStats] = useState({ territories: 0, nests: 0, birds: 0, visitsToday: 0 })
  const [loading, setLoading] = useState(true)
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', priority: 'normal', territory: '', notes: '' })

  const currentYear = new Date().getFullYear()
  const now = new Date()
  const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const todayStr = localDateString()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      // ── Territories ───────────────────────────────────
      const { data: assigns } = await supabase
        .from('territory_assignments')
        .select('territory, band_id, sex')
        .eq('year', currentYear)
        .is('end_date', null)
        .neq('role', 'floater')

      const terrSet = new Set((assigns || []).map(a => a.territory))
      const terrList = [...terrSet].sort((a, b) => {
        const na = parseInt(a), nb = parseInt(b)
        if (!isNaN(na) && !isNaN(nb)) return na - nb
        if (!isNaN(na)) return -1
        if (!isNaN(nb)) return 1
        return a.localeCompare(b)
      })
      const uniqueBirds = assigns ? [...new Set(assigns.map(b => b.band_id))].length : 0

      // ── Nests ─────────────────────────────────────────
      const { data: nests } = await supabase
        .from('breed')
        .select('breed_id, nestrec, territory, year, brood, eggs, hatch, band, fledge, indep, date_hatch, dfe, fail_code, stage_find, male_attempt, female_attempt')
        .eq('year', currentYear)

      const nestMap = {}
      const nestCount = nests ? nests.length : 0
      if (nests) {
        for (const n of nests) {
          if (!n.territory) continue
          if (!nestMap[n.territory]) nestMap[n.territory] = []
          let hatchJD = n.date_hatch ? parseInt(n.date_hatch) : null
          if ((!hatchJD || isNaN(hatchJD)) && n.dfe && n.eggs) {
            hatchJD = parseInt(n.dfe) + VISIT_RULES.INCUBATION_DAYS + (parseInt(n.eggs) - 1)
          }
          if (hatchJD && isNaN(hatchJD)) hatchJD = null
          // Derive DFE for pre-hatch schedule display
          let dfeJD = n.dfe ? parseInt(n.dfe) : null
          if ((!dfeJD || isNaN(dfeJD)) && hatchJD && n.eggs) {
            const cs = parseInt(n.eggs)
            if (cs >= 1) dfeJD = hatchJD - VISIT_RULES.INCUBATION_DAYS - (cs - 1)
          }
          if (dfeJD && isNaN(dfeJD)) dfeJD = null
          const layingEndJD = dfeJD && n.eggs ? dfeJD + (parseInt(n.eggs) - 1) : null
          nestMap[n.territory].push({ ...n, hatchJD, dfeJD, layingEndJD })
        }
      }
      for (const t of Object.keys(nestMap)) {
        nestMap[t].sort((a, b) => {
          const aActive = !a.fail_code || a.fail_code === '24' ? 0 : 1
          const bActive = !b.fail_code || b.fail_code === '24' ? 0 : 1
          if (aActive !== bActive) return aActive - bActive
          return (a.hatchJD || 9999) - (b.hatchJD || 9999)
        })
      }

      // ── Visits (territory + nest visits merged) ──────
      const { data: allVisits } = await supabase
        .from('territory_visits')
        .select('territory, visit_date')
        .eq('year', currentYear)

      const vMap = {}
      let todayVisits = 0
      if (allVisits) {
        for (const v of allVisits) {
          if (!vMap[v.territory]) vMap[v.territory] = new Set()
          vMap[v.territory].add(v.visit_date)
          if (v.visit_date === todayStr) todayVisits++
        }
      }

      // Merge nest visit dates into territory visit dates
      // A nest visit IS a territory visit — the student was there
      const breedIds = nests ? nests.map(n => n.breed_id) : []
      const breedTerrMap = {}
      if (nests) nests.forEach(n => { if (n.territory) breedTerrMap[n.breed_id] = n.territory })
      if (breedIds.length > 0) {
        const { data: nestVisitData } = await supabase.from('nest_visits')
          .select('visit_date, breed_id')
          .in('breed_id', breedIds)
        if (nestVisitData) {
          for (const nv of nestVisitData) {
            const terr = breedTerrMap[nv.breed_id]
            if (terr) {
              if (!vMap[terr]) vMap[terr] = new Set()
              if (!vMap[terr].has(nv.visit_date)) {
                vMap[terr].add(nv.visit_date)
                if (nv.visit_date === todayStr) todayVisits++
              }
            }
          }
        }
      }

      // ── Bird assignments for territory display ────────
      const birdTerr = {}
      if (assigns) {
        const bandIds = [...new Set(assigns.map(a => a.band_id))]
        let birdLookup = {}
        if (bandIds.length > 0) {
          const { data: birds } = await supabase.from('birds')
            .select('band_id, color_combo, sex, is_unbanded')
            .in('band_id', bandIds)
          if (birds) birds.forEach(b => { birdLookup[b.band_id] = b })
        }
        for (const a of assigns) {
          if (!birdTerr[a.territory]) birdTerr[a.territory] = []
          const bird = birdLookup[a.band_id]
          birdTerr[a.territory].push({
            band_id: a.band_id,
            color_combo: bird?.color_combo || '',
            sex: bird?.sex,
            is_unbanded: bird?.is_unbanded,
          })
        }
      }

      // ── Planned actions ───────────────────────────────
      const { data: planned, error: plannedErr } = await supabase
        .from('planned_actions')
        .select('*')
        .eq('year', currentYear)
        .eq('completed', false)

      // ── Manual tasks ──────────────────────────────────
      const { data: tasks } = await supabase
        .from('field_tasks')
        .select('*')
        .eq('year', currentYear)
        .order('completed', { ascending: true })
        .order('created_at', { ascending: false })

      setTerritories(terrList)
      setNestsByTerritory(nestMap)
      setVisitDates(vMap)
      setBirdsByTerritory(birdTerr)
      setPlannedActions(plannedErr ? [] : (planned || []))
      setManualTasks(tasks || [])
      setStats({ territories: terrList.length, nests: nestCount, birds: uniqueBirds, visitsToday: todayVisits })
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  // ─── Computed: date columns ──────────────────────────────
  const dateColumns = useMemo(() => {
    const cols = []
    const startJD = todayJD - 5
    const endJD = todayJD + 30
    for (let jd = startJD; jd <= endJD; jd++) {
      const { month, day } = fromJulianDay(currentYear, jd)
      const d = new Date(Date.UTC(currentYear, month - 1, day))
      cols.push({ jd, month, day, dayOfWeek: d.getUTCDay(), isToday: jd === todayJD, dateStr: jdToDateStr(currentYear, jd), monthLabel: MONTH_NAMES[month] })
    }
    return cols
  }, [todayJD, currentYear])

  // ─── Computed: territory status (visit frequency per protocol) ──
  const territoryStatuses = useMemo(() => {
    const statuses = {}
    for (const territory of territories) {
      const tNests = nestsByTerritory[territory] || []
      const tBirds = birdsByTerritory[territory] || []
      const hasFemale = tBirds.some(b => b.sex === 1)
      const hasMale = tBirds.some(b => b.sex === 2)
      statuses[territory] = classifyTerritory({
        hasFemale, hasMale, nests: tNests, todayJD, year: currentYear,
      })
    }
    return statuses
  }, [territories, nestsByTerritory, birdsByTerritory, todayJD, currentYear])

  // ─── Computed: cell data for each territory × date ───────
  const cellData = useMemo(() => {
    const data = {}
    for (const territory of territories) {
      const tNests = nestsByTerritory[territory] || []
      const tVisits = visitDates[territory] || new Set()
      const tPlanned = plannedActions.filter(p => p.territory === territory)
      const visitDatesSorted = [...tVisits].sort()
      const latestNestHatchJD = Math.max(...tNests.filter(n => n.hatchJD).map(n => n.hatchJD), 0)
      const terrStatus = territoryStatuses[territory]
      const visitInterval = terrStatus?.visitInterval ?? VISIT_RULES.OVERDUE_DAYS

      for (const col of dateColumns) {
        const key = `${territory}:${col.dateStr}`
        const visited = tVisits.has(col.dateStr)
        const isPlanned = tPlanned.some(p => p.planned_date === col.dateStr)
        const plannedInfo = tPlanned.find(p => p.planned_date === col.dateStr)

        let daysSinceVisit = null
        for (let i = visitDatesSorted.length - 1; i >= 0; i--) {
          const vJD = dateStrToJD(visitDatesSorted[i])
          if (vJD <= col.jd) { daysSinceVisit = col.jd - vJD; break }
        }

        const events = []
        let preHatchStage = null // Track if any nest is in pre-hatch on this date
        for (const nest of tNests) {
          // Include failed nests for renest window checking (don't skip them)
          const isFailed = nest.fail_code && nest.fail_code !== '24'

          if (nest.hatchJD) {
            const chickDay = col.jd - nest.hatchJD + 1
            if (chickDay >= 1) {
              // For failed nests, only show renest window (getNestEvent handles this)
              // For active/success nests, show all protocol windows
              if (!isFailed || chickDay >= RENEST_WINDOW.startDay) {
                const event = getNestEvent(chickDay, nest)
                if (event) {
                  if (event.key === 'renest' && nest.hatchJD < latestNestHatchJD) continue
                  events.push({ ...event, nestLabel: nest.nestrec ? `#${nest.nestrec}` : `${nest.breed_id}`, breedId: nest.breed_id })
                }
              }
            } else if (!isFailed && chickDay < 1 && chickDay >= -30) {
              // Pre-hatch: show incubating/laying period on grid (active nests only)
              if (nest.layingEndJD && col.jd <= nest.layingEndJD) {
                preHatchStage = 'laying'
              } else {
                preHatchStage = 'incubating'
              }
            }
          } else if (!isFailed && nest.dfeJD && !nest.hatchJD) {
            // No hatch date but has DFE — show laying/incubating (active nests only)
            if (col.jd >= nest.dfeJD && col.jd <= nest.dfeJD + 30) {
              if (nest.layingEndJD && col.jd <= nest.layingEndJD) {
                preHatchStage = 'laying'
              } else {
                preHatchStage = 'incubating'
              }
            }
          }
        }
        events.sort((a, b) => (EVENT_PRIORITY[a.key] ?? 99) - (EVENT_PRIORITY[b.key] ?? 99))
        // Use territory-specific visit interval instead of flat OVERDUE_DAYS
        const needsVisit = !visited && daysSinceVisit !== null && daysSinceVisit >= visitInterval && col.jd >= todayJD
        data[key] = { events, visited, isPlanned, plannedInfo, needsVisit, daysSinceVisit, preHatchStage }
      }
    }
    return data
  }, [territories, nestsByTerritory, visitDates, plannedActions, dateColumns, todayJD, territoryStatuses])

  // ─── Computed: today + upcoming tasks ────────────────────
  const { todayTasks, upcomingTasks } = useMemo(() => {
    const today = []
    const upcoming = []
    const upcomingEndJD = todayJD + 5

    for (const territory of territories) {
      const tNests = nestsByTerritory[territory] || []
      const tVisits = visitDates[territory] || new Set()
      const visitDatesSorted = [...tVisits].sort()
      const lastVisitJD = visitDatesSorted.length > 0 ? dateStrToJD(visitDatesSorted[visitDatesSorted.length - 1]) : null
      const daysSinceVisit = lastVisitJD != null ? todayJD - lastVisitJD : null
      const terrStatus = territoryStatuses[territory]
      const visitInterval = terrStatus?.visitInterval ?? VISIT_RULES.OVERDUE_DAYS

      // Active pre-hatch nests: schedule check visits every NEST_CHECK_DAYS
      // Enhanced: shows estimated hatch date and current stage
      const activePreHatchNests = tNests.filter(n =>
        !n.hatchJD && (!n.fail_code || n.fail_code === '24') && n.stage_find !== 'NFN'
      )
      if (activePreHatchNests.length > 0 && (daysSinceVisit === null || daysSinceVisit >= VISIT_RULES.NEST_CHECK_DAYS)) {
        const nestLabels = activePreHatchNests.map(n => n.nestrec ? `#${n.nestrec}` : `(${n.breed_id})`).join(', ')
        // Derive stage hint with estimated hatch date when possible
        let stageHint = 'check nest progress'
        const incubatingNest = activePreHatchNests.find(n => n.eggs > 0 || n.stage_find === 'IC')
        if (incubatingNest) {
          // Try to estimate hatch date from DFE
          if (incubatingNest.dfe && incubatingNest.eggs) {
            const estHatchJD = parseInt(incubatingNest.dfe) + VISIT_RULES.INCUBATION_DAYS + (parseInt(incubatingNest.eggs) - 1)
            if (!isNaN(estHatchJD)) {
              const daysUntilHatch = estHatchJD - todayJD
              if (daysUntilHatch > 0) {
                stageHint = `incubating — est. hatch ${formatJD(currentYear, estHatchJD)} (${daysUntilHatch}d)`
              } else if (daysUntilHatch <= 0) {
                stageHint = `check for hatch (est. ${formatJD(currentYear, estHatchJD)})`
              }
            } else {
              stageHint = 'check for hatch'
            }
          } else {
            stageHint = 'check for hatch'
          }
        }
        today.push({
          id: `nestcheck-${territory}`, type: 'nestcheck',
          label: `Nest ${nestLabels}: ${stageHint}`,
          territory, nestLabel: null,
          nestLink: activePreHatchNests.length === 1
            ? `/nests/${activePreHatchNests[0].nestrec || activePreHatchNests[0].breed_id}`
            : `/territories/${encodeURIComponent(territory)}`,
          dateLabel: daysSinceVisit != null ? `${daysSinceVisit}d since visit` : 'Never visited',
          jd: todayJD, chickDay: null,
          color: '#fde68a', idealColor: '#d97706',
        })
      }

      // Post-hatch protocol events (band/fledge/indep/renest windows)
      // Include failed nests for renest window checking
      // Track whether a renest task was already generated from the nest loop
      // to prevent duplication with the classifyTerritory block below
      let hasNestLoopRenest = false
      for (const nest of tNests) {
        if (!nest.hatchJD) continue
        const isFailed = nest.fail_code && nest.fail_code !== '24'

        for (let jd = todayJD; jd <= upcomingEndJD; jd++) {
          const chickDay = jd - nest.hatchJD + 1
          if (chickDay < 1) continue
          // For failed nests, only generate renest tasks (not band/fledge/indep)
          if (isFailed && chickDay < RENEST_WINDOW.startDay) continue
          const event = getNestEvent(chickDay, nest)
          if (!event || event.completed) continue
          if (event.isDanger) continue

          // Track renest tasks from this loop to prevent duplication
          if (event.key === 'renest' && jd === todayJD) hasNestLoopRenest = true

          const nestLabel = nest.nestrec ? `Nest #${nest.nestrec}` : `Nest (${nest.breed_id})`
          const task = {
            id: `${event.key}-${nest.breed_id}-${jd}`,
            type: event.key,
            label: event.fullLabel || event.label,
            territory,
            nestLabel,
            nestLink: `/nests/${nest.nestrec || nest.breed_id}`,
            dateLabel: formatJD(currentYear, jd),
            jd, chickDay,
            isIdeal: event.idealDay === chickDay,
            color: event.colorHex,
            idealColor: event.idealColorHex,
          }
          if (jd === todayJD) today.push(task)
          else upcoming.push(task)
        }
      }

      // Renest watch from classifyTerritory (for failed nests without hatch dates,
      // or when nest-loop renest didn't fire). Skip if nest loop already generated one.
      const isRenestStatus = terrStatus?.status === TERRITORY_STATUS.RENEST_WATCH
        || terrStatus?.status === TERRITORY_STATUS.RENEST_URGENT
      if (isRenestStatus && !hasNestLoopRenest) {
        const isUrgent = terrStatus.status === TERRITORY_STATUS.RENEST_URGENT
        if (daysSinceVisit === null || daysSinceVisit >= visitInterval) {
          today.push({
            id: `renest-watch-${territory}`, type: 'renest',
            label: isUrgent
              ? `URGENT: Check for renest (${terrStatus.failedNestInfo?.daysSinceFailure}d since failure)`
              : `Check for renest (${terrStatus.failedNestInfo?.daysSinceFailure ?? '?'}d since failure)`,
            territory, nestLabel: null,
            nestLink: `/territories/${encodeURIComponent(territory)}`,
            dateLabel: daysSinceVisit != null ? `${daysSinceVisit}d since visit` : 'Never visited',
            jd: todayJD, chickDay: null,
            color: isUrgent ? '#fca5a5' : RENEST_WINDOW.colorHex,
            idealColor: isUrgent ? '#dc2626' : RENEST_WINDOW.idealColorHex,
          })
        }
      }

      // Determine if this territory already has a task that implies visiting
      // (nestcheck, renest, or protocol event) — skip generic visit to avoid duplication
      const hasRenestTask = isRenestStatus || hasNestLoopRenest
      const hasNestcheckTask = activePreHatchNests.length > 0
        && (daysSinceVisit === null || daysSinceVisit >= VISIT_RULES.NEST_CHECK_DAYS)
      const hasAnyVisitTask = hasRenestTask || hasNestcheckTask

      // Territory visit overdue (using territory-specific interval)
      if (!hasAnyVisitTask && daysSinceVisit != null && daysSinceVisit >= visitInterval) {
        const statusHint = terrStatus?.status === TERRITORY_STATUS.SINGLE_MALE
          ? ' (single ♂)' : ''
        today.push({
          id: `visit-${territory}`, type: 'visit',
          label: `Visit territory${statusHint} (${daysSinceVisit}d since last)`,
          territory, nestLabel: null,
          nestLink: `/territories/${encodeURIComponent(territory)}`,
          dateLabel: 'Today', jd: todayJD, chickDay: null,
          color: '#fef9c3', idealColor: '#ca8a04',
        })
      } else if (!hasAnyVisitTask && daysSinceVisit === null) {
        // Territory has never been visited this season — flag it
        today.push({
          id: `visit-${territory}`, type: 'visit',
          label: 'Visit territory (never visited)',
          territory, nestLabel: null,
          nestLink: `/territories/${encodeURIComponent(territory)}`,
          dateLabel: 'Today', jd: todayJD, chickDay: null,
          color: '#fef9c3', idealColor: '#ca8a04',
        })
      }
    }

    // Planned actions for today/upcoming
    for (const pa of plannedActions) {
      const paJD = dateStrToJD(pa.planned_date)
      if (paJD >= todayJD && paJD <= upcomingEndJD) {
        const task = {
          id: `planned-${pa.action_id}`, type: 'planned',
          label: pa.notes || `Planned ${pa.action_type}`,
          territory: pa.territory, nestLabel: null,
          nestLink: `/territories/${encodeURIComponent(pa.territory)}`,
          dateLabel: formatJD(currentYear, paJD), jd: paJD,
          color: '#bfdbfe', idealColor: '#2563eb',
        }
        if (paJD === todayJD) today.push(task)
        else upcoming.push(task)
      }
    }

    const sortKey = (t) => (EVENT_PRIORITY[t.type] ?? 99)
    today.sort((a, b) => sortKey(a) - sortKey(b))
    upcoming.sort((a, b) => a.jd - b.jd || sortKey(a) - sortKey(b))
    return { todayTasks: today, upcomingTasks: upcoming }
  }, [territories, nestsByTerritory, visitDates, plannedActions, todayJD, currentYear, territoryStatuses])

  // ─── Handlers ────────────────────────────────────────────
  async function togglePlanned(territory, dateStr) {
    const existing = plannedActions.find(p => p.territory === territory && p.planned_date === dateStr)
    if (existing) {
      const { error } = await supabase.from('planned_actions').delete().eq('action_id', existing.action_id)
      if (!error) setPlannedActions(prev => prev.filter(p => p.action_id !== existing.action_id))
    } else {
      const { data, error } = await supabase.from('planned_actions').insert({
        year: currentYear, territory, planned_date: dateStr, action_type: 'visit',
      }).select()
      if (!error && data) setPlannedActions(prev => [...prev, ...data])
    }
  }

  async function handleAddTask(e) {
    e.preventDefault()
    if (!newTask.title.trim()) { alert('Task title is required.'); return }
    const { error } = await supabase.from('field_tasks').insert({
      year: currentYear, title: newTask.title.trim(), priority: newTask.priority,
      territory: newTask.territory || null, notes: newTask.notes || null,
    })
    if (error) { alert('Error: ' + error.message); return }
    setNewTask({ title: '', priority: 'normal', territory: '', notes: '' })
    setShowAddTask(false)
    loadAll()
  }

  async function toggleTask(taskId, completed) {
    const { error } = await supabase.from('field_tasks').update({
      completed: !completed, completed_at: !completed ? new Date().toISOString() : null,
    }).eq('task_id', taskId)
    if (!error) setManualTasks(prev => prev.map(t => t.task_id === taskId ? { ...t, completed: !completed } : t))
  }

  async function deleteTask(taskId) {
    const { error } = await supabase.from('field_tasks').delete().eq('task_id', taskId)
    if (!error) setManualTasks(prev => prev.filter(t => t.task_id !== taskId))
  }

  // ─── Month groups for header ─────────────────────────────
  const monthGroups = useMemo(() => {
    const groups = []
    let cur = null
    for (const dc of dateColumns) {
      if (dc.month !== cur) { cur = dc.month; groups.push({ label: dc.monthLabel, count: 0 }) }
      groups[groups.length - 1].count++
    }
    return groups
  }, [dateColumns])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-forest-300 border-t-forest-600 rounded-full animate-spin" />
    </div>
  )

  const incompleteTasks = manualTasks.filter(t => !t.completed)
  const completedTasks = manualTasks.filter(t => t.completed)

  return (
    <div className="space-y-5">
      {/* ── Quick stats ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: stats.territories, label: 'Territories', accent: 'text-forest-600', bg: 'bg-forest-50' },
          { n: stats.birds, label: 'Birds', accent: 'text-sage-600', bg: 'bg-sage-50' },
          { n: stats.nests, label: 'Nests', accent: 'text-rust-500', bg: 'bg-rust-50' },
          { n: stats.visitsToday, label: 'Today', accent: 'text-bark-600', bg: 'bg-bark-50' },
        ].map(s => (
          <div key={s.label} className={`card p-2.5 text-center`}>
            <div className={`text-xl font-bold font-display ${s.accent}`}>{s.n}</div>
            <div className="text-2xs text-bark-500 uppercase tracking-wider font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/territories" className="btn-secondary btn-md text-center">View Territories</Link>
        <Link href="/nests/new" className="btn-accent btn-md text-center">+ New Nest</Link>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SCHEDULE LEDGER                                    */}
      {/* ═══════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title">Schedule</h2>
        </div>

        {/* Legend bar */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-2xs text-bark-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#e8d5b8' }} />Laying</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#d4c9a0' }} />Incubating</span>
          {PROTOCOL_WINDOWS.map(w => (
            <span key={w.key} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: w.colorHex }} />
              {w.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: RENEST_WINDOW.colorHex }} />
            Renest
          </span>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: LABEL_W + dateColumns.length * COL_W }}>

              {/* Month header */}
              <div className="flex border-b border-cream-300" style={{ background: '#f5efe5' }}>
                <div className="flex-shrink-0 border-r border-cream-300" style={{ width: LABEL_W, position: 'sticky', left: 0, zIndex: 3, background: '#f5efe5' }} />
                {monthGroups.map((mg, i) => (
                  <div key={i} className="text-center text-2xs font-bold text-bark-600 border-r border-cream-200 py-1" style={{ width: mg.count * COL_W }}>{mg.label}</div>
                ))}
              </div>

              {/* Date header */}
              <div className="flex border-b border-cream-300" style={{ background: '#f5efe5' }}>
                <div className="flex-shrink-0 border-r border-cream-300" style={{ width: LABEL_W, position: 'sticky', left: 0, zIndex: 3, background: '#f5efe5' }}>
                  <div className="text-2xs text-bark-600 px-1.5 py-1 text-right">Terr</div>
                </div>
                {dateColumns.map((dc, i) => (
                  <div key={i} className={`flex-shrink-0 text-center border-r border-cream-200 py-0.5 ${dc.isToday ? 'bg-rust-100' : dc.dayOfWeek === 0 || dc.dayOfWeek === 6 ? 'bg-cream-200/50' : ''}`} style={{ width: COL_W }}>
                    <div className={`text-[11px] leading-tight ${dc.isToday ? 'font-bold text-rust-700' : 'text-forest-700'}`}>{dc.day}</div>
                    <div className={`text-2xs leading-tight ${dc.isToday ? 'text-rust-500' : 'text-bark-600'}`}>{DAY_LETTERS[dc.dayOfWeek]}</div>
                  </div>
                ))}
              </div>

              {/* Territory rows */}
              {territories.map((territory, rowIdx) => (
                <div key={territory} className={`flex ${rowIdx < territories.length - 1 ? 'border-b border-cream-200' : ''}`}>
                  {/* Sticky territory label */}
                  <Link href={`/territories/${encodeURIComponent(territory)}`}
                    className="flex-shrink-0 border-r border-cream-300 flex items-center active:bg-forest-50 transition-colors"
                    style={{ width: LABEL_W, height: CELL_H, position: 'sticky', left: 0, zIndex: 1, background: '#fff' }}>
                    <div className="px-1.5 w-full overflow-hidden">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-forest-800">T{territory}</span>
                        {(nestsByTerritory[territory] || []).filter(n => !n.fail_code || n.fail_code === '24').length > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sage-400 flex-shrink-0" title={`${(nestsByTerritory[territory] || []).filter(n => !n.fail_code || n.fail_code === '24').length} nest(s)`} />
                        )}
                      </div>
                      {(birdsByTerritory[territory] || []).length > 0 && (
                        <div className="text-2xs text-bark-600 leading-tight truncate font-mono">
                          {(birdsByTerritory[territory] || []).map((b, bi) => {
                            const sexIcon = b.sex === 2 ? '♂' : b.sex === 1 ? '♀' : ''
                            const combo = b.color_combo || (b.is_unbanded ? 'UB' : '?')
                            return <span key={bi}>{bi > 0 ? ' ' : ''}<span className={b.sex === 2 ? 'text-blue-600' : b.sex === 1 ? 'text-pink-600' : ''}>{sexIcon}</span>{combo}</span>
                          })}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Date cells */}
                  {dateColumns.map((dc, ci) => {
                    const key = `${territory}:${dc.dateStr}`
                    const cell = cellData[key] || { events: [], visited: false, isPlanned: false, needsVisit: false, preHatchStage: null }
                    const topEvent = cell.events[0]

                    let bg = 'transparent'
                    let textContent = ''
                    let textColor = ''

                    if (topEvent && !topEvent.completed) {
                      const isIdeal = topEvent.idealDay && topEvent.chickDay === topEvent.idealDay
                      bg = isIdeal ? topEvent.idealColorHex : topEvent.colorHex
                      if (isIdeal || topEvent.isDanger) {
                        textContent = topEvent.textOnIdeal || ''
                        textColor = '#fff'
                      }
                    } else if (topEvent && topEvent.completed) {
                      bg = '#dce8de'
                      textContent = '✓'
                      textColor = '#2d5e36'
                    } else if (cell.preHatchStage && !topEvent) {
                      bg = cell.preHatchStage === 'laying' ? '#e8d5b8' : '#d4c9a0'
                    } else if (cell.needsVisit) {
                      bg = '#fbe4da'
                    }

                    if ((dc.dayOfWeek === 0 || dc.dayOfWeek === 6) && bg === 'transparent') bg = '#faf7f2'

                    return (
                      <div key={ci}
                        className={`flex-shrink-0 flex items-center justify-center relative cursor-pointer border-r border-cream-100 ${dc.isToday ? 'ring-1 ring-inset ring-rust-400' : ''}`}
                        style={{ width: COL_W, height: CELL_H, background: bg }}
                        title={topEvent ? `T${territory}: ${topEvent.label}${topEvent.chickDay ? ` (Day ${topEvent.chickDay})` : ''}` : `T${territory}: ${dc.dateStr}`}
                        onClick={() => { if (dc.jd >= todayJD) togglePlanned(territory, dc.dateStr) }}>
                        {textContent && <span className="text-[10px] font-bold" style={{ color: textColor }}>{textContent}</span>}
                        {cell.visited && <div className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-forest-700" />}
                        {cell.isPlanned && <div className="absolute top-0 right-0 w-0 h-0" style={{ borderLeft: '5px solid transparent', borderTop: '5px solid #c45d3e' }} />}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend footer */}
          <div className="flex items-center gap-3 px-2.5 py-1.5 border-t border-cream-300 bg-cream-100 text-2xs text-bark-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-forest-700 inline-block" />visited</span>
            <span className="flex items-center gap-1"><span className="inline-block w-0 h-0" style={{ borderLeft: '4px solid transparent', borderTop: '4px solid #c45d3e' }} />planned</span>
            <span className="text-bark-400">Tap future cell to plan</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TO DO TODAY                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="section-title">Today</h2>
          {todayTasks.length > 0 && (
            <span className="badge-rust text-2xs">{todayTasks.length}</span>
          )}
        </div>
        {todayTasks.length === 0 ? (
          <div className="card p-4 text-center">
            <p className="text-sm text-bark-600">Nothing scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {todayTasks.map(task => (
              <Link key={task.id} href={task.nestLink}
                className="card-interactive flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono"
                  style={{ background: task.color, color: task.idealColor }}>T{task.territory}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-forest-800">{task.label}</div>
                  <div className="text-xs text-bark-600">
                    Terr {task.territory}{task.nestLabel && ` · ${task.nestLabel}`}{task.chickDay && ` · Day ${task.chickDay}`}
                  </div>
                </div>
                <svg className="w-4 h-4 text-bark-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* UPCOMING                                           */}
      {/* ═══════════════════════════════════════════════════ */}
      {upcomingTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="section-title">Upcoming</h2>
            <span className="section-subtitle">next 5 days</span>
          </div>
          <div className="space-y-1">
            {upcomingTasks.map(task => (
              <Link key={task.id} href={task.nestLink}
                className="card-interactive flex items-center gap-2.5 p-2.5">
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-2xs font-bold font-mono"
                  style={{ background: task.color, color: task.idealColor }}>T{task.territory}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-forest-700">{task.label}</div>
                  <div className="text-2xs text-bark-600">
                    {task.dateLabel} · Terr {task.territory}{task.nestLabel && ` · ${task.nestLabel}`}{task.chickDay && ` · Day ${task.chickDay}`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* INBOX                                              */}
      {/* ═══════════════════════════════════════════════════ */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Inbox</h2>
            {incompleteTasks.length > 0 && (
              <span className="badge-neutral text-2xs">{incompleteTasks.length}</span>
            )}
          </div>
          <button onClick={() => setShowAddTask(!showAddTask)}
            className="btn-primary btn-sm">+ Add</button>
        </div>

        {showAddTask && (
          <form onSubmit={handleAddTask} className="card p-3 space-y-2 mb-2">
            <input type="text" value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="What needs to be done?"
              className="input" autoFocus />
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                <select value={newTask.priority}
                  onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                  className="input text-xs !py-1.5">
                  <option value="urgent">Urgent</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <input type="text" value={newTask.territory}
                  onChange={e => setNewTask({ ...newTask, territory: e.target.value })}
                  placeholder="Territory"
                  className="input text-xs !py-1.5 w-24" />
              </div>
              <input type="text" value={newTask.notes || ''}
                onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                placeholder="Notes"
                className="input text-xs !py-1.5 flex-1" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary btn-sm">Save</button>
              <button type="button" onClick={() => setShowAddTask(false)} className="btn-ghost btn-sm">Cancel</button>
            </div>
          </form>
        )}

        {incompleteTasks.length === 0 && !showAddTask && (
          <div className="card p-4 text-center">
            <p className="text-sm text-bark-600">No tasks in inbox</p>
          </div>
        )}

        {incompleteTasks.length > 0 && (
          <div className="space-y-1">
            {incompleteTasks.map(task => (
              <div key={task.task_id} className="card flex items-start gap-2.5 p-3">
                <button onClick={() => toggleTask(task.task_id, task.completed)}
                  className="mt-0.5 w-5 h-5 rounded-md border-2 border-bark-300 flex-shrink-0 transition-colors active:bg-forest-100 active:border-forest-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {task.priority === 'urgent' && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                    {task.priority === 'low' && <span className="w-2 h-2 rounded-full bg-bark-300 flex-shrink-0" />}
                    <span className="text-sm text-forest-800">{task.title}</span>
                  </div>
                  {(task.territory || task.notes) && (
                    <div className="text-xs text-bark-600 mt-0.5">
                      {task.territory && <span>Terr {task.territory}</span>}
                      {task.territory && task.notes && ' · '}
                      {task.notes}
                    </div>
                  )}
                </div>
                <button onClick={() => deleteTask(task.task_id)} className="text-bark-500 active:text-red-500 text-xs px-1 transition-colors">✕</button>
              </div>
            ))}
          </div>
        )}

        {completedTasks.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-bark-600 cursor-pointer font-medium">{completedTasks.length} completed</summary>
            <div className="space-y-1 mt-1.5">
              {completedTasks.map(task => (
                <div key={task.task_id} className="flex items-center gap-2.5 bg-cream-100 rounded-card p-3">
                  <button onClick={() => toggleTask(task.task_id, task.completed)}
                    className="w-5 h-5 rounded-md border-2 border-forest-300 bg-forest-100 flex-shrink-0 flex items-center justify-center text-forest-600 text-xs font-bold">✓</button>
                  <span className="text-sm text-bark-500 line-through flex-1">{task.title}</span>
                  <button onClick={() => deleteTask(task.task_id)} className="text-bark-500 active:text-red-500 text-xs px-1 transition-colors">✕</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
