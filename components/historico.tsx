"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Download, Eye, FileSpreadsheet, Search, Trash2, Undo2, X } from "lucide-react"
import { entriesToCsv, useLog, type LogEntry } from "@/lib/log"
import { generateDevolucaoPdf, generateTermoPdf, slugify } from "@/lib/generate-pdf"
import { CONDICOES_DEVOLUCAO, getTermoDevolucao, getTermoRecebimento, getTermoResponsabilidade, type Block, type CondicaoDevolucao, type Devolucao, type TermoData } from "@/lib/termos"

export type Entry = LogEntry & { status?: string; devolvido_em?: string | null }
export type PreviewTab = "responsabilidade" | "recebimento" | "devolucao"
type Detail = { termo: TermoData; devolucao?: Devolucao | null; status?: string; unidade?: string; tipo_label?: string; marca?: string; modelo?: string; specific_value?: string; data_termo?: string; created_by_nome?: string }

const STATUS_LABEL: Record<string, string> = {
  termo_gerado: "Termo gerado",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  registrado: "Registrado",
}
const STATUS_STYLE: Record<string, string> = {
  termo_gerado: "bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-300",
  aguardando_assinatura: "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300",
  assinado: "bg-primary/10 text-primary ring-primary/20",
  registrado: "bg-emerald-500/10 text-emerald-800 ring-emerald-600/20 dark:text-emerald-300",
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"
}

export function StatusBadge({ status }: { status?: string }) {
  const key = status ?? "termo_gerado"
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[key] ?? STATUS_STYLE.termo_gerado}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {STATUS_LABEL[key] ?? key}
    </span>
  )
}

function DocumentPreview({ blocks, signers, collaboratorName, singleSignature = false, hideCollaboratorLine = false }: { blocks: Block[]; signers: { label: string; nome: string }[]; collaboratorName: string; singleSignature?: boolean; hideCollaboratorLine?: boolean }) {
  return (
    <div className="mx-auto min-h-[700px] w-full max-w-[720px] bg-white px-6 py-8 text-slate-900 shadow-sm ring-1 ring-black/5 sm:px-12 sm:py-12">
      <div className="grid gap-2">
        {blocks.map((block, index) => {
          if (block.type === "spacer") return <div key={index} aria-hidden="true" style={{ height: `${Math.max(8, (block.size ?? 1) * 5)}px` }} />
          if (block.type === "title") return <h2 key={index} className="text-center text-lg font-bold leading-relaxed">{block.text}</h2>
          if (block.type === "heading") return <h3 key={index} className="text-sm font-bold leading-relaxed">{block.text}</h3>
          if (block.type === "field") return <p key={index} className="text-sm leading-relaxed"><strong>{block.label}: </strong>{block.value}</p>
          return <p key={index} className={`text-sm leading-relaxed ${block.type === "bullet" ? "pl-4" : ""}`}>{block.type === "bullet" ? "• " : ""}{block.text}</p>
        })}
      </div>
      <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
        {singleSignature ? (
          <div className="col-span-1"><div className="mb-2 border-t border-slate-700" /><p className="text-xs">{collaboratorName}</p></div>
        ) : (
          signers.map((signer, index) => (
            <div key={`${signer.label}-${index}`}>
              <div className="mb-2 border-t border-slate-700" />
              <p className="text-xs font-semibold">{signer.label}</p>
              {signer.nome && <p className="mt-1 text-xs">{signer.nome}</p>}
            </div>
          ))
        )}
      </div>
      {!singleSignature && !hideCollaboratorLine && (
        <div className="mt-12 max-w-[60%]"><div className="mb-2 border-t border-slate-700" /><p className="text-xs">{collaboratorName}</p></div>
      )}
    </div>
  )
}

