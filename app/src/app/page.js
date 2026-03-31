'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { localDateString, toJulianDay, fromJulianDay } from '@/lib/helpers'

// ─── Protocol constants ──────────────────────────────────────
const PROTOCOL = [
  { key: 'band',   label: 'Band chicks',      startDay: 4,  endDay: 7,  idealDay: 6,  color: '#6ee7b7', idealColor: '#059669', textOnIdeal: 'B' },
  { key: 'danger', label: 'DO NOT APPROACH',   startDay: 9,  endDay: 11, idealDay: null, color: '#fca5a5', idealColor: '#dc2626', isDanger: true, textOnIdeal: '!' },
  { key: 'fledge', label: 'Fledge check',      startDay: 12, endDay: 14, idealDay: null, color: '#93c5fd', idealColor: '#2563eb', textOnIdeal: 'F' },
  { key: 'indep',  label: 'Independence check', startDay: 22, endDay: 26, idealDay: 24, color: '#c4b5fd', idealColor: '#7c3aed', textOnIdeal: 'I' },
]
// Renest check: ~5-14 days after typical independence (Day 24)
const RENEST_START = 29
const RENEST_END = 38
const RENEST_COLOR = '#fed7aa' // orange-200
const RENEST_IDEAL_COLOR = '#f97316' // orange-500

