'use client'

import { useEffect, useRef, useState } from 'react'
import { teamLabel } from '@/lib/teamUtils'

type TeamItem = { id: string; name: string; cdpf?: string | null }

interface TeamDropdownProps {
  teams: TeamItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  className?: string
}

export default function TeamDropdown({ teams, selectedIds, onChange, className }: TeamDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  const allSelected = teams.length > 0 && selectedIds.length === teams.length

  const summary = selectedIds.length === 0
    ? 'Aucune équipe'
    : allSelected
    ? 'Toutes les équipes'
    : selectedIds.length === 1
    ? teamLabel(teams.find(t => t.id === selectedIds[0]) ?? { name: '?' })
    : `${selectedIds.length} équipes`

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-slate-200 whitespace-nowrap"
      >
        <span>{summary}</span>
        <svg
          className={`h-3 w-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] max-h-60 overflow-y-auto">
          {teams.length > 1 && (
            <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 border-b border-gray-100 select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onChange(allSelected ? [] : teams.map(t => t.id))}
                className="rounded border-gray-300"
              />
              Toutes les équipes
            </label>
          )}
          {teams.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 select-none">
              <input
                type="checkbox"
                checked={selectedIds.includes(t.id)}
                onChange={() => toggle(t.id)}
                className="rounded border-gray-300"
              />
              <span className="font-medium">{teamLabel(t)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
