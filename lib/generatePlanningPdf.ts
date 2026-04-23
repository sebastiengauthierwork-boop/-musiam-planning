import type { Employee, Schedule, ShiftCode, AbsenceCode } from '@/app/planning/types'
import { getCodeColors, SHIFT_PALETTE, ABSENCE_COLOR } from '@/lib/codeColors'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const DAY_LETTER = ['D','L','M','M','J','V','S']

function toISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1))
}

export interface PdfInput {
  employees: Employee[]
  schedules: Schedule[]
  shiftCodes: ShiftCode[]
  absenceCodes: AbsenceCode[]
  year: number
  month: number   // 0-indexed
  teamName: string
}

/** Génère un PDF A3 paysage du planning.
 *  Retourne { blob, dataUrl } — dataUrl peut être stocké dans pdf_url. */
export async function generatePlanningPdf(input: PdfInput): Promise<{ blob: Blob; dataUrl: string }> {
  const { employees, schedules, shiftCodes, absenceCodes, year, month, teamName } = input
  const days = getDays(year, month)

  const schedMap: Record<string, string> = {}
  for (const s of schedules) {
    if (s.code) schedMap[`${s.employee_id}|${s.date}`] = s.code
  }
  const absCodeSet = new Set(absenceCodes.map(a => a.code))

  const cellPct = ((100 - 12) / days.length).toFixed(2)

  const rowsHtml = employees.map(emp => {
    const cells = days.map(d => {
      const dateStr = toISO(d)
      const isMonday = d.getDay() === 1
      const code = schedMap[`${emp.id}|${dateStr}`]
      const sc = code ? shiftCodes.find(c => c.code === code) : undefined
      const isAbsence = code && !sc && absCodeSet.has(code)
      const c = code ? getCodeColors(code, shiftCodes, absenceCodes) : null
      const bg = c ? c.bg : '#ffffff'
      const textColor = c ? c.text : '#374151'
      const times = sc?.start_time && sc?.end_time ? `${sc.start_time.slice(0, 5)} ${sc.end_time.slice(0, 5)}` : ''
      const inner = sc
        ? `<span style="font-weight:700;color:${textColor};font-size:7px;display:block;line-height:1.3;">${code}</span>${times ? `<span style="color:${textColor};opacity:0.8;font-size:5px;display:block;line-height:1.2;">${times}</span>` : ''}`
        : isAbsence
        ? `<span style="font-weight:700;color:${textColor};font-size:7px;display:block;line-height:1.3;">${code}</span>`
        : ''
      const mondayBorder = isMonday ? 'border-left:2px solid #374151;' : ''
      return `<td style="border:1px solid #cbd5e1;${mondayBorder}text-align:center;vertical-align:middle;padding:3px 1px;background:${bg};">${inner}</td>`
    }).join('')
    return `<tr>
      <td style="border:1px solid #cbd5e1;padding:3px 5px;font-weight:600;color:#1e293b;background:#f8fafc;overflow:hidden;white-space:nowrap;">
        ${emp.last_name} ${emp.first_name.charAt(0)}.
        ${emp.fonction ? `<span style="font-weight:400;color:#94a3b8;font-size:6px;margin-left:3px;">${emp.fonction}</span>` : ''}
      </td>
      ${cells}
    </tr>`
  }).join('')

  const headerCols = days.map(d => {
    const isWE = d.getDay() === 0 || d.getDay() === 6
    const isMonday = d.getDay() === 1
    const mondayBorder = isMonday ? 'border-left:2px solid #374151;' : ''
    return `<th style="background:${isWE ? '#e2e8f0' : '#f1f5f9'};color:${isWE ? '#64748b' : '#374151'};border:1px solid #94a3b8;${mondayBorder}padding:2px 1px;text-align:center;font-weight:700;">
      <div style="font-size:6px;line-height:1;">${DAY_LETTER[d.getDay()]}</div>
      <div style="font-size:8px;line-height:1.3;font-weight:700;">${d.getDate()}</div>
    </th>`
  }).join('')

  const html = `<div style="font-family:Arial,sans-serif;padding:20px;background:white;width:1680px;box-sizing:border-box;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #1e293b;margin-bottom:10px;padding-bottom:6px;">
      <div>
        <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#94a3b8;">MUSIAM · PLANNING</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">${teamName}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;font-weight:600;color:#374151;">${MONTHS[month]} ${year}</div>
        <div style="font-size:9px;font-weight:700;color:#374151;margin-top:2px;text-transform:uppercase;">Édité le ${new Date().toLocaleDateString('fr-FR')}</div>
        <div style="font-size:8px;color:#94a3b8;margin-top:1px;">${employees.length} employé${employees.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <table style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:8px;">
      <colgroup>
        <col style="width:12%;" />
        ${days.map(() => `<col style="width:${cellPct}%;" />`).join('')}
      </colgroup>
      <thead>
        <tr>
          <th style="background:#f1f5f9;border:1px solid #94a3b8;padding:4px 6px;text-align:left;font-weight:700;color:#374151;">Employé</th>
          ${headerCols}
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:7px;color:#64748b;">
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="display:flex;align-items:center;gap:3px;">
          ${SHIFT_PALETTE.slice(0, 4).map(c => `<span style="display:inline-block;width:10px;height:10px;background:${c.bg};border:1px solid #cbd5e1;"></span>`).join('')}
          <span style="margin-left:3px;">Codes horaires</span>
        </span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;background:${ABSENCE_COLOR.bg};border:1px solid #666;"></span>Absence / congé</span>
        <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;background:#f1f5f9;border:1px solid #cbd5e1;"></span>Week-end</span>
      </div>
      <div style="font-size:6.5px;color:#94a3b8;">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
    </div>
  </div>`

  // Injecter dans le DOM (hors écran) pour que html2canvas puisse le capturer
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;left:-20000px;top:0;width:1680px;'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  try {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF }   = await import('jspdf')

    const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, {
      scale: 1.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    // A3 paysage : 420 × 297 mm
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = pdf.internal.pageSize.getHeight()
    const ratio = canvas.height / canvas.width
    let iw = pw
    let ih = pw * ratio
    if (ih > ph) { ih = ph; iw = ph / ratio }
    pdf.addImage(imgData, 'JPEG', 0, 0, iw, ih)

    const blob    = pdf.output('blob')
    const dataUrl = pdf.output('datauristring')
    return { blob, dataUrl }
  } finally {
    document.body.removeChild(wrapper)
  }
}

/** Déclenche le téléchargement du PDF dans le navigateur. */
export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
