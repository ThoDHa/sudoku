import { type ReactNode } from 'react'

interface ToastProps {
  children: ReactNode
  // role="status" -> aria-live="polite" (non-critical info).
  // role="alert"  -> aria-live="assertive" (errors requiring attention).
  role?: 'status' | 'alert'
  className?: string
}

export function Toast({ children, role = 'status', className = '' }: ToastProps) {
  return (
    <div role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'} className={className}>
      {children}
    </div>
  )
}
