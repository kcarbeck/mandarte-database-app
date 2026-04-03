'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTerritoryResidents, birdLabel } from '@/lib/helpers'

export default function NewNestPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-bark-600">Loading...</div>}>
      <NewNestForm />
    </Suspense>
  )
}

function NewNestForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillTerritory = searchParams.get('territory') || ''
  const currentYear = new Date().getFullYear()

  const [submitting, setSubmitting] = useState(false)
  const [male, setMale] = useState(null)
  const [female, setFemale] = useState(null)

  const [form, setForm] = useState({
    territory: prefillTerritory,
    male_attempt: '',
    female_attempt: '',
    stage_find: '',
    nest_height: '',
    vegetation: '',
    nest_description: '',
    notes: '',
  })

  // Load territory residents when territory changes
  useEffect(() => {
    if (form.territory) loadResidents(form.territory)
  }, [form.territory])

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
      // Allow unbanded birds (negative band_id) as parents — they're still the parent,
      // just not banded yet. When banded later, ON UPDATE CASCADE updates all references.
      const maleId = male?.band_id ?? null
      const femaleId = female?.band_id ?? null

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
      <div>
        <h2 className="section-title">New Nest Card</h2>
        <p className="text-2xs text-bark-600">Nest record # will be assigned during proofing</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Territory */}
        <div className="card p-4 space-y-3">
          <div>
            <label className="label">Territory *</label>
            <input type="text" value={form.territory}
              onChange={e => updateForm('territory', e.target.value)}
              placeholder="e.g., 14" className="input" required />
          </div>

          {/* Parents auto-filled from territory */}
          {form.territory && (
            <div className="bg-cream-100 rounded-card p-3 space-y-1">
              <p className="text-2xs font-semibold text-forest-700">Parents (from territory card)</p>
              <div className="flex gap-4 text-sm text-bark-600">
                <span>♂ <span className="font-mono">{birdLabel(male)}</span></span>
                <span>♀ <span className="font-mono">{birdLabel(female)}</span></span>
              </div>
              {(!male || !female) && (
                <p className="text-2xs text-rust-600 mt-1">
                  Missing parent? Assign birds in the Birds tab first.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Male attempt #</label>
              <input type="text" value={form.male_attempt}
                onChange={e => updateForm('male_attempt', e.target.value)}
                placeholder="e.g., 1" className="input" />
            </div>
            <div>
              <label className="label">Female attempt #</label>
              <input type="text" value={form.female_attempt}
                onChange={e => updateForm('female_attempt', e.target.value)}
                placeholder="e.g., 1" className="input" />
            </div>
          </div>
        </div>

        {/* Nest details */}
        <div className="card p-4 space-y-3">
          <h3 className="section-subtitle">Nest Details</h3>
          <div>
            <label className="label">Stage of Find *</label>
            <select value={form.stage_find}
              onChange={e => updateForm('stage_find', e.target.value)}
              className="input" required>
              <option value="">Select stage...</option>
              <option value="NB">NB — Nest building</option>
              <option value="EL">EL — Egg laying</option>
              <option value="IC">IC — Incubating</option>
              <option value="HY">HY — Hatched young (found with chicks)</option>
              <option value="FY">FY — Fledged young</option>
              <option value="MTD">MTD — Empty nest, signs it once had eggs</option>
              <option value="MTUK">MTUK — Empty nest, unknown if ever used</option>
              <option value="EAF">EAF — Found after failure (eggs/shells present)</option>
              <option value="NFN">NFN — Never found nest (breeding confirmed by other evidence)</option>
              <option value="UK">UK — Unknown</option>
            </select>
            <p className="text-2xs text-bark-600 mt-1">Record egg/chick counts via nest observations on the territory page</p>
          </div>
          <div>
            <label className="label">Nest height</label>
            <input type="text" value={form.nest_height}
              onChange={e => updateForm('nest_height', e.target.value)}
              placeholder="e.g., 1.2m" className="input" />
          </div>
          <div>
            <label className="label">Vegetation</label>
            <input type="text" value={form.vegetation}
              onChange={e => updateForm('vegetation', e.target.value)}
              placeholder="Plant species or description" className="input" />
          </div>
          <div>
            <label className="label">Nest description</label>
            <textarea value={form.nest_description}
              onChange={e => updateForm('nest_description', e.target.value)}
              placeholder="Describe the nest" className="input" rows={2} />
          </div>
        </div>

        {/* Notes */}
        <div className="card p-4">
          <label className="label">Notes</label>
          <textarea value={form.notes}
            onChange={e => updateForm('notes', e.target.value)}
            placeholder="Any additional notes" className="input" rows={2} />
        </div>

        <button type="submit" disabled={submitting}
          className="btn-accent btn-lg w-full disabled:opacity-50">
          {submitting ? '⏳ Creating...' : 'Create Nest Card'}
        </button>
      </form>
    </div>
  )
}
