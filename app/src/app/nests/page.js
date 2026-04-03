'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { birdLabel } from '@/lib/helpers'
import { formatJD, nestStatusBadge } from '@/lib/protocol'

export default function NestsPage() {
  const [nests, setNests] = useState([])
  const [parentMap, setParentMap] = useState({})
  const [birdMap, setBirdMap] = useState({})
  const [nestSeqMap, setNestSeqMap] = useState({})
  const [loading, setLoading] = useState(true)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    loadNests()
  }, [])

  async function loadNests() {
    try {
      const { data } = await supabase
        .from('breed')
        .select('*')
        .eq('year', currentYear)
        .order('nestrec', { ascending: false })

      // Compute nest sequence per territory (earliest breed_id = #1)
      const sorted = [...(data || [])].sort((a, b) => a.breed_id - b.breed_id)
      const terrCounts = {}
      const seqMap = {}
      for (const n of sorted) {
        const t = n.territory || '?'
        terrCounts[t] = (terrCounts[t] || 0) + 1
        seqMap[n.breed_id] = terrCounts[t]
      }

      setNests(data || [])
      setNestSeqMap(seqMap)

      // Look up parent bird info for all nests
      if (data && data.length > 0) {
        // Direct parent IDs from breed records
        const parentIds = [...new Set(
          data.flatMap(n => [n.male_id, n.female_id]).filter(Boolean)
        )]
        const bMap = {}
        if (parentIds.length > 0) {
          const { data: birds } = await supabase.from('birds')
            .select('band_id, color_combo, is_unbanded, sex')
            .in('band_id', parentIds)
          if (birds) birds.forEach(b => { bMap[b.band_id] = b })
        }
        setBirdMap(bMap)

        // Also gather territory assignments for nests without explicit parents
        const territories = [...new Set(data.map(n => n.territory).filter(Boolean))]
        const { data: assignments } = await supabase
          .from('territory_assignments')
          .select('*')
          .eq('year', currentYear)
          .is('end_date', null)
          .neq('role', 'floater')
          .in('territory', territories)

        const pMap = {}
        if (assignments) {
          for (const a of assignments) {
            if (!pMap[a.territory]) pMap[a.territory] = {}
            if (a.sex === 2) pMap[a.territory].male = a
            if (a.sex === 1) pMap[a.territory].female = a
          }
        }
        setParentMap(pMap)
      }
    } catch (err) {
      console.error('Error loading nests:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading nests...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-900">Nests ({currentYear})</h2>
        <Link
          href="/nests/new"
          className="bg-green-600 text-white rounded-lg px-3 py-2 text-sm font-semibold"
        >
          + New Nest
        </Link>
      </div>

      {nests.length === 0 ? (
        <div className="bg-white rounded-lg border p-6 text-center text-gray-400 text-sm">
          No nests recorded yet this season.
        </div>
      ) : (
        <div className="space-y-2">
          {nests.map(nest => {
            const status = nestStatusBadge(nest)
            const parents = parentMap[nest.territory] || {}
            return (
              <Link
                key={nest.breed_id}
                href={`/nests/${nest.breed_id}`}
                className={`block rounded-lg border p-3 active:bg-gray-50 ${
                  nest.field_complete
                    ? 'bg-green-50 border-green-300'
                    : 'bg-white'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">Terr {nest.territory || '?'}, Nest #{nestSeqMap[nest.breed_id] || '?'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {nest.field_complete && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-200 text-green-800 font-bold">Done</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-600">
                  <span>♂ <span className="font-mono">{nest.male_id ? birdLabel(birdMap[nest.male_id] || { band_id: nest.male_id, is_unbanded: nest.male_id < 0 }) : birdLabel(parents.male)}</span></span>
                  <span>♀ <span className="font-mono">{nest.female_id ? birdLabel(birdMap[nest.female_id] || { band_id: nest.female_id, is_unbanded: nest.female_id < 0 }) : birdLabel(parents.female)}</span></span>
                </div>
                {/* Pipeline flow: Eggs → Hatch → Band → Fledge → Indep */}
                <div className="mt-1.5 flex items-center gap-0.5">
                  {[
                    { k: 'eggs', l: 'Eggs', jd: nest.dfe },
                    { k: 'hatch', l: 'Hatch', jd: nest.date_hatch },
                    { k: 'band', l: 'Band', jd: null },
                    { k: 'fledge', l: 'Fledge', jd: null },
                    { k: 'indep', l: 'Indep', jd: null },
                  ].map((s, i) => {
                    const val = nest[s.k]
                    const filled = val != null
                    const dateLabel = s.jd ? formatJD(nest.year || currentYear, parseInt(s.jd)) : null
                    return (
                      <div key={s.k} className="flex items-center">
                        {i > 0 && <span className="text-gray-300 text-[10px] mx-0.5">→</span>}
                        <div className={`rounded px-1.5 py-0.5 text-center ${
                          filled ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-400 border border-gray-200'
                        }`}>
                          <div className="text-[9px] leading-tight">{s.l}</div>
                          <div className="text-xs font-bold font-mono leading-tight">{filled ? val : '—'}</div>
                          {dateLabel && dateLabel !== '?' && <div className="text-[8px] leading-tight opacity-70">{dateLabel}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
