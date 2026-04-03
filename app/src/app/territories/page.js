'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { sortTerritories, birdLabel, toJulianDay } from '@/lib/helpers'
import { classifyTerritory, TERRITORY_STATUS } from '@/lib/protocol'

export default function TerritoriesPage() {
  const [territories, setTerritories] = useState([])
  const [loading, setLoading] = useState(true)
  const currentYear = new Date().getFullYear()

  useEffect(() => { loadTerritories() }, [])

  async function loadTerritories() {
    try {
      // Get all current assignments (the source of truth for territories)
      const { data: assignments } = await supabase
        .from('territory_assignments')
        .select('*')
        .eq('year', currentYear)
        .is('end_date', null)
        .neq('role', 'floater')

      // Get visit data for last-visited dates
      const { data: visits } = await supabase
        .from('territory_visits')
        .select('territory, visit_date')
        .eq('year', currentYear)
        .order('visit_date', { ascending: false })

      // Get nests (include fields needed for classifyTerritory)
      const { data: nests } = await supabase
        .from('breed')
        .select('territory, nestrec, fail_code, stage_find, date_hatch, dfe, eggs, hatch, band, fledge, indep')
        .eq('year', currentYear)

      // Build territory map from assignments
      const terrMap = {}
      if (assignments) {
        for (const a of assignments) {
          if (!terrMap[a.territory]) {
            terrMap[a.territory] = { code: a.territory, male: null, female: null, visitCount: 0, lastVisited: null, nests: [] }
          }
          if (a.sex === 2) terrMap[a.territory].male = a
          if (a.sex === 1) terrMap[a.territory].female = a
        }
      }

      // Attach visit info
      if (visits) {
        const seen = new Set()
        for (const v of visits) {
          if (!terrMap[v.territory]) {
            terrMap[v.territory] = { code: v.territory, male: null, female: null, visitCount: 0, lastVisited: null, nests: [] }
          }
          terrMap[v.territory].visitCount++
          if (!seen.has(v.territory)) {
            terrMap[v.territory].lastVisited = v.visit_date
            seen.add(v.territory)
          }
        }
      }

      // Attach nests
      if (nests) {
        for (const n of nests) {
          if (n.territory && terrMap[n.territory]) {
            terrMap[n.territory].nests.push(n)
          }
        }
      }

      // Compute territory status for visit frequency
      const now = new Date()
      const todayJD = toJulianDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
      for (const t of Object.values(terrMap)) {
        t.terrStatus = classifyTerritory({
          hasFemale: !!t.female,
          hasMale: !!t.male,
          nests: t.nests,
          todayJD,
          year: currentYear,
        })
      }

      const sorted = sortTerritories(Object.keys(terrMap)).map(k => terrMap[k])
      setTerritories(sorted)
    } catch (err) {
      console.error('Error loading territories:', err)
    } finally {
      setLoading(false)
    }
  }

  function daysSince(dateStr) {
    if (!dateStr) return null
    // Use UTC arithmetic to avoid timezone shift —
    // new Date('YYYY-MM-DD') parses as UTC midnight, causing off-by-one in PDT
    const [y, m, d] = dateStr.split('-').map(Number)
    const now = new Date()
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const dateMs = Date.UTC(y, m - 1, d)
    return Math.floor((todayMs - dateMs) / (1000 * 60 * 60 * 24))
  }

  if (loading) return (
    <div className="flex justify-center items-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-forest-300 border-t-forest-600"></div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="section-title">Territories — {currentYear}</h2>
        <Link href="/birds" className="btn-primary btn-md">
          + Setup Birds
        </Link>
      </div>

      <p className="text-2xs text-bark-400">
        Add birds and assign them to territories from the Birds tab. Territories appear here once they have assigned birds or visits.
      </p>

      {territories.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-bark-400">No territories yet.</p>
          <p className="mt-2 text-sm text-bark-400">Go to the <Link href="/birds" className="text-forest-600 font-semibold hover:underline">Birds tab</Link> to add birds and assign them to territories.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {territories.map(terr => {
            const days = daysSince(terr.lastVisited)
            const interval = terr.terrStatus?.visitInterval ?? 5
            const isOverdue = days !== null && days >= interval
            const isSingleMale = terr.terrStatus?.status === TERRITORY_STATUS.SINGLE_MALE
            const isRenestWatch = terr.terrStatus?.status === TERRITORY_STATUS.RENEST_WATCH
              || terr.terrStatus?.status === TERRITORY_STATUS.RENEST_URGENT
            const isUrgent = terr.terrStatus?.status === TERRITORY_STATUS.RENEST_URGENT
            return (
              <Link key={terr.code}
                href={`/territories/${encodeURIComponent(terr.code)}`}
                className="card-interactive p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-base text-forest-800">Terr {terr.code}</span>
                    {terr.nests.length > 0 && (
                      <span className="ml-2 badge badge-success text-2xs">
                        {terr.nests.length} nest{terr.nests.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {isSingleMale && (
                      <span className="ml-1 badge badge-info text-2xs">♂ Single male</span>
                    )}
                    {isRenestWatch && (
                      <span className={`ml-1 ${
                        isUrgent ? 'badge badge-danger' : 'badge badge-warning'
                      } text-2xs`}>{isUrgent ? 'Renest URGENT' : 'Renest watch'}</span>
                    )}
                  </div>
                  <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${
                    days === null ? 'badge badge-neutral' :
                    !isOverdue ? 'badge badge-success' :
                    days <= interval + 2 ? 'badge badge-warning' :
                    'badge badge-danger'
                  }`}>
                    {days === null ? 'No visits' : days === 0 ? 'Today' : `${days}d ago`}
                  </span>
                </div>
                <div className="flex gap-3 mt-2 text-2xs text-bark-400">
                  <span>♂ <span className="band-id">{birdLabel(terr.male)}</span></span>
                  <span>♀ <span className="band-id">{birdLabel(terr.female)}</span></span>
                </div>
                <div className="text-2xs text-bark-400 mt-1">
                  {terr.visitCount} visit{terr.visitCount !== 1 ? 's' : ''}
                  <span className="ml-2">· every {interval}d</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
