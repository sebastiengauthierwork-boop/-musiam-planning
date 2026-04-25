import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import AppShell from "@/components/AppShell"
import { AuthProvider } from "@/lib/auth"
import { SiteProvider } from "@/lib/site-context"

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
})
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
})

export const metadata: Metadata = {
  title: "Musiam Planning",
  description: "Musiam Planning - Logiciel de planification RH concu et developpe par Sebastien Gauthier, Musiam-Paris",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Musiam' },
  authors: [{ name: "Sebastien Gauthier" }],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <SiteProvider>
            <AppShell>{children}</AppShell>
          </SiteProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
