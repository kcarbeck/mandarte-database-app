import './globals.css'
import Nav from '@/components/Nav'
import AuthGate from '@/components/AuthGate'

export const metadata = {
  title: 'Mandarte Field App',
  description: 'Field data collection for Mandarte Island Song Sparrow study',
  manifest: '/manifest.json',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-cream-50 min-h-screen pb-20 font-sans text-forest-900">
        <AuthGate>
          <header className="bg-forest-800 sticky top-0 z-50">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-forest-600 flex items-center justify-center text-sm">
                🐦
              </div>
              <div>
                <h1 className="text-base font-bold text-cream-50 tracking-tight font-display">Mandarte</h1>
                <p className="text-2xs text-forest-300 -mt-0.5">Song Sparrow Field Study</p>
              </div>
            </div>
          </header>
          <main className="max-w-lg mx-auto px-4 py-4">
            {children}
          </main>
          <Nav />
        </AuthGate>
      </body>
    </html>
  )
}
