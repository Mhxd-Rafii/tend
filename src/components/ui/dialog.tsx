import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'
export function Modal({ title, description, children, open, onOpenChange, wide = false }: { title: string; description?: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; wide?: boolean }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className={`dialog-content ${wide ? 'dialog-wide' : ''}`}>
    <div className="dialog-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description className={description ? 'muted' : 'sr-only'}>{description || 'Complete the form below.'}</DialogPrimitive.Description></div><DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close dialog"><X size={19} /></Button></DialogPrimitive.Close></div>
    {children}
  </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
}
