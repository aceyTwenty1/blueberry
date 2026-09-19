import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'ghost' | 'outline' | 'primary'
type Size = 'sm' | 'md' | 'icon'

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 disabled:opacity-50 disabled:pointer-events-none'
  const variants: Record<Variant, string> = {
    default: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
    ghost: 'hover:bg-zinc-800 text-zinc-300 hover:text-white',
    outline: 'border border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-200',
    primary: 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-blueberry border border-white/10'
  }
  const sizes: Record<Size, string> = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3',
    icon: 'h-8 w-8 p-0'
  }
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
