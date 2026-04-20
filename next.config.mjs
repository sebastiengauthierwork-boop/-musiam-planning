/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // Désactiver le Router Cache côté client pour les pages dynamiques.
    // Sans ça, Next.js 14.2 sert le HTML en cache lors des navigations SPA
    // et les useEffect ne se réexécutent pas → données périmées sans F5.
    staleTimes: {
      dynamic: 30,  // pages dynamiques : 30s de cache client (évite refetch à chaque navigation)
      static: 180,  // pages statiques : 3 min (non concernées ici)
    },
  },
};

export default nextConfig;
