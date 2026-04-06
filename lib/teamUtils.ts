/** Affiche le label complet d'une équipe : "CDPF - Nom" si le CDPF est renseigné, sinon juste "Nom". */
export function teamLabel(team: { name: string; cdpf?: string | null }): string {
  return team.cdpf ? `${team.cdpf} - ${team.name}` : team.name
}
