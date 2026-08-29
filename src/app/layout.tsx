import type { Metadata } from 'next'
import { Open_Sans, Radio_Canada_Big } from 'next/font/google'
import './globals.css'

const openSans = Open_Sans({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800'],
  variable: '--font-open-sans',
})

const radioCanada = Radio_Canada_Big({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-radio-canada',
})

export const metadata: Metadata = {
  title: 'Navy CRM',
  description: 'Sistema de gestión Navy',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${openSans.variable} ${radioCanada.variable} ${openSans.className}`}
        suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}