export function TermPreview({ entry, onClose, initialTab = "responsabilidade" }: { entry: Entry; onClose: () => void; initialTab?: PreviewTab }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [tab, setTab] = useState<PreviewTab>(initialTab)

  const load = useCallback(async () => {
    setLoading(true)
    setProblem(null)
    try {
      const response = await fetch(`/api/termos/${entry.id}`, { cache: "no-store" })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(response.status === 401 ? "Sua sessão expirou. Entre novamente." : (body as { error?: string }).error ?? `Erro ${response.status} ao buscar o termo.`)
      }
      const data = (await response.json()) as Detail
      if (!data.termo) throw new Error("Este registro não tem o documento do termo salvo.")
      setDetail(data)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Não foi possível carregar o termo.")
    } finally {
      setLoading(false)
    }
  }, [entry.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const termo = detail?.termo
  const devolucao = detail?.devolucao ?? null
  const equipment = [detail?.tipo_label || entry.tipoLabel, detail?.marca || entry.marca, detail?.modelo || entry.modelo, detail?.specific_value || entry.specificValue].filter(Boolean).join(" · ")

  function download() {
    if (!termo) return
    const base = `${slugify(termo.equipamento.specificValue || entry.id) || entry.id}-${slugify(termo.colaborador.nome)}`
    if (tab === "devolucao" && devolucao) generateDevolucaoPdf(termo, devolucao).save(`termo-devolucao-${base}.pdf`)
    else generateTermoPdf(termo).save(`termo-${base}.pdf`)
  }

  const tabClass = (active: boolean) => `whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={`Termo de ${entry.nome}`} className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold uppercase tracking-wide">{entry.nome}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span>{equipment || "—"}</span>
              <span>Data: {detail?.data_termo || termo?.colaborador.data || entry.dataTermo || "—"}</span>
              <span>Gerado por: {detail?.created_by_nome || entry.createdByNome || "—"}</span>
              <StatusBadge status={detail?.status ?? entry.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-5" aria-hidden="true" /></button>
        </header>

        <div role="tablist" aria-label="Tipo de termo" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 sm:px-6">
          <button type="button" role="tab" aria-selected={tab === "responsabilidade"} onClick={() => setTab("responsabilidade")} className={tabClass(tab === "responsabilidade")}>Termo de Responsabilidade</button>
          <button type="button" role="tab" aria-selected={tab === "recebimento"} onClick={() => setTab("recebimento")} className={tabClass(tab === "recebimento")}>Termo de Recebimento</button>
          {devolucao && <button type="button" role="tab" aria-selected={tab === "devolucao"} onClick={() => setTab("devolucao")} className={tabClass(tab === "devolucao")}>Termo de Devolução</button>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 p-3 sm:p-6">
          {loading ? (
            <div role="status" aria-label="Carregando termo" className="mx-auto min-h-[60vh] max-w-[720px] animate-pulse rounded-md bg-card p-8">
              <div className="mb-6 h-6 w-3/4 rounded bg-muted" />
              <div className="grid gap-4">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-3 rounded bg-muted" />)}</div>
            </div>
          ) : problem || !termo ? (
            <div className="grid min-h-[40vh] place-content-center justify-items-center gap-3 text-center">
              <p className="max-w-sm text-sm text-destructive">{problem ?? "Não foi possível carregar o termo."}</p>
              <button type="button" onClick={() => void load()} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent">Tentar novamente</button>
            </div>
          ) : tab === "responsabilidade" ? (
            <DocumentPreview blocks={getTermoResponsabilidade(termo)} signers={termo.signers} collaboratorName={termo.colaborador.nome} />
          ) : tab === "devolucao" && devolucao ? (
            <DocumentPreview blocks={getTermoDevolucao(termo, devolucao)} signers={termo.signers} collaboratorName={termo.colaborador.nome} hideCollaboratorLine />
          ) : (
            <DocumentPreview blocks={getTermoRecebimento(termo)} signers={[]} collaboratorName={termo.colaborador.nome} singleSignature />
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-card p-4 sm:px-6">
          <button type="button" onClick={download} disabled={!termo || loading} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"><Download className="size-4" aria-hidden="true" />{tab === "devolucao" ? "Baixar devolução" : "Baixar PDF"}</button>
          <button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Fechar</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function toBr(iso: string) {
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}
export function shortDate(iso?: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR")
}

export function ReturnDialog({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [condition, setCondition] = useState<CondicaoDevolucao>("bom")
  const [notes, setNotes] = useState("")
  const [accessories, setAccessories] = useState(entry.acessorios ?? "")
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!date) { setProblem("Informe a data da devolução."); return }
    setSaving(true)
    setProblem(null)
    try {
      const response = await fetch(`/api/termos/${entry.id}/devolucao`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: toBr(date), condicao: condition, observacoes: notes, acessorios: accessories }) })
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Erro ${response.status}.`)
      onSaved()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Não foi possível registrar a devolução.")
      setSaving(false)
    }
  }

  const input = "w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Devolução de ${entry.nome}`} className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border p-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold uppercase tracking-wide">Registrar devolução</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{entry.nome} · {[entry.tipoLabel, entry.marca, entry.modelo].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-5" aria-hidden="true" /></button>
        </header>
        <div className="grid gap-4 overflow-y-auto p-4 sm:p-6">
          <label className="grid gap-1.5 text-sm font-medium">Data da devolução<input type="date" required value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} className={`${input} h-10`} /></label>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Condição do equipamento</legend>
            {(Object.keys(CONDICOES_DEVOLUCAO) as CondicaoDevolucao[]).map((key) => (
              <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${condition === key ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted"}`}>
                <input type="radio" name="condicao" value={key} checked={condition === key} onChange={() => setCondition(key)} className="size-4 accent-[var(--primary)]" />
                {CONDICOES_DEVOLUCAO[key]}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1.5 text-sm font-medium">Acessórios devolvidos<input value={accessories} maxLength={300} onChange={(event) => setAccessories(event.target.value)} placeholder="Ex.: carregador e cabo" className={`${input} h-10`} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Observações <span className="sr-only">(opcional)</span><textarea value={notes} maxLength={500} rows={3} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional. Ex.: pequeno risco na lateral." className={`${input} py-2`} /></label>
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-card p-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">{saving ? "Salvando..." : "Registrar devolução"}</button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

export function Historico() {
  const { entries, loaded, error, reload, remove, clearAll } = useLog()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<Entry | null>(null)
  const [selectedTab, setSelectedTab] = useState<PreviewTab>("responsabilidade")
  const [returning, setReturning] = useState<Entry | null>(null)
  const [situation, setSituation] = useState("")
  const closeReturn = useCallback(() => setReturning(null), [])
  const closePreview = useCallback(() => setSelected(null), [])
  const list = entries as Entry[]

  const types = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of list) if (!map.has(entry.tipo)) map.set(entry.tipo, entry.tipoLabel)
    return [...map.entries()]
  }, [list])

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return list.filter((entry) => {
      const text = `${entry.nome} ${entry.marca} ${entry.modelo} ${entry.specificValue} ${entry.nomeOutro} ${entry.createdByNome ?? ""}`.toLowerCase()
      const matchesSituation = !situation || (situation === "devolvidos" ? Boolean(entry.devolvido_em) : !entry.devolvido_em)
      return (!normalized || text.includes(normalized)) && (!filter || entry.tipo === filter) && matchesSituation
    })
  }, [list, filter, query, situation])

  function exportCsv() {
    const anchor = document.createElement("a")
    anchor.href = URL.createObjectURL(new Blob([entriesToCsv(entries)], { type: "text/csv;charset=utf-8" }))
    anchor.download = `termos-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  if (!loaded) return <div role="status" aria-label="Carregando histórico" className="grid gap-3"><div className="h-11 animate-pulse rounded-xl bg-muted" />{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
  if (error) return <div className="grid gap-3"><p className="text-destructive">{error}</p><button type="button" onClick={() => void reload()} className="w-fit rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">Tentar novamente</button></div>

  const field = "h-10 rounded-lg border border-input bg-card px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const ghost = "inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium shadow-xs hover:bg-accent disabled:opacity-40"

  return (
    <>
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Buscar no histórico</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input placeholder="Buscar por nome, marca, modelo, série ou gerador" value={query} onChange={(event) => setQuery(event.target.value)} className={`${field} w-full pl-9`} />
          </label>
          <select aria-label="Filtrar por tipo" value={filter} onChange={(event) => setFilter(event.target.value)} className={field}>
            <option value="">Todos os tipos</option>
            {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filtrar por situação" value={situation} onChange={(event) => setSituation(event.target.value)} className={field}>
            <option value="">Entregas e devoluções</option>
            <option value="emuso">Em uso</option>
            <option value="devolvidos">Devolvidos</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground tabular-nums">{rows.length}</strong> de {list.length} registros</p>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} disabled={!list.length} className={ghost}><FileSpreadsheet className="size-4" aria-hidden="true" />Exportar CSV</button>
            <button type="button" onClick={() => { if (window.confirm("Limpar todo o histórico? Esta ação não pode ser desfeita.")) void clearAll() }} disabled={!list.length} className={`${ghost} border-destructive/30 text-destructive hover:bg-destructive/10`}><Trash2 className="size-4" aria-hidden="true" />Limpar histórico</button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3.5">Colaborador</th>
                <th className="px-5 py-3.5">Equipamento</th>
                <th className="px-5 py-3.5">Gerado por</th>
                <th className="px-5 py-3.5">Data</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="sticky right-0 bg-muted/60 px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Nenhum termo encontrado.</td></tr>}
              {rows.map((entry) => (
                <tr key={entry.id} className="group transition-colors hover:bg-accent/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary ring-1 ring-primary/20" aria-hidden="true">{initials(entry.nome)}</span>
                      <p className="min-w-0 font-medium">{entry.nome}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{entry.tipoLabel}{entry.nomeOutro ? ` · ${entry.nomeOutro}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{[entry.marca, entry.modelo, entry.specificValue].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{entry.createdByNome || "—"}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-muted-foreground">{entry.dataTermo || "—"}</td>
                  <td className="px-5 py-3.5"><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={entry.status} />{entry.devolvido_em && <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20 dark:text-slate-300"><Undo2 className="size-3" aria-hidden="true" />Devolvido em {shortDate(entry.devolvido_em)}</span>}</div></td>
                  <td className="sticky right-0 bg-card px-5 py-3.5 group-hover:bg-accent/50">
                    <div className="flex items-center justify-end gap-1">
                      {!entry.devolvido_em && <button type="button" onClick={() => setReturning(entry)} aria-label={`Registrar devolução de ${entry.nome}`} title="Registrar devolução" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"><Undo2 className="size-4" aria-hidden="true" /></button>}
                      <button type="button" onClick={() => { setSelectedTab("responsabilidade"); setSelected(entry) }} aria-label={`Ver termo de ${entry.nome}`} title="Ver termo" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"><Eye className="size-4" aria-hidden="true" /></button>
                      <button type="button" onClick={() => { if (window.confirm("Excluir este registro?")) void remove(entry.id) }} aria-label={`Excluir termo de ${entry.nome}`} title="Excluir" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <TermPreview key={`${selected.id}-${selectedTab}`} entry={selected} initialTab={selectedTab} onClose={closePreview} />}
      {returning && <ReturnDialog entry={returning} onClose={closeReturn} onSaved={() => { const done = returning; setReturning(null); void reload(); setSelectedTab("devolucao"); setSelected(done) }} />}
    </>
  )
}
