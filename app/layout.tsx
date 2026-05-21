import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'msgstack',
  description: 'Unified messaging',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#313338] text-white antialiased" style={{ fontFamily: '"Nunito Sans", sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
