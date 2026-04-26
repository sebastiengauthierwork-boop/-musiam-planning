import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import AppShell from "@/components/AppShell"
import { AuthProvider } from "@/lib/auth"
import { PermissionsProvider } from "@/lib/permissions"
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
  description: "Musiam Planning by Planekipe - Logiciel de planification RH",
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
          <PermissionsProvider>
            <SiteProvider>
              <AppShell>{children}</AppShell>
            </SiteProvider>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
