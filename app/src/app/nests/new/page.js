'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel } from '@/lib/helpers'

export default function NewNestPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-500">Loading...</div>}>
      <NewNestForm />
    </Suspense>
  )
}

function NewNestForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillTerritory = searchParams.get('territory') || ''
  const currentYear = new Date().getFullYear()

  const [stagfindOptions, setStagfindOptions] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [male, setMale] = useState(null)
  const [female, setFemale] = useState(null)

  const [form, setForm] = useState({
    territory: prefillTerritory,
    male_attempt: '',
    female_attempt: '',
    stage_find: '',
    eggs: '',
    nest_height: '',
    vegetation: '',
    nest_description: '',
    notes: '',
  })

  useEffect(() => {
    loadLookups()
  }, [])

  // Load territory residents when territory changes
  useEffect(() => {
    if (form.territory) loadResidents(form.territory)
  }, [form.territory])

  async function loadLookups() {
    const { data: sf } = await supabase.from('lookup_stagfind').select('*')
    setStagfindOptions(sf || [])
  }

  // nestrec is NOT assigned during field data entry.
  // It's a sequential scientific ID from the 50-year historical breedfile.
  // Field-entered nests use nestrec = NULL and are identified by breed_id
  // (auto-generated). nestrec is assigned during proofing, after historical
  // records are imported and the full sequence is known.

  async function loadResidents(territory) {
    const residents = await getTerritoryResidents(supabase, territory, currentYear)
    setMale(residents.male)
    setFemale(residents.female)
  }

  function updateForm(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.territory || !form.stage_find) {
      alert('Territory and stage of find are required.')
      return
    }

    setSubmitting(true)
    try {
      const maleId = male?.band_id > 0 ? male.band_id : null
      const femaleId = female?.band_id > 0 ? female.band_id : null

      // nestrec is intentionally NULL — assigned during proofing
      const { data: inserted, error } = await supabase.from('breed').insert({
        year: currentYear,
        study_year: currentYear - 1974,
        territory: form.territory.trim(),
        male_id: maleId,
        female_id: femaleId,
        male_attempt: form.male_attempt || null,
        female_attempt: form.female_attempt || null,
        stage_find: form.stage_find,
        eggs: form.eggs ? parseInt(form.eggs) : null,
        nest_height: form.nest_height || null,
        vegetation: form.vegetation || null,
        nest_description: form.nest_description || null,
        other_notes: form.notes || null,
      }).select()

      if (error) throw error
      if (!inserted || inserted.length === 0) throw new Error('Insert returned no data')

      // Navigate using breed_id (the auto-generated PK), not nestrec
      router.push(`/nests/${inserted[0].breed_id}`)
    } catch (err) {
      alert('Error creating nest: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">New Nest Card</h2>
      <p className="text-xs text-gray-400">Nest record # will be assigned during proofing</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Territory */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Territory *</label>
            <input type="text" value={form.territory}
              onChange={e => updateForm('territory', e.target.value)}
              placeholder="e.g., 14" className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>

          {/* Parents auto-filled from territory */}
          {form.territory && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600">Parents (from territory card)</p>
              <div className="flex gap-4 text-sm">
                <span>♂ <span className="font-mono">{birdLabel(male)}</span></span>
                <span>♀ <span className="font-mono">{birdLabel(female)}</span></span>
              </div>
              {(!male || !female) && (
                <p className="text-xs text-orange-600 mt-1">
                  Missing parent? Assign birds in the Birds tab first.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Male attempt #</label>
              <input type="text" value={form.male_attempt}
                onChange={e => updateForm('male_attempt', e.target.value)}
                placeholder="e.g., 1" className="w-24 border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Female attempt #</label>
              <input type="text" value={form.female_attempt}
                onChange={e => updateForm('female_attempt', e.target.value)}
                placeholder="e.g., 1" className="w-24 border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Nest details */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-700">Nest Details</h3>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Stage of Find *</label>
            <select value={form.stage_find}
              onChange={e => updateForm('stage_find', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white" required>
              <option value="">Select stage...</option>
              {stagfindOptions.map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.description}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Eggs at find</label>
            <input type="number" value={form.eggs}
              onChange={e => updateForm('eggs', e.target.value)}
              placeholder="Count" className="w-24 border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nest height</label>
            <input type="text" value={form.nest_height}
              onChange={e => updateForm('nest_height', e.target.value)}
              placeholder="e.g., 1.2m" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Vegetation</label>
            <input type="text" value={form.vegetation}
              onChange={e => updateForm('vegetation', e.target.value)}
              placeholder="Plant species or description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nest description</label>
            <textarea value={form.nest_description}
              onChange={e => updateForm('nest_description', e.target.value)}
              placeholder="Describe the nest" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg border p-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
          <textarea value={form.notes}
            onChange={e => updateForm('notes', e.target.value)}
            placeholder="Any additional notes" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold text-base disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Nest Card'}
        </button>
      </form>
    </div>
  )
}
