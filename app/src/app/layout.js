import './globals.css'
import Nav from '@/components/Nav'

export const metadata = {
  title: 'Mandarte Field App',
  description: 'Field data collection for Mandarte Island Song Sparrow study',
  manifest: '/manifest.json',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen pb-20">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-lg mx-auto px-4 py-3">
            <h1 className="text-lg font-bold text-gray-900">Mandarte Field App</h1>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-4">
          {children}
        </main>
        <Nav />
      </body>
    </html>
  )
}
