'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const

export function useInactivityTimeout(timeoutSeconds: number, warningSeconds = 120) {
  const [showWarning, setShowWarning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reset() {
      setShowWarning(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)

      const warnDelay = (timeoutSeconds - warningSeconds) * 1000
      if (warnDelay > 0) {
        warnTimerRef.current = setTimeout(() => setShowWarning(true), warnDelay)
      }

      timerRef.current = setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/login?reason=inactivity'
      }, timeoutSeconds * 1000)
    }

    reset()
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, reset))
    }
  }, [timeoutSeconds, warningSeconds])

  return showWarning
}