const VISIT_OVERDUE_DAYS = 5
const COL_W = 28
const LABEL_W = 58
const CELL_H = 32

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ─── Helpers ─────────────────────────────────────────────────
function jdToDateStr(year, jd) {
  const { month, day } = fromJulianDay(year, jd)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateStrToJD(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toJulianDay(y, m, d)
}

// Get the highest-priority protocol event for a nest on a given chick-day
function getNestEvent(chickDay, nest) {
  for (const w of PROTOCOL) {
    if (chickDay >= w.startDay && chickDay <= w.endDay) {
      const field = w.key === 'band' ? 'band' : w.key === 'fledge' ? 'fledge' : w.key === 'indep' ? 'indep' : null
      const completed = field && nest[field] != null && nest[field] !== ''
      return { ...w, completed, chickDay }
    }
  }
  // Renest check window (after a completed/failed nest)
  const nestDone = (nest.indep != null && nest.indep !== '') || (nest.fail_code && nest.fail_code !== '24') || nest.fail_code === '24'
  if (nestDone && chickDay >= RENEST_START && chickDay <= RENEST_END) {
    return { key: 'renest', label: 'Check for renesting', color: RENEST_COLOR, idealColor: RENEST_IDEAL_COLOR, idealDay: null, textOnIdeal: 'R', completed: false, chickDay }
  }
  return null
}

// Event priority (lower = more important)
const EVENT_PRIORITY = { danger: 0, band: 1, fledge: 2, indep: 3, renest: 4 }

export default function Home() {
  const [territories, setTerritories] = useState([])
  const [nestsByTerritory, setNestsByTerritory] = useState({})
  const [visitDates, setVisitDates] = useState({}) // { territory: Set<dateStr> }
  const [plannedActions, setPlannedActions] = useState([])
  const [manualTasks, setManualTasks] = useState([])
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
            hatchJD = parseInt(n.dfe) + 13 + (parseInt(n.eggs) - 1)
          }
          if (hatchJD && isNaN(hatchJD)) hatchJD = null
          nestMap[n.territory].push({ ...n, hatchJD })
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

      // ── Visits ────────────────────────────────────────
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

  // ─── Computed: cell data for each territory × date ───────
  const cellData = useMemo(() => {
    const data = {}
    for (const territory of territories) {
      const tNests = nestsByTerritory[territory] || []
      const tVisits = visitDates[territory] || new Set()
      const tPlanned = plannedActions.filter(p => p.territory === territory)
      const visitDatesSorted = [...tVisits].sort()
      const latestNestHatchJD = Math.max(...tNests.filter(n => n.hatchJD).map(n => n.hatchJD), 0)

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
        for (const nest of tNests) {
          if (!nest.hatchJD) continue
          const chickDay = col.jd - nest.hatchJD + 1
          if (chickDay < 1) continue
          const event = getNestEvent(chickDay, nest)
          if (event) {
            if (event.key === 'renest' && nest.hatchJD < latestNestHatchJD) continue
            events.push({ ...event, nestLabel: nest.nestrec ? `#${nest.nestrec}` : `${nest.breed_id}`, breedId: nest.breed_id })
          }
        }
        events.sort((a, b) => (EVENT_PRIORITY[a.key] ?? 99) - (EVENT_PRIORITY[b.key] ?? 99))
        const needsVisit = !visited && daysSinceVisit !== null && daysSinceVisit >= VISIT_OVERDUE_DAYS && col.jd >= todayJD
        data[key] = { events, visited, isPlanned, plannedInfo, needsVisit, daysSinceVisit }
      }
    }
    return data
  }, [territories, nestsByTerritory, visitDates, plannedActions, dateColumns, todayJD])

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

      for (const nest of tNests) {
        if (!nest.hatchJD) continue
        if (nest.fail_code && nest.fail_code !== '24') continue

        for (let jd = todayJD; jd <= upcomingEndJD; jd++) {
          const chickDay = jd - nest.hatchJD + 1
          if (chickDay < 1) continue
          const event = getNestEvent(chickDay, nest)
          if (!event || event.completed) continue
          if (event.isDanger) continue

          const nestLabel = nest.nestrec ? `Nest #${nest.nestrec}` : `Nest (${nest.breed_id})`
          const { month, day } = fromJulianDay(currentYear, jd)
          const task = {
            id: `${event.key}-${nest.breed_id}-${jd}`,
            type: event.key,
            label: event.label,
            territory,
            nestLabel,
            nestLink: `/nests/${nest.nestrec || nest.breed_id}`,
            dateLabel: `${MONTH_NAMES[month]} ${day}`,
            jd, chickDay,
            isIdeal: event.idealDay === chickDay,
            color: event.color,
            idealColor: event.idealColor,
          }
          if (jd === todayJD) today.push(task)
          else upcoming.push(task)
        }
      }

      // Territory visit overdue
      if (daysSinceVisit != null && daysSinceVisit >= VISIT_OVERDUE_DAYS) {
        today.push({
          id: `visit-${territory}`, type: 'visit',
          label: `Visit territory (${daysSinceVisit}d since last)`,
          territory, nestLabel: null,
          nestLink: `/territories/${encodeURIComponent(territory)}`,
          dateLabel: 'Today', jd: todayJD, chickDay: null,
          color: '#fef9c3', idealColor: '#ca8a04',
        })
      } else if (daysSinceVisit === null && tNests.length > 0) {
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
        const { month, day } = fromJulianDay(currentYear, paJD)
        const task = {
          id: `planned-${pa.action_id}`, type: 'planned',
          label: pa.notes || `Planned ${pa.action_type}`,
          territory: pa.territory, nestLabel: null,
          nestLink: `/territories/${encodeURIComponent(pa.territory)}`,
          dateLabel: `${MONTH_NAMES[month]} ${day}`, jd: paJD,
          color: '#bfdbfe', idealColor: '#2563eb',
        }
        if (paJD === todayJD) today.push(task)
        else upcoming.push(task)
      }
    }

    const sortKey = (t) => ({ band: 0, fledge: 1, indep: 2, renest: 3, visit: 4, planned: 5 }[t.type] ?? 99)
    today.sort((a, b) => sortKey(a) - sortKey(b))
    upcoming.sort((a, b) => a.jd - b.jd || sortKey(a) - sortKey(b))
    return { todayTasks: today, upcomingTasks: upcoming }
  }, [territories, nestsByTerritory, visitDates, plannedActions, todayJD, currentYear])

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

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  const incompleteTasks = manualTasks.filter(t => !t.completed)
  const completedTasks = manualTasks.filter(t => t.completed)

  return (
    <div className="space-y-4">
      {/* ── Quick stats ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: stats.territories, label: 'Territories', color: 'text-blue-600' },
          { n: stats.birds, label: 'Birds', color: 'text-purple-600' },
          { n: stats.nests, label: 'Nests', color: 'text-green-600' },
          { n: stats.visitsToday, label: 'Today', color: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border p-2 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.n}</div>
            <div className="text-[10px] text-gray-500 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/territories" className="block bg-blue-600 text-white rounded-lg py-2.5 text-center font-semibold text-sm">Territories</Link>
        <Link href="/nests/new" className="block bg-green-600 text-white rounded-lg py-2.5 text-center font-semibold text-sm">New Nest</Link>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SCHEDULE LEDGER                                    */}
      {/* ═══════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-semibold text-gray-700">Schedule</h2>
          <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-500">
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded" style={{ background: '#6ee7b7' }} />Band</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded" style={{ background: '#fca5a5' }} />Danger</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded" style={{ background: '#93c5fd' }} />Fledge</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded" style={{ background: '#c4b5fd' }} />Indep</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded" style={{ background: '#fed7aa' }} />Renest</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: LABEL_W + dateColumns.length * COL_W }}>

              {/* Month header */}
              <div className="flex border-b" style={{ background: '#f9fafb' }}>
                <div className="flex-shrink-0 border-r" style={{ width: LABEL_W, position: 'sticky', left: 0, zIndex: 3, background: '#f9fafb' }} />
                {monthGroups.map((mg, i) => (
                  <div key={i} className="text-center text-[9px] font-bold text-gray-400 border-r border-gray-100 py-0.5" style={{ width: mg.count * COL_W }}>{mg.label}</div>
                ))}
              </div>

              {/* Date header */}
              <div className="flex border-b" style={{ background: '#f9fafb' }}>
                <div className="flex-shrink-0 border-r" style={{ width: LABEL_W, position: 'sticky', left: 0, zIndex: 3, background: '#f9fafb' }}>
                  <div className="text-[8px] text-gray-400 px-1 py-0.5 text-right leading-tight">Terr</div>
                </div>
                {dateColumns.map((dc, i) => (
                  <div key={i} className={`flex-shrink-0 text-center border-r border-gray-100 py-0.5 ${dc.isToday ? 'bg-yellow-100' : dc.dayOfWeek === 0 || dc.dayOfWeek === 6 ? 'bg-gray-50' : ''}`} style={{ width: COL_W }}>
                    <div className={`text-[10px] leading-tight ${dc.isToday ? 'font-bold text-yellow-800' : 'text-gray-600'}`}>{dc.day}</div>
                    <div className={`text-[8px] leading-tight ${dc.isToday ? 'text-yellow-700' : 'text-gray-400'}`}>{DAY_LETTERS[dc.dayOfWeek]}</div>
                  </div>
                ))}
              </div>

              {/* Territory rows */}
              {territories.map((territory, rowIdx) => (
                <div key={territory} className={`flex ${rowIdx < territories.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  {/* Sticky territory label */}
                  <Link href={`/territories/${encodeURIComponent(territory)}`}
                    className="flex-shrink-0 border-r flex items-center active:bg-gray-100"
                    style={{ width: LABEL_W, height: CELL_H, position: 'sticky', left: 0, zIndex: 1, background: '#fff' }}>
                    <div className="px-1.5 w-full">
                      <div className="text-[11px] font-bold text-gray-700">T{territory}</div>
                      {(nestsByTerritory[territory] || []).length > 0 && (
                        <div className="text-[8px] text-gray-400 leading-tight">
                          {(nestsByTerritory[territory] || []).filter(n => !n.fail_code || n.fail_code === '24').length}n
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Date cells */}
                  {dateColumns.map((dc, ci) => {
                    const key = `${territory}:${dc.dateStr}`
                    const cell = cellData[key] || { events: [], visited: false, isPlanned: false, needsVisit: false }
                    const topEvent = cell.events[0]

                    let bg = 'transparent'
                    let textContent = ''
                    let textColor = ''

                    if (topEvent && !topEvent.completed) {
                      const isIdeal = topEvent.idealDay && topEvent.chickDay === topEvent.idealDay
                      bg = isIdeal ? topEvent.idealColor : topEvent.color
                      if (isIdeal || topEvent.isDanger) {
                        textContent = topEvent.textOnIdeal || ''
                        textColor = '#fff'
                      }
                    } else if (topEvent && topEvent.completed) {
                      bg = '#e5e7eb'
                      textContent = '✓'
                      textColor = '#6b7280'
                    } else if (cell.needsVisit) {
                      bg = '#fefce8'
                    }

                    if ((dc.dayOfWeek === 0 || dc.dayOfWeek === 6) && bg === 'transparent') bg = '#fafafa'

                    return (
                      <div key={ci}
                        className={`flex-shrink-0 flex items-center justify-center relative cursor-pointer border-r border-gray-50 ${dc.isToday ? 'border-l-2 border-r-2 border-yellow-400' : ''}`}
                        style={{ width: COL_W, height: CELL_H, background: bg }}
                        title={topEvent ? `T${territory}: ${topEvent.label}${topEvent.chickDay ? ` (Day ${topEvent.chickDay})` : ''}` : `T${territory}: ${dc.dateStr}`}
                        onClick={() => { if (dc.jd >= todayJD) togglePlanned(territory, dc.dateStr) }}>
                        {textContent && <span className="text-[9px] font-bold" style={{ color: textColor }}>{textContent}</span>}
                        {cell.visited && <div className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-gray-700" />}
                        {cell.isPlanned && <div className="absolute top-0 right-0 w-0 h-0" style={{ borderLeft: '5px solid transparent', borderTop: '5px solid #2563eb' }} />}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend footer */}
          <div className="flex items-center gap-3 px-2 py-1 border-t bg-gray-50 text-[8px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-700 inline-block" />visited</span>
            <span className="flex items-center gap-1"><span className="inline-block w-0 h-0" style={{ borderLeft: '4px solid transparent', borderTop: '4px solid #2563eb' }} />planned</span>
            <span>Tap future cell to plan/unplan</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TO DO TODAY                                        */}
      {/* ═══════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-1.5">
          Today {todayTasks.length > 0 && <span className="text-xs font-normal text-gray-400">({todayTasks.length})</span>}
        </h2>
        {todayTasks.length === 0 ? (
          <p className="text-xs text-gray-400 bg-white rounded-lg border p-3">Nothing scheduled for today.</p>
        ) : (
          <div className="space-y-1.5">
            {todayTasks.map(task => (
              <Link key={task.id} href={task.nestLink}
                className="flex items-center gap-2.5 bg-white rounded-lg border p-2.5 active:bg-gray-50">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                  style={{ background: task.color, color: task.idealColor }}>T{task.territory}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{task.label}</div>
                  <div className="text-[11px] text-gray-400">
                    Terr {task.territory}{task.nestLabel && ` · ${task.nestLabel}`}{task.chickDay && ` · Day ${task.chickDay}`}
                  </div>
                </div>
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
          <h2 className="text-sm font-semibold text-gray-700 mb-1.5">Upcoming <span className="text-xs font-normal text-gray-400">next 5 days</span></h2>
          <div className="space-y-1">
            {upcomingTasks.map(task => (
              <Link key={task.id} href={task.nestLink}
                className="flex items-center gap-2 bg-white rounded-lg border p-2 active:bg-gray-50">
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                  style={{ background: task.color, color: task.idealColor }}>T{task.territory}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700">{task.label}</div>
                  <div className="text-[10px] text-gray-400">
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
        <div className="flex justify-between items-center mb-1.5">
          <h2 className="text-sm font-semibold text-gray-700">
            Inbox {incompleteTasks.length > 0 && <span className="text-xs font-normal text-gray-400">({incompleteTasks.length})</span>}
          </h2>
          <button onClick={() => setShowAddTask(!showAddTask)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold">+ Add</button>
        </div>

        {showAddTask && (
          <form onSubmit={handleAddTask} className="bg-white rounded-lg border p-3 space-y-2 mb-2">
            <input type="text" value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="What needs to be done?"
              className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                <select value={newTask.priority}
                  onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                  className="border rounded-lg px-2 py-2 text-xs bg-white">
                  <option value="urgent">Urgent</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <input type="text" value={newTask.territory}
                  onChange={e => setNewTask({ ...newTask, territory: e.target.value })}
                  placeholder="Territory"
                  className="border rounded-lg px-2 py-2 text-xs w-24" />
              </div>
              <input type="text" value={newTask.notes || ''}
                onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                placeholder="Notes"
                className="flex-1 border rounded-lg px-2 py-2 text-xs" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">Save</button>
              <button type="button" onClick={() => setShowAddTask(false)} className="text-gray-500 text-xs">Cancel</button>
            </div>
          </form>
        )}

        {incompleteTasks.length === 0 && !showAddTask && (
          <p className="text-xs text-gray-400 bg-white rounded-lg border p-3">No tasks in inbox.</p>
        )}

        {incompleteTasks.length > 0 && (
          <div className="space-y-1">
            {incompleteTasks.map(task => (
              <div key={task.task_id} className="flex items-start gap-2 bg-white rounded-lg border p-2.5">
                <button onClick={() => toggleTask(task.task_id, task.completed)}
                  className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {task.priority === 'urgent' && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                    {task.priority === 'low' && <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />}
                    <span className="text-sm">{task.title}</span>
                  </div>
                  {(task.territory || task.notes) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {task.territory && <span>Terr {task.territory}</span>}
                      {task.territory && task.notes && ' · '}
                      {task.notes}
                    </div>
                  )}
                </div>
                <button onClick={() => deleteTask(task.task_id)} className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
              </div>
            ))}
          </div>
        )}

        {completedTasks.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-gray-400 cursor-pointer">{completedTasks.length} completed</summary>
            <div className="space-y-1 mt-1">
              {completedTasks.map(task => (
                <div key={task.task_id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                  <button onClick={() => toggleTask(task.task_id, task.completed)}
                    className="w-5 h-5 rounded border-2 border-green-400 bg-green-100 flex-shrink-0 flex items-center justify-center text-green-600 text-xs font-bold">✓</button>
                  <span className="text-sm text-gray-400 line-through flex-1">{task.title}</span>
                  <button onClick={() => deleteTask(task.task_id)} className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
