/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Désactiver le Router Cache côté client pour les pages dynamiques.
    // Sans ça, Next.js 14.2 sert le HTML en cache lors des navigations SPA
    // et les useEffect ne se réexécutent pas → données périmées sans F5.
    staleTimes: {
      dynamic: 0,   // pages dynamiques : pas de cache
      static: 180,  // pages statiques : 3 min (non concernées ici)
    },
  },
};

export default nextConfig;
