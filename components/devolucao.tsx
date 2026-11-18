"use client"

import { useCallback, useMemo, useState } from "react"
import { Eye, Search, Undo2 } from "lucide-react"
import { useLog } from "@/lib/log"
import { ReturnDialog, TermPreview, initials, shortDate, type Entry, type PreviewTab } from "@/components/historico"

export function Devolucao() {
  const { entries, loaded, error, reload } = useLog()
  const [query, setQuery] = useState("")
  const [returning, setReturning] = useState<Entry | null>(null)
  const [preview, setPreview] = useState<{ entry: Entry; tab: PreviewTab } | null>(null)
  const closeReturn = useCallback(() => setReturning(null), [])
  const closePreview = useCallback(() => setPreview(null), [])
  const list = entries as Entry[]

  const { inUse, returned } = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const match = (entry: Entry) => !normalized || `${entry.nome} ${entry.marca} ${entry.modelo} ${entry.specificValue} ${entry.tipoLabel}`.toLowerCase().includes(normalized)
    return { inUse: list.filter((entry) => !entry.devolvido_em && match(entry)), returned: list.filter((entry) => entry.devolvido_em && match(entry)).sort((a, b) => String(b.devolvido_em).localeCompare(String(a.devolvido_em))).slice(0, 8) }
  }, [list, query])

  if (!loaded) return <div role="status" aria-label="Carregando" className="grid gap-3"><div className="h-11 animate-pulse rounded-xl bg-muted" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
  if (error) return <div className="grid gap-3"><p className="text-destructive">{error}</p><button type="button" onClick={() => void reload()} className="w-fit rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">Tentar novamente</button></div>

  return (
    <>
      <div className="grid gap-6">
        <label className="relative block">
          <span className="sr-only">Buscar colaborador ou equipamento</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, marca, modelo ou série" className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>

        <section aria-labelledby="em-uso">
          <h2 id="em-uso" className="mb-3 flex items-center gap-2 text-lg font-semibold uppercase tracking-wide"><span className="h-4 w-1 rounded-full bg-primary" aria-hidden="true" />Equipamentos em uso <span className="text-sm font-medium normal-case tracking-normal text-muted-foreground">({inUse.length})</span></h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {inUse.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum equipamento em uso encontrado.</p> : (
              <ul className="divide-y divide-border">
                {inUse.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary ring-1 ring-primary/20" aria-hidden="true">{initials(entry.nome)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">{[entry.tipoLabel, entry.marca, entry.modelo, entry.specificValue].filter(Boolean).join(" · ")} · entregue em {entry.dataTermo || "—"}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setReturning(entry)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Undo2 className="size-4" aria-hidden="true" />Gerar devolução</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="devolvidos">
          <h2 id="devolvidos" className="mb-3 flex items-center gap-2 text-lg font-semibold uppercase tracking-wide"><span className="h-4 w-1 rounded-full bg-primary" aria-hidden="true" />Devoluções recentes</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {returned.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma devolução registrada ainda.</p> : (
              <ul className="divide-y divide-border">
                {returned.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">{[entry.tipoLabel, entry.marca, entry.modelo].filter(Boolean).join(" · ")} · devolvido em {shortDate(entry.devolvido_em)}</p>
                    </div>
                    <button type="button" onClick={() => setPreview({ entry, tab: "devolucao" })} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium hover:bg-accent"><Eye className="size-4" aria-hidden="true" />Ver termo</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
      {returning && <ReturnDialog entry={returning} onClose={closeReturn} onSaved={() => { const done = returning; setReturning(null); void reload(); setPreview({ entry: done, tab: "devolucao" }) }} />}
      {preview && <TermPreview key={`${preview.entry.id}-${preview.tab}`} entry={preview.entry} initialTab={preview.tab} onClose={closePreview} />}
    </>
  )
}
