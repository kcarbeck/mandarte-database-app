'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Home', icon: (
    // House
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { href: '/territories', label: 'Territories', icon: (
    // Flag/map pin
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  )},
  { href: '/nests', label: 'Nests', icon: (
    // Nest with eggs (custom: bowl shape with circles)
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16c0 2.5 3.6 4 8 4s8-1.5 8-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16c0-2 2-4 4.5-5M20 16c0-2-2-4-4.5-5" />
      <circle cx="9.5" cy="13" r="2" strokeWidth={1.5} />
      <circle cx="14.5" cy="13" r="2" strokeWidth={1.5} />
      <circle cx="12" cy="10.5" r="1.8" strokeWidth={1.5} />
    </svg>
  )},
  { href: '/birds', label: 'Birds', icon: (
    // Bird in flight (song sparrow silhouette)
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15c2.5-4 6-5 9-3.5M12 11.5c3-1.5 6.5-.5 9 3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11.5V14" />
      <circle cx="12" cy="16" r="2.5" strokeWidth={1.5} />
      <path strokeLinecap="round" d="M10.5 15.5l-1-.5" />
      <circle cx="11.2" cy="15.3" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  )},
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-cream-50/95 backdrop-blur-md border-t-2 border-forest-800 z-50">
      <div className="max-w-lg mx-auto flex justify-around">
        {navItems.map(item => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center py-2 px-4 text-[11px] font-semibold transition-all duration-150 relative ${
                isActive
                  ? 'text-forest-800'
                  : 'text-bark-500 active:text-forest-700'
              }`}
            >
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-10 h-1 bg-rust-500 rounded-full" />
              )}
              <span className={`mb-0.5 transition-all ${isActive ? 'text-forest-700 scale-110' : ''}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
