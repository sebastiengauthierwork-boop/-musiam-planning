export const dynamic = 'force-dynamic'

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start px-4 py-12">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-2xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Mentions légales</h1>
        <p className="text-sm text-gray-400 italic mb-8">Musiam Planning — by Planekipe</p>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Responsable du traitement</h2>
          <p className="text-sm text-gray-600">Sébastien Gauthier – Musiam-Paris</p>
          <p className="text-sm text-gray-600">Contact : <a href="mailto:sgauthier@musiam-paris.com" className="text-blue-600 hover:underline">sgauthier@musiam-paris.com</a></p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Finalité du traitement</h2>
          <p className="text-sm text-gray-600">Gestion des plannings du personnel : organisation des horaires, suivi des présences et absences, administration des ressources humaines.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Données collectées</h2>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Nom et prénom</li>
            <li>Type de contrat et horaires de travail</li>
            <li>Adresse email professionnelle (pour les rôles avec accès)</li>
            <li>Numéro de téléphone professionnel (facultatif)</li>
            <li>Matricule (facultatif)</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Durée de conservation</h2>
          <p className="text-sm text-gray-600">Les données sont conservées pendant la durée du contrat de travail, puis 5 ans après la fin du contrat, conformément aux obligations légales.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Vos droits</h2>
          <p className="text-sm text-gray-600 mb-2">Conformément au RGPD, vous disposez des droits suivants :</p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Droit d'accès à vos données personnelles</li>
            <li>Droit de rectification des données inexactes</li>
            <li>Droit à l'effacement (dans les limites légales)</li>
            <li>Droit à la portabilité</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">Pour exercer ces droits, contactez : <a href="mailto:sgauthier@musiam-paris.com" className="text-blue-600 hover:underline">sgauthier@musiam-paris.com</a></p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Hébergement</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li><span className="font-medium">Base de données :</span> Supabase – AWS Paris (eu-west-3), données hébergées en France</li>
            <li><span className="font-medium">Application web :</span> Vercel – région Paris (cdg1), données hébergées en France</li>
          </ul>
        </section>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <a href="/login" className="text-sm text-blue-600 hover:underline">← Retour à la connexion</a>
        </div>
      </div>
      <p className="mt-6 text-center text-gray-400 text-xs">Musiam Planning v1.2 © Sébastien Gauthier</p>
    </div>
  )
}
