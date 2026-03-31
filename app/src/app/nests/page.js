'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { birdLabel } from '@/lib/helpers'

export default function NestsPage() {
  const [nests, setNests] = useState([])
  const [parentMap, setParentMap] = useState({})
  const [birdMap, setBirdMap] = useState({})
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

      setNests(data || [])

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
                    <span className="font-bold text-sm">{nest.nestrec ? `Nest #${nest.nestrec}` : `Nest (draft ${nest.breed_id})`}</span>
                    <span className="text-gray-400 text-xs">Terr {nest.territory}</span>
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
                <div className="text-xs text-gray-500 mt-1 flex gap-3">
                  {nest.eggs != null && <span>Eggs: {nest.eggs}</span>}
                  {nest.hatch != null && <span>Hatch: {nest.hatch}</span>}
                  {nest.band != null && <span>Band: {nest.band}</span>}
                  {nest.fledge != null && <span>Fledge: {nest.fledge}</span>}
                  {nest.indep != null && <span>Indep: {nest.indep}</span>}
                  {nest.dfe && <span>DFE: {nest.dfe}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
