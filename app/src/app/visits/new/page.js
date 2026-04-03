'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Visits are now logged from within territory detail pages.
// This page redirects to the territories list.
export default function NewVisitPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/territories')
  }, [router])
  return (
    <div className="text-center py-8 text-bark-500">
      Redirecting to territories...
    </div>
  )
}
