"use client"

import { useEffect, useRef, useState } from 'react'

export default function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLParagraphElement>(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (hasAnimated.current || !ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasAnimated.current) return
        hasAnimated.current = true
        observer.disconnect()

        const duration = 1400
        const start = performance.now()

        const step = (now: number) => {
          const elapsed = now - start
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setDisplay(Math.round(eased * value))
          if (progress < 1) requestAnimationFrame(step)
        }

        requestAnimationFrame(step)
      },
      { threshold: 0.3 },
    )

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value])

  return (
    <p ref={ref} className={className}>
      {display}
    </p>
  )
}
