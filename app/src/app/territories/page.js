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

  if (loading) return <div className="text-center py-8 text-gray-500">Loading territories...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-900">Territories — {currentYear}</h2>
        <Link href="/birds" className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-semibold">
          + Setup Birds
        </Link>
      </div>

      <p className="text-xs text-gray-400">
        Add birds and assign them to territories from the Birds tab. Territories appear here once they have assigned birds or visits.
      </p>

      {territories.length === 0 ? (
        <div className="bg-white rounded-lg border p-6 text-center text-gray-400 text-sm">
          <p>No territories yet.</p>
          <p className="mt-1">Go to the <Link href="/birds" className="text-blue-600 underline">Birds tab</Link> to add birds and assign them to territories.</p>
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
                className="block bg-white rounded-lg border p-3 active:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-base">Terr {terr.code}</span>
                    {terr.nests.length > 0 && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        {terr.nests.length} nest{terr.nests.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {isSingleMale && (
                      <span className="ml-1 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">♂ only</span>
                    )}
                    {isRenestWatch && (
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${
                        isUrgent ? 'bg-red-100 text-red-700 font-semibold' : 'bg-orange-100 text-orange-700'
                      }`}>{isUrgent ? 'Renest URGENT' : 'Renest watch'}</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    days === null ? 'bg-gray-100 text-gray-400' :
                    !isOverdue ? 'bg-green-100 text-green-700' :
                    days <= interval + 2 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {days === null ? 'No visits' : days === 0 ? 'Today' : `${days}d ago`}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-600">
                  <span>♂ <span className="font-mono">{birdLabel(terr.male)}</span></span>
                  <span>♀ <span className="font-mono">{birdLabel(terr.female)}</span></span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
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
