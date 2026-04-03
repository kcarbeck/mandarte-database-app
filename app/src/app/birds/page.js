'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { birdLabel, sortTerritories, BAND_COLORS, findBirdsByCombo, localDateString } from '@/lib/helpers'

export default function BirdsPage() {
  const currentYear = new Date().getFullYear()
  const [assignments, setAssignments] = useState([])
  const [allBirds, setAllBirds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showColorRef, setShowColorRef] = useState(false)
  const [modal, setModal] = useState(null) // { type, data }
  const [filter, setFilter] = useState('all')
  const [fledglings, setFledglings] = useState([]) // banded chicks from this year

  // Add bird mode: 'returning' | 'new_banded' | 'unbanded'
  const [addMode, setAddMode] = useState('returning')
  const [addForm, setAddForm] = useState({
    color_combo: '', band_id: '', sex: '', territory: '',
    role: 'territory_holder', is_unbanded: false, notes: '',
  })
  // Search results for returning bird lookup
  const [comboSearchResults, setComboSearchResults] = useState([])
  const [comboSearching, setComboSearching] = useState(false)
  const [selectedReturning, setSelectedReturning] = useState(null) // bird picked from search

  // Modal form state
  const [modalForm, setModalForm] = useState({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: assignData } = await supabase
      .from('territory_assignments')
      .select('*')
      .eq('year', currentYear)
      .order('territory', { ascending: true })

    const { data: birdData } = await supabase
      .from('birds')
      .select('*')
      .order('band_id', { ascending: true })

    // Load juveniles: banded chicks from this year (kid1-kid5 from breed records)
    const { data: breedData } = await supabase
      .from('breed')
      .select('breed_id, nestrec, territory, kid1, kid2, kid3, kid4, kid5, band, indep')
      .eq('year', currentYear)
    const fledgeList = []
    if (breedData) {
      // Number nests per territory for readable labels when nestrec is null
      const nestsByTerr = {}
      const sortedNests = [...breedData].sort((a, b) => a.breed_id - b.breed_id)
      for (const nest of sortedNests) {
        if (!nestsByTerr[nest.territory]) nestsByTerr[nest.territory] = 0
        nestsByTerr[nest.territory]++
        const nestNum = nestsByTerr[nest.territory]
        const nestLabel = nest.nestrec ? `Nest #${nest.nestrec}` : `Nest ${nestNum}`
        for (let i = 1; i <= 5; i++) {
          const kidId = nest[`kid${i}`]
          if (!kidId) continue
          const bird = (birdData || []).find(b => b.band_id === kidId)
          fledgeList.push({
            band_id: kidId,
            color_combo: bird?.color_combo || '',
            territory: nest.territory,
            nestLabel,
            breed_id: nest.breed_id,
            nestrec: nest.nestrec,
            isIndependent: nest.indep != null && nest.indep > 0,
          })
        }
      }
    }

    setAssignments(assignData || [])
    setAllBirds(birdData || [])
    setFledglings(fledgeList)
    setLoading(false)
  }

  // Build roster: merge birds with their current assignments
  function getRoster() {
    const currentAssignments = assignments.filter(a => !a.end_date)
    const endedAssignments = assignments.filter(a => a.end_date)
    const roster = []
    const seenBands = new Set()

    for (const a of currentAssignments) {
      seenBands.add(a.band_id)
      const bird = allBirds.find(b => b.band_id === a.band_id)
      roster.push({
        ...a, bird,
        status: a.role === 'floater' ? 'Floater' : `Terr ${a.territory}`,
        statusType: a.role,
      })
    }

    for (const a of endedAssignments) {
      if (!seenBands.has(a.band_id)) {
        seenBands.add(a.band_id)
        const bird = allBirds.find(b => b.band_id === a.band_id)
        roster.push({
          ...a, bird,
          status: a.departure_reason === 'confirmed_dead' ? 'Dead' :
                  a.departure_reason === 'not_seen' ? 'Not seen' :
                  a.departure_reason || 'Unassigned',
          statusType: 'gone',
        })
      }
    }

    return roster
  }

  function filteredRoster() {
    const roster = getRoster()
    switch (filter) {
      case 'males': return roster.filter(r => r.sex === 2)
      case 'females': return roster.filter(r => r.sex === 1)
      case 'unbanded': return roster.filter(r => r.bird?.is_unbanded || r.band_id < 0)
      case 'floaters': return roster.filter(r => r.role === 'floater')
      default: return roster
    }
  }

  // -------------------------------------------------------
  // SEARCH BIRDS BY COLOR COMBO (for returning bird lookup)
  // -------------------------------------------------------
  async function searchByCombo(combo) {
    if (!combo || combo.trim().length < 2) {
      setComboSearchResults([])
      return
    }
    setComboSearching(true)
    try {
      const results = await findBirdsByCombo(supabase, combo, currentYear)
      setComboSearchResults(results)
    } catch (err) {
      console.error('Combo search failed:', err)
      setComboSearchResults([])
    } finally {
      setComboSearching(false)
    }
  }

  // Debounced search trigger
  function handleComboSearch(combo) {
    setAddForm(f => ({ ...f, color_combo: combo }))
    setSelectedReturning(null) // clear selection when typing
    // Search after a short pause
    clearTimeout(window._comboSearchTimer)
    window._comboSearchTimer = setTimeout(() => searchByCombo(combo), 300)
  }

  // Select a returning bird from search results
  function selectReturningBird(bird) {
    setSelectedReturning(bird)
    setAddForm(f => ({
      ...f,
      color_combo: bird.color_combo,
      band_id: String(bird.band_id),
      sex: String(bird.sex),
    }))
    setComboSearchResults([]) // close dropdown
  }

  // -------------------------------------------------------
  // ADD BIRD
  // -------------------------------------------------------
  async function handleAddBird(e) {
    e.preventDefault()
    const { color_combo, band_id, sex, territory, role, is_unbanded, notes } = addForm

    if (!sex) { alert('Sex is required.'); return }
    if (role === 'territory_holder' && !territory) { alert('Territory is required.'); return }

    try {
      let actualBandId

      if (addMode === 'returning') {
        // -------------------------------------------------------
        // RETURNING BIRD: Bird already exists in birds table,
        // OR is being manually entered (historical data not yet imported).
        // -------------------------------------------------------
        if (!selectedReturning) {
          alert('Please search by color combo and select a bird from the results, or enter the band # manually.')
          return
        }
        actualBandId = selectedReturning.band_id

        // If manual entry, create/upsert the bird first (it may not exist yet)
        if (selectedReturning.manualEntry) {
          const { error: upsertErr } = await supabase.from('birds').upsert({
            band_id: actualBandId,
            color_combo: selectedReturning.color_combo,
            sex: parseInt(sex) || 0,
            is_immigrant: null, // don't know yet — historical import will fill this
          }, { onConflict: 'band_id', ignoreDuplicates: true })
          if (upsertErr) throw new Error('Failed to create bird record: ' + upsertErr.message)
          // If bird already existed, update combo if not already set
          await supabase.from('birds')
            .update({ color_combo: selectedReturning.color_combo })
            .eq('band_id', actualBandId)
            .is('color_combo', null)
        }

        // Safety: verify bird exists (should now exist even for manual entry)
        const { data: existCheck } = await supabase
          .from('birds').select('band_id, color_combo').eq('band_id', actualBandId).single()
        if (!existCheck) throw new Error(`Bird ${actualBandId} could not be found or created.`)

        // Check not already assigned this year
        const { data: existAssign } = await supabase
          .from('territory_assignments')
          .select('assignment_id, territory')
          .eq('band_id', actualBandId)
          .eq('year', currentYear)
          .is('end_date', null)
        if (existAssign && existAssign.length > 0) {
          throw new Error(`This bird is already assigned to territory ${existAssign[0].territory} this season. End that assignment first using "End / Move" on the other territory.`)
        }

      } else {
        // UNBANDED / NEW BIRD: temporary negative ID
        // This covers immigrants, missed chicks, or any bird not yet in the database.
        // They start as unbanded; once caught and banded, use "Band this bird" on roster.
        // Use full timestamp + random to avoid collisions between concurrent users
        actualBandId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000))
        const { error: birdErr } = await supabase.from('birds').insert({
          band_id: actualBandId,
          sex: parseInt(sex),
          color_combo: null,
          is_unbanded: true,
          unbanded_description: `Unbanded ${sex === '2' ? 'male' : sex === '1' ? 'female' : 'bird'}${territory ? ` on Terr ${territory}` : ''}`,
          notes: notes || null,
        })
        if (birdErr) throw new Error('Failed to create bird: ' + birdErr.message)
      }

      // Create territory assignment (all modes)
      // NOTE: User-entered notes go ONLY to birds.notes (the bird-level record).
      // territory_assignments.notes is reserved for assignment-specific context
      // (e.g., "Moved from Terr 5") to avoid desync between the two tables.
      if (territory || role === 'floater') {
        const comboForAssign = addMode === 'returning' ? selectedReturning.color_combo : null
        const { error: assignErr } = await supabase.from('territory_assignments').insert({
          territory: territory || 'FLOATER',
          year: currentYear,
          band_id: actualBandId,
          color_combo: comboForAssign,
          sex: parseInt(sex),
          role: role,
          start_date: localDateString(),
          // Returning birds are confirmed (identity known from previous year)
          // New/unbanded birds are never confirmed until banded
          confirmed: addMode === 'returning',
          notes: null,
        })
        if (assignErr) throw new Error('Bird saved but territory assignment failed: ' + assignErr.message)
      }

      setShowAddForm(false)
      setAddForm({ color_combo: '', band_id: '', sex: '', territory: '', role: 'territory_holder', is_unbanded: false, notes: '' })
      setSelectedReturning(null)
      setComboSearchResults([])
      setAddMode('returning')
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  // ===============================================================
  // SHARED: Verify a write actually took effect.
  // Reads back the row and checks that expected fields match.
  // Throws if verification fails — the user sees the error.
  // ===============================================================
  async function verify(table, matchCol, matchVal, expectedFields, label) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(matchCol, matchVal)

    if (error) throw new Error(`Verification read failed on ${table}: ${error.message}`)
    if (!data || data.length === 0) throw new Error(`VERIFICATION FAILED: No rows found in ${table} where ${matchCol}=${matchVal} after ${label}`)

    for (const [field, expected] of Object.entries(expectedFields)) {
      const actual = data[0][field]
      if (String(actual) !== String(expected)) {
        throw new Error(`VERIFICATION FAILED (${label}): ${table}.${field} expected "${expected}" but got "${actual}"`)
      }
    }
    return data
  }

  // ===============================================================
  // SHARED: Update band_id across ALL referencing tables.
  // This is the ONLY place band_id changes propagate.
  // Tables: territory_assignments, territory_visits, breed, survival
  //
  // CRITICAL SAFETY: When called from the field app, corrections
  // are SCOPED TO THE CURRENT SEASON ONLY. This prevents accidental
  // modification of proofed historical data. The year parameter
  // controls this scope. Pass null to update all years (admin only).
  // ===============================================================
  async function propagateBandIdChange(oldId, newId, newCombo, seasonYear = null) {
    const errors = []
    const yearFilter = seasonYear ? (query) => query.eq('year', seasonYear) : (query) => query

    // 1. territory_assignments — current season only
    let q1 = supabase.from('territory_assignments')
      .update({ band_id: newId, color_combo: newCombo })
      .eq('band_id', oldId)
    if (seasonYear) q1 = q1.eq('year', seasonYear)
    const { error: e1 } = await q1
    if (e1) errors.push(`territory_assignments: ${e1.message}`)

    // 2. territory_visits — male_band_id (current season)
    let q2 = supabase.from('territory_visits')
      .update({ male_band_id: newId })
      .eq('male_band_id', oldId)
    if (seasonYear) q2 = q2.eq('year', seasonYear)
    const { error: e2 } = await q2
    if (e2) errors.push(`territory_visits.male_band_id: ${e2.message}`)

    // 3. territory_visits — female_band_id (current season)
    let q3 = supabase.from('territory_visits')
      .update({ female_band_id: newId })
      .eq('female_band_id', oldId)
    if (seasonYear) q3 = q3.eq('year', seasonYear)
    const { error: e3 } = await q3
    if (e3) errors.push(`territory_visits.female_band_id: ${e3.message}`)

    // 4. breed — male_id (current season)
    let q4 = supabase.from('breed')
      .update({ male_id: newId })
      .eq('male_id', oldId)
    if (seasonYear) q4 = q4.eq('year', seasonYear)
    const { error: e4 } = await q4
    if (e4) errors.push(`breed.male_id: ${e4.message}`)

    // 5. breed — female_id (current season)
    let q5 = supabase.from('breed')
      .update({ female_id: newId })
      .eq('female_id', oldId)
    if (seasonYear) q5 = q5.eq('year', seasonYear)
    const { error: e5 } = await q5
    if (e5) errors.push(`breed.female_id: ${e5.message}`)

    // 6. breed — kid1 through kid5 (current season)
    for (const kidCol of ['kid1', 'kid2', 'kid3', 'kid4', 'kid5']) {
      let qk = supabase.from('breed')
        .update({ [kidCol]: newId })
        .eq(kidCol, oldId)
      if (seasonYear) qk = qk.eq('year', seasonYear)
      const { error: ek } = await qk
      if (ek) errors.push(`breed.${kidCol}: ${ek.message}`)
    }

    // 7. survival (current season)
    let q6 = supabase.from('survival')
      .update({ band_id: newId })
      .eq('band_id', oldId)
    if (seasonYear) q6 = q6.eq('year', seasonYear)
    const { error: e6 } = await q6
    if (e6) errors.push(`survival: ${e6.message}`)

    if (errors.length > 0) {
      throw new Error('PROPAGATION ERRORS — some tables may be inconsistent:\n' + errors.join('\n'))
    }

    // Verify no stale references remain in the scoped season
    const staleChecks = [
      { table: 'territory_assignments', col: 'band_id' },
      { table: 'territory_visits', col: 'male_band_id' },
      { table: 'territory_visits', col: 'female_band_id' },
      { table: 'breed', col: 'male_id' },
      { table: 'breed', col: 'female_id' },
      { table: 'survival', col: 'band_id' },
    ]
    for (const { table, col } of staleChecks) {
      let sq = supabase.from(table).select(col).eq(col, oldId)
      if (seasonYear) sq = sq.eq('year', seasonYear)
      const { data: stale } = await sq
      if (stale && stale.length > 0) {
        throw new Error(`VERIFICATION FAILED: ${stale.length} row(s) in ${table}.${col} still reference old band_id ${oldId} in year ${seasonYear || 'ALL'}`)
      }
    }
    // Also check kid columns in scoped season
    for (const kidCol of ['kid1', 'kid2', 'kid3', 'kid4', 'kid5']) {
      let skq = supabase.from('breed').select(kidCol).eq(kidCol, oldId)
      if (seasonYear) skq = skq.eq('year', seasonYear)
      const { data: stale } = await skq
      if (stale && stale.length > 0) {
        throw new Error(`VERIFICATION FAILED: ${stale.length} row(s) in breed.${kidCol} still reference old band_id ${oldId} in year ${seasonYear || 'ALL'}`)
      }
    }
  }

  // -------------------------------------------------------
  // BAND AN UNBANDED BIRD
  // Updates the existing row in-place. The original negative
  // band_id is preserved in field_id so the link is permanent.
  // -------------------------------------------------------
  async function handleBandBird() {
    const { band_id: oldBandId } = modal.data
    const { newBandId, colorCombo } = modalForm
    if (!newBandId || !colorCombo) { alert('Both fields are required.'); return }
    if (!/^\d{9}$/.test(newBandId)) { alert('Metal band # must be exactly 9 digits.'); return }

    const newId = parseInt(newBandId)
    const oldId = typeof oldBandId === 'number' ? oldBandId : parseInt(oldBandId)
    if (isNaN(newId)) { alert('Metal band # must be a number.'); return }

    // Check uniqueness
    const { data: existing } = await supabase.from('birds').select('band_id').eq('band_id', newId).single()
    if (existing) { alert(`Band number ${newId} is already in use.`); return }

    try {
      // Pre-check: new band_id must not already exist
      const { data: existing } = await supabase
        .from('birds')
        .select('band_id')
        .eq('band_id', newId)
        .single()
      if (existing) throw new Error(`Band ID ${newId} already exists in the database. If this is correct, use "Correct identity" instead.`)

      // Pre-check: old bird must exist
      const { data: oldBird } = await supabase
        .from('birds')
        .select('*')
        .eq('band_id', oldId)
        .single()
      if (!oldBird) throw new Error(`Cannot find bird with band_id ${oldId}`)

      // Step 1: Update the bird row
      const { error: birdErr } = await supabase
        .from('birds')
        .update({
          band_id: newId,
          field_id: oldId,
          color_combo: colorCombo,
          is_unbanded: false,
          unbanded_description: null,
        })
        .eq('band_id', oldId)
      if (birdErr) throw new Error('Failed to update bird: ' + birdErr.message)

      // Verify the bird update
      await verify('birds', 'band_id', newId,
        { field_id: oldId, color_combo: colorCombo, is_unbanded: false },
        'band bird')

      // Step 2: Propagate band_id change to ALL referencing tables (current season only)
      await propagateBandIdChange(oldId, newId, colorCombo, currentYear)

      // Step 3: Mark current-season assignments as confirmed (NEVER touch historical)
      const { error: confErr } = await supabase
        .from('territory_assignments')
        .update({ confirmed: true })
        .eq('band_id', newId)
        .eq('year', currentYear)
      if (confErr) console.warn('Could not mark assignments confirmed:', confErr.message)

      // Step 4: Log to corrections for audit trail
      await supabase.from('corrections').insert({
        table_name: 'birds',
        record_id: String(newId),
        column_name: 'band_id',
        old_value: String(oldId),
        new_value: String(newId),
        reason: `Banded: unbanded bird (${oldId}) assigned metal band ${newId}, combo ${colorCombo}`,
        corrected_by: typeof window !== 'undefined' ? (localStorage.getItem('mandarte_observer') || 'unknown') : 'unknown',
      })

      setModal(null)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  // -------------------------------------------------------
  // END ASSIGNMENT (bird left territory)
  // -------------------------------------------------------
  async function handleEndAssignment() {
    const r = modal.data
    const { assignment_id } = r
    const { reason, notes, endDate, moveToNew, newTerritory, newStartDate } = modalForm

    if (!reason) { alert('Please select a reason.'); return }
    if (moveToNew && !newTerritory) { alert('Please enter the new territory.'); return }

    const dateVal = endDate || localDateString()

    try {
      // Step 1: End the current assignment
      const { error } = await supabase
        .from('territory_assignments')
        .update({
          end_date: dateVal,
          departure_reason: reason,
          notes: notes || null,
        })
        .eq('assignment_id', assignment_id)
      if (error) throw new Error(error.message)

      // Verify end
      await verify('territory_assignments', 'assignment_id', assignment_id,
        { end_date: dateVal, departure_reason: reason },
        'end assignment')

      // Step 2: If moving, create new assignment on the new territory
      if (moveToNew && newTerritory) {
        const startDate = newStartDate || dateVal
        const { data: inserted, error: insertErr } = await supabase
          .from('territory_assignments')
          .insert({
            territory: newTerritory.trim(),
            year: currentYear,
            band_id: r.band_id,
            color_combo: r.color_combo || r.bird?.color_combo || null,
            sex: r.sex,
            role: r.role || 'territory_holder',
            start_date: startDate,
            confirmed: r.confirmed,
            notes: `Moved from Terr ${r.territory}. ${notes || ''}`.trim(),
          })
          .select()
        if (insertErr) throw new Error('Old assignment ended but new assignment failed: ' + insertErr.message)
        if (!inserted || inserted.length === 0) throw new Error('Insert returned no rows — new assignment may not have saved.')
      }

      setModal(null)
      loadData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // -------------------------------------------------------
  // REASSIGN BIRD TO NEW TERRITORY
  // Creates a new assignment row — old one stays ended.
  // -------------------------------------------------------
  async function handleReassign() {
    const r = modal.data
    const { newTerritory, newRole } = modalForm

    if (!newTerritory && newRole !== 'floater') { alert('Territory is required.'); return }

    const startDate = modalForm.startDate || localDateString()
    const territory = newTerritory || 'FLOATER'
    const role = newRole || 'territory_holder'

    try {
      // End the old assignment first — a bird can only hold one territory at a time
      const { error: endErr } = await supabase.from('territory_assignments')
        .update({ end_date: startDate, departure_reason: 'moved' })
        .eq('assignment_id', r.assignment_id)
      if (endErr) throw new Error('Failed to end old assignment: ' + endErr.message)

      const { data: inserted, error } = await supabase.from('territory_assignments').insert({
        territory,
        year: currentYear,
        band_id: r.band_id,
        color_combo: r.color_combo || r.bird?.color_combo || null,
        sex: r.sex,
        role,
        start_date: startDate,
        confirmed: false,  // New territory — not yet confirmed by observation
        notes: modalForm.notes ? `Moved from ${r.territory}. ${modalForm.notes}` : `Moved from ${r.territory}`,
      }).select()
      if (error) throw new Error(error.message)
      if (!inserted || inserted.length === 0) throw new Error('Insert returned no rows — reassignment may not have saved.')

      // Verify: the new assignment exists
      await verify('territory_assignments', 'assignment_id', inserted[0].assignment_id,
        { band_id: r.band_id, territory, role, start_date: startDate },
        'reassign bird')

      setModal(null)
      loadData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // -------------------------------------------------------
  // CORRECT IDENTITY (misread bands — this was an error)
  // Logs correction, then updates bird + ALL referencing tables.
  // -------------------------------------------------------
  async function handleCorrectIdentity() {
    const r = modal.data
    const { newCombo, newBandId, correctionNote } = modalForm

    if (!newCombo) { alert('New color combo is required.'); return }

    try {
      const oldCombo = r.color_combo || r.bird?.color_combo || '—'
      const oldBandId = r.band_id
      const actualNewBandId = newBandId ? parseInt(newBandId) : null

      // PROTECTION: Check if this bird has confirmed history from previous years.
      // If the bird existed before this season with a confirmed combo, warn strongly.
      const { data: prevAssignments } = await supabase
        .from('territory_assignments')
        .select('year, confirmed, color_combo')
        .eq('band_id', oldBandId)
        .lt('year', currentYear)
        .eq('confirmed', true)
        .limit(1)

      if (prevAssignments && prevAssignments.length > 0 && !actualNewBandId) {
        // Same bird, changing combo — but this bird has confirmed history
        const confirmed = !window.confirm(
          `WARNING: This bird (${oldBandId}) has confirmed identity from ${prevAssignments[0].year} ` +
          `with combo "${prevAssignments[0].color_combo}". Changing the combo on this bird ` +
          `will affect its master record.\n\n` +
          `Are you SURE the combo on this same bird was wrong?`
        )
        if (confirmed) return
      }

      // Step 1: Log the correction for audit trail
      const { error: corrErr } = await supabase.from('corrections').insert({
        table_name: 'birds',
        record_id: String(oldBandId),
        column_name: actualNewBandId ? 'band_id + color_combo' : 'color_combo',
        old_value: actualNewBandId ? `${oldCombo} (${oldBandId})` : oldCombo,
        new_value: actualNewBandId ? `${newCombo} (${actualNewBandId})` : newCombo,
        reason: correctionNote || 'Misread color bands in field',
        corrected_by: 'field_app',
        corrected_at: new Date().toISOString(),
      })
      if (corrErr) throw new Error('Failed to log correction: ' + corrErr.message)

      if (actualNewBandId && actualNewBandId !== oldBandId) {
        // -------------------------------------------------------
        // DIFFERENT BIRD: band_id is changing
        // The bird we thought was on this territory is actually
        // a different individual. We need to:
        //   1. Ensure the correct bird exists in birds table
        //   2. Update the birds row (or create it)
        //   3. Update ALL references across ALL tables
        //   4. Note the error on the old bird record if it was wrong
        // -------------------------------------------------------

        // Check if the correct bird already exists
        const { data: existingBird } = await supabase
          .from('birds')
          .select('*')
          .eq('band_id', actualNewBandId)
          .single()

        if (!existingBird) {
          // Create the correct bird
          const { error: birdErr } = await supabase.from('birds').insert({
            band_id: actualNewBandId,
            sex: r.sex,
            color_combo: newCombo,
            is_unbanded: false,
          })
          if (birdErr) throw new Error('Failed to create corrected bird: ' + birdErr.message)

          // Verify it was created
          await verify('birds', 'band_id', actualNewBandId,
            { color_combo: newCombo, sex: r.sex },
            'create corrected bird')
        } else {
          // Bird exists — update its combo if different
          if (existingBird.color_combo !== newCombo) {
            const { error: birdErr } = await supabase
              .from('birds')
              .update({ color_combo: newCombo })
              .eq('band_id', actualNewBandId)
            if (birdErr) throw new Error('Failed to update existing bird combo: ' + birdErr.message)
          }
        }

        // Propagate the band_id change across current season tables ONLY
        // Historical/proofed data is never touched by field corrections
        await propagateBandIdChange(oldBandId, actualNewBandId, newCombo, currentYear)

        // Mark the old bird record as an error (if it still exists and isn't the same row)
        const { data: oldBirdStill } = await supabase
          .from('birds').select('band_id').eq('band_id', oldBandId).single()
        if (oldBirdStill) {
          await supabase.from('birds')
            .update({ notes: `Identity error — was actually ${actualNewBandId} (${newCombo}). See corrections table.` })
            .eq('band_id', oldBandId)
        }

      } else {
        // -------------------------------------------------------
        // SAME BIRD: only color combo is wrong
        // Update birds table + ALL assignments for this bird
        // (not just the current one — the combo was always wrong)
        // -------------------------------------------------------
        const { error: birdErr } = await supabase
          .from('birds')
          .update({ color_combo: newCombo })
          .eq('band_id', oldBandId)
        if (birdErr) throw new Error('Failed to update bird: ' + birdErr.message)

        // Verify bird update
        await verify('birds', 'band_id', oldBandId,
          { color_combo: newCombo },
          'correct combo on bird')

        // Update current-season assignments for this bird
        // Historical assignments are protected by database triggers (migration_008)
        const { error: assignErr } = await supabase
          .from('territory_assignments')
          .update({ color_combo: newCombo })
          .eq('band_id', oldBandId)
          .eq('year', currentYear)
        if (assignErr) throw new Error('Failed to update assignments: ' + assignErr.message)

        // Verify: no current-season assignments for this bird have the old combo
        const { data: staleAssign } = await supabase
          .from('territory_assignments')
          .select('assignment_id, color_combo')
          .eq('band_id', oldBandId)
          .eq('year', currentYear)
          .eq('color_combo', oldCombo)
        if (staleAssign && staleAssign.length > 0 && oldCombo !== newCombo) {
          throw new Error(`VERIFICATION FAILED: ${staleAssign.length} assignment(s) still have old combo "${oldCombo}"`)
        }
      }

      setModal(null)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }


  if (loading) return (
    <div className="flex justify-center items-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-forest-300 border-t-forest-600"></div>
    </div>
  )

  const roster = filteredRoster()
  const territories = sortTerritories([...new Set(assignments.filter(a => !a.end_date && a.role === 'territory_holder').map(a => a.territory))])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="section-title">Birds — {currentYear}</h2>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary btn-md">
          + Add Bird
        </button>
      </div>

      {/* Color reference */}
      <button onClick={() => setShowColorRef(!showColorRef)} className="text-xs text-forest-600 font-medium hover:underline">
        {showColorRef ? 'Hide' : 'Show'} color band reference
      </button>
      {showColorRef && (
        <div className="card p-3 text-xs grid grid-cols-3 gap-1">
          {BAND_COLORS.map(c => (
            <div key={c.abbr} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block border border-bark-200" style={{ backgroundColor: c.hex }} />
              <span className="font-mono font-bold text-forest-800">{c.abbr}</span> = {c.color}
            </div>
          ))}
          <div className="col-span-3 mt-1 text-bark-500">Read: left top, left bottom . right top, right bottom</div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 text-xs overflow-x-auto scrollbar-hide">
        {[
          { key: 'all', label: `All (${getRoster().length})` },
          { key: 'males', label: 'Males' },
          { key: 'females', label: 'Females' },
          { key: 'unbanded', label: 'Unbanded' },
          { key: 'floaters', label: 'Floaters' },
          { key: 'juveniles', label: `Juveniles${fledglings.length > 0 ? ` (${fledglings.length})` : ''}` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap font-bold ${
              filter === f.key ? 'bg-forest-600 text-white' : 'bg-bark-100 text-bark-600'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Add bird form — three modes */}
      {showAddForm && (
        <form onSubmit={handleAddBird} className="card p-4 space-y-3">
          <h3 className="font-bold text-sm text-forest-800">Add Bird to Roster</h3>

          {/* Mode tabs */}
          <div className="flex gap-1 text-xs">
            {[
              { key: 'returning', label: 'Returning bird' },
              { key: 'unbanded', label: 'New bird (unbanded)' },
            ].map(m => (
              <button key={m.key} type="button"
                onClick={() => {
                  setAddMode(m.key)
                  setAddForm({ color_combo: '', band_id: '', sex: '', territory: '', role: 'territory_holder', is_unbanded: m.key === 'unbanded', notes: '' })
                  setSelectedReturning(null)
                  setComboSearchResults([])
                }}
                className={`px-3 py-1.5 rounded-full font-bold ${
                  addMode === m.key ? 'bg-forest-600 text-white' : 'bg-bark-100 text-bark-600'
                }`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Mode descriptions */}
          <p className="text-xs text-bark-500">
            {addMode === 'returning' && 'Search by color combo to find a bird already in the database (e.g., survived from last year).'}
            {addMode === 'unbanded' && 'New bird not yet in the database (immigrant, missed chick, etc). Gets a temporary ID. Band later using the "Band this bird" button on their roster card.'}
          </p>

          {/* RETURNING BIRD: combo search with autopopulate */}
          {addMode === 'returning' && (
            <div className="space-y-2">
              <div className="relative">
                <label className="label">Color combo (search)</label>
                <input type="text" value={addForm.color_combo}
                  onChange={e => handleComboSearch(e.target.value)}
                  placeholder="Type combo, e.g., dbm.gr"
                  className="input font-mono"
                  autoComplete="off" />
                {comboSearching && <p className="text-xs text-bark-500 mt-1">Searching...</p>}

                {/* Search results dropdown */}
                {comboSearchResults.length > 0 && !selectedReturning && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-bark-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {comboSearchResults.map(b => (
                      <button key={b.band_id} type="button"
                        onClick={() => selectReturningBird(b)}
                        className="w-full text-left px-3 py-2 hover:bg-cream-50 border-b border-cream-200 last:border-b-0">
                        <div className="flex justify-between items-center">
                          <span className="band-id text-sm">{b.color_combo}</span>
                          <span className="text-xs text-bark-500">#{b.band_id}</span>
                        </div>
                        <div className="text-xs text-bark-600">
                          {b.sex === 2 ? '♂' : b.sex === 1 ? '♀' : '?'}
                          {b.lastTerritory ? ` — Last on Terr ${b.lastTerritory}` : ''}
                          {b.lastSeenYear ? ` (${b.lastSeenYear})` : ''}
                          {b.confirmedDead ? ' — DEAD' : ''}
                          {b.is_immigrant ? ' — immigrant' : ''}
                        </div>
                        {b.confirmedDead && (
                          <div className="text-xs text-red-600 font-medium mt-0.5">
                            Confirmed dead — combo may have been reused. Verify carefully!
                          </div>
                        )}
                        {!b.hasHistory && (
                          <div className="text-xs text-rust-600 mt-0.5">
                            No assignment/survival records found — verify identity carefully
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {addForm.color_combo.length >= 2 && comboSearchResults.length === 0 && !comboSearching && !selectedReturning && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-rust-600 font-medium">
                      No matching birds in database. If you know this bird&apos;s identity, enter their band # below to add them manually.
                    </p>
                    <div className="bg-rust-50 border border-rust-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-rust-700">Manual entry — known returning bird</p>
                      <p className="text-2xs text-rust-600">
                        Use this when last year&apos;s data hasn&apos;t been imported yet but you know the bird.
                      </p>
                      <div>
                        <label className="label">Metal band # *</label>
                        <input type="text" value={addForm.band_id}
                          onChange={e => setAddForm(f => ({ ...f, band_id: e.target.value }))}
                          placeholder="e.g., 281178423"
                          className="input font-mono" />
                      </div>
                      <button type="button" onClick={() => {
                        if (!addForm.band_id || !addForm.color_combo) {
                          alert('Enter both color combo and band number.')
                          return
                        }
                        const bandId = parseInt(addForm.band_id)
                        if (isNaN(bandId) || bandId <= 0) {
                          alert('Band number must be a positive integer.')
                          return
                        }
                        setSelectedReturning({
                          band_id: bandId,
                          color_combo: addForm.color_combo.trim(),
                          sex: addForm.sex ? parseInt(addForm.sex) : null,
                          manualEntry: true,
                        })
                        setAddForm(f => ({ ...f, band_id: String(bandId) }))
                      }}
                        className="btn-accent btn-sm w-full">
                        Use this bird
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Selected bird confirmation */}
              {selectedReturning && (
                <div className="bg-sage-50 border border-sage-200 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="band-id text-sm">{selectedReturning.color_combo}</span>
                      <span className="text-xs text-bark-500 ml-2">#{selectedReturning.band_id}</span>
                      <span className={`ml-2 text-xs font-bold ${selectedReturning.sex === 2 ? 'text-forest-600' : 'text-rust-500'}`}>
                        {selectedReturning.sex === 2 ? '♂' : '♀'}
                      </span>
                    </div>
                    <button type="button" onClick={() => {
                      setSelectedReturning(null)
                      setAddForm(f => ({ ...f, band_id: '', sex: '' }))
                    }} className="text-xs text-bark-500 underline">Change</button>
                  </div>
                  <p className="text-xs text-forest-700 mt-1">
                    {selectedReturning.manualEntry
                      ? 'Manual entry — bird will be created in database when you save.'
                      : 'Identity confirmed — band # and combo are locked from previous year data.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sex + Role (all modes, but sex auto-filled for returning) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sex *</label>
              <select value={addForm.sex}
                onChange={e => setAddForm({ ...addForm, sex: e.target.value })}
                className="input"
                disabled={addMode === 'returning' && !!selectedReturning && !selectedReturning.manualEntry}
                required>
                <option value="">Select...</option>
                <option value="2">Male</option>
                <option value="1">Female</option>
                <option value="0">Unknown</option>
              </select>
            </div>
            <div>
              <label className="label">Role</label>
              <select value={addForm.role}
                onChange={e => setAddForm({ ...addForm, role: e.target.value })}
                className="input">
                <option value="territory_holder">Territory holder</option>
                <option value="floater">Floater</option>
              </select>
            </div>
          </div>

          {addForm.role === 'territory_holder' && (
            <div>
              <label className="label">Territory *</label>
              <input type="text" value={addForm.territory}
                onChange={e => setAddForm({ ...addForm, territory: e.target.value })}
                placeholder="e.g., 12"
                className="input w-32" />
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <input type="text" value={addForm.notes}
              onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
              placeholder="Optional notes"
              className="input" />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-md">
              {addMode === 'returning' ? 'Assign to Territory' : 'Add Bird'}
            </button>
            <button type="button" onClick={() => { setShowAddForm(false); setSelectedReturning(null); setComboSearchResults([]) }}
              className="btn-ghost btn-md">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Juveniles view */}
      {filter === 'juveniles' && (
        <div>
          {fledglings.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-bark-600">No juveniles banded yet this season.</p>
              <p className="text-xs text-bark-500 mt-1">Juveniles appear here once chicks are banded on a nest card.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {fledglings.map((f, i) => (
                <a key={`juv-${f.band_id}-${i}`}
                  href={`/nests/${f.nestrec || f.breed_id}`}
                  className="card-interactive block p-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="band-id text-sm">{f.color_combo || '—'}</span>
                      <span className="text-xs text-bark-500">{f.band_id}</span>
                      <span className="badge badge-warning text-2xs">juvenile</span>
                      {f.isIndependent && (
                        <span className="badge badge-success text-2xs">✓ independent</span>
                      )}
                    </div>
                    <span className="text-xs text-bark-500">{f.nestLabel}, Terr {f.territory}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bird roster */}
      {filter !== 'juveniles' && (roster.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-bark-600">No birds in roster yet.</p>
          <p className="text-xs text-bark-500 mt-1">Tap &quot;+ Add Bird&quot; to start building this season&apos;s roster.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roster.map((r, i) => (
            <div key={r.assignment_id || i} className="card p-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="band-id text-sm">
                    {r.color_combo || (r.bird?.color_combo) || (r.bird?.is_unbanded || r.band_id < 0 ? 'Unbanded' : '—')}
                  </span>
                  {r.band_id > 0 && (
                    <span className="text-xs text-bark-500 ml-2">{r.band_id}</span>
                  )}
                  <span className={`ml-2 text-xs font-bold ${r.sex === 2 ? 'text-forest-600' : r.sex === 1 ? 'text-rust-500' : 'text-bark-400'}`}>
                    {r.sex === 2 ? '♂' : r.sex === 1 ? '♀' : '?'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`badge text-2xs ${
                    r.statusType === 'territory_holder' ? 'badge-success' :
                    r.statusType === 'floater' ? 'badge-warning' :
                    r.departure_reason === 'confirmed_dead' ? 'badge-danger' :
                    'badge-neutral'
                  }`}>
                    {r.status}
                  </span>
                  {r.confirmed && <span className="text-xs text-forest-500 font-bold" title="Confirmed">✓</span>}
                </div>
              </div>

              {r.notes && <p className="text-xs text-bark-500 mt-1">{r.notes}</p>}

              {/* Actions for currently assigned birds */}
              {!r.end_date && (
                <div className="flex gap-3 mt-2 text-xs font-medium">
                  {(r.bird?.is_unbanded || r.band_id < 0) && (
                    <button onClick={() => {
                      setModal({ type: 'band', data: r })
                      setModalForm({ newBandId: '', colorCombo: '' })
                    }} className="text-rust-600 hover:underline">Band this bird</button>
                  )}
                  {r.band_id > 0 && !r.bird?.is_unbanded && (
                    <button onClick={() => {
                      setModal({ type: 'correct', data: r })
                      setModalForm({
                        newCombo: r.color_combo || r.bird?.color_combo || '',
                        newBandId: '',
                        correctionNote: '',
                      })
                    }} className="text-forest-600 hover:underline">Correct bands</button>
                  )}
                  <button onClick={() => {
                    setModal({ type: 'end', data: r })
                    setModalForm({ reason: '', notes: '', endDate: localDateString(), moveToNew: false, newTerritory: '' })
                  }} className="text-red-600 hover:underline">End / Move</button>
                </div>
              )}

            </div>
          ))}
        </div>
      ))}

      {/* ============================================= */}
      {/* MODALS                                        */}
      {/* ============================================= */}

      {/* BAND BIRD modal */}
      {modal?.type === 'band' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-forest-800">Band this bird</h3>
            <p className="text-xs text-bark-600">Enter the metal band number and color combo after banding.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Color combo *</label>
                <input type="text" value={modalForm.colorCombo || ''}
                  onChange={e => setModalForm({ ...modalForm, colorCombo: e.target.value })}
                  placeholder="e.g., dbm.gr"
                  className="input font-mono text-base" />
              </div>
              <div>
                <label className="label">Metal band # *</label>
                <input type="text" value={modalForm.newBandId || ''}
                  onChange={e => setModalForm({ ...modalForm, newBandId: e.target.value })}
                  placeholder="9-digit"
                  className="input font-mono text-base" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleBandBird}
                className="btn-accent btn-md flex-1">Save</button>
              <button onClick={() => setModal(null)}
                className="btn-ghost btn-md flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* END / MOVE ASSIGNMENT modal */}
      {modal?.type === 'end' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-forest-800">End / Move Assignment</h3>
            <p className="text-xs text-bark-600">
              <span className="band-id">{modal.data.color_combo || modal.data.bird?.color_combo || 'Bird'}</span> on Terr {modal.data.territory}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Why is this bird leaving? *</label>
                <select value={modalForm.reason || ''}
                  onChange={e => {
                    const r = e.target.value
                    setModalForm({ ...modalForm, reason: r, moveToNew: r === 'moved' })
                  }}
                  className="input">
                  <option value="">Select reason...</option>
                  <option value="moved">Moved to another territory</option>
                  <option value="replaced">Replaced by another bird</option>
                  <option value="not_seen">Not seen / disappeared</option>
                  <option value="confirmed_dead">Confirmed dead</option>
                  <option value="became_floater">Became floater</option>
                </select>
              </div>
              <div>
                <label className="label">Date *</label>
                <input type="date" value={modalForm.endDate || ''}
                  onChange={e => setModalForm({ ...modalForm, endDate: e.target.value })}
                  className="input" />
              </div>
            </div>

            {/* Move to new territory — shown when reason is 'moved' or toggled on */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={modalForm.moveToNew || false}
                  onChange={e => setModalForm({ ...modalForm, moveToNew: e.target.checked })}
                  className="rounded border-bark-300" />
                <span className="text-sm text-forest-800 font-medium">Assign to a new territory</span>
              </label>
            </div>

            {modalForm.moveToNew && (
              <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 space-y-2">
                <p className="text-xs text-forest-700 font-bold">New assignment</p>
                <p className="text-2xs text-forest-600">
                  This will end the current assignment on Terr {modal.data.territory} and create a new one.
                  Nest records from the old territory are not changed.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">New territory *</label>
                    <input type="text" value={modalForm.newTerritory || ''}
                      onChange={e => setModalForm({ ...modalForm, newTerritory: e.target.value })}
                      placeholder="e.g. 5"
                      className="input" />
                  </div>
                  <div>
                    <label className="label">Start date</label>
                    <input type="date" value={modalForm.newStartDate || modalForm.endDate || ''}
                      onChange={e => setModalForm({ ...modalForm, newStartDate: e.target.value })}
                      className="input" />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="label">Notes (optional)</label>
              <input type="text" value={modalForm.notes || ''}
                onChange={e => setModalForm({ ...modalForm, notes: e.target.value })}
                placeholder="Any details"
                className="input" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleEndAssignment}
                className={`flex-1 btn btn-md text-white ${
                  modalForm.moveToNew ? 'bg-forest-600 hover:bg-forest-700 focus:ring-forest-400' : 'bg-red-600 hover:bg-red-700 focus:ring-red-400'
                }`}>
                {modalForm.moveToNew ? 'Move Bird' : 'End Assignment'}
              </button>
              <button onClick={() => setModal(null)}
                className="btn-ghost btn-md flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN modal */}
      {modal?.type === 'reassign' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-forest-800">Reassign bird</h3>
            <p className="text-xs text-bark-600">
              <span className="band-id">{modal.data.color_combo || modal.data.bird?.color_combo || 'Bird'}</span>
              {' '}— previously on Terr {modal.data.territory} ({modal.data.departure_reason})
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">New territory *</label>
                <input type="text" value={modalForm.newTerritory || ''}
                  onChange={e => setModalForm({ ...modalForm, newTerritory: e.target.value })}
                  placeholder="e.g., 5"
                  className="input" />
              </div>
              <div>
                <label className="label">Role</label>
                <select value={modalForm.newRole || 'territory_holder'}
                  onChange={e => setModalForm({ ...modalForm, newRole: e.target.value })}
                  className="input">
                  <option value="territory_holder">Territory holder</option>
                  <option value="floater">Floater</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Start date *</label>
              <input type="date" value={modalForm.startDate || ''}
                onChange={e => setModalForm({ ...modalForm, startDate: e.target.value })}
                className="input" />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input type="text" value={modalForm.notes || ''}
                onChange={e => setModalForm({ ...modalForm, notes: e.target.value })}
                placeholder="e.g., Moved from Terr 1 after being replaced"
                className="input" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleReassign}
                className="btn-primary btn-md flex-1">Reassign</button>
              <button onClick={() => setModal(null)}
                className="btn-ghost btn-md flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* CORRECT BANDS modal — same bird, misread color combo */}
      {modal?.type === 'correct' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-forest-800">Correct bands</h3>
            <p className="text-xs text-bark-600">
              You misread the color bands on <strong>this same bird</strong>. Fix the combo here.
            </p>
            <p className="text-xs text-bark-500">
              Current: <span className="band-id">{modal.data.color_combo || modal.data.bird?.color_combo || '—'}</span>
              {modal.data.band_id > 0 && ` (${modal.data.band_id})`}
            </p>
            <div>
              <label className="label">Correct color combo *</label>
              <input type="text" value={modalForm.newCombo || ''}
                onChange={e => setModalForm({ ...modalForm, newCombo: e.target.value })}
                placeholder="e.g., dbm.gr"
                className="input font-mono text-base" />
            </div>
            <div>
              <label className="label">Correct metal band # (only if band # was also wrong)</label>
              <input type="text" value={modalForm.newBandId || ''}
                onChange={e => setModalForm({ ...modalForm, newBandId: e.target.value })}
                placeholder="Leave blank if only combo was wrong"
                className="input font-mono" />
            </div>
            <div>
              <label className="label">What happened?</label>
              <input type="text" value={modalForm.correctionNote || ''}
                onChange={e => setModalForm({ ...modalForm, correctionNote: e.target.value })}
                placeholder="e.g., Misread green as blue on right leg"
                className="input" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCorrectIdentity}
                className="btn-primary btn-md flex-1">Save Correction</button>
              <button onClick={() => setModal(null)}
                className="btn-ghost btn-md flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
