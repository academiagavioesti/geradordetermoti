import type { ReactNode } from "react"

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="flex items-center gap-3 text-balance text-3xl font-semibold uppercase tracking-wide text-foreground md:text-4xl"><span className="h-7 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{title}</h1>{description && <p className="mt-1.5 text-pretty text-sm text-muted-foreground md:pl-[18px] md:text-base">{description}</p>}</div>{actions && <div>{actions}</div>}</div>
}
