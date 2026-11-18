"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Clock, FileText, Layers, Sparkles, TrendingDown, TrendingUp } from "lucide-react"
import { useLog, type LogEntry } from "@/lib/log"

type Entry = LogEntry & { status?: string; status_changed_at?: string }
type Period = "7" | "30" | "90" | "365"
type Point = { label: string; value: number }

const DAY = 86400000
const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
]
const STAGES = [
  { key: "termo_gerado", label: "Termo gerado", color: "#94a3b8" },
  { key: "aguardando_assinatura", label: "Aguardando assinatura", color: "#f59e0b" },
  { key: "assinado", label: "Assinado", color: "#f58a8a" },
  { key: "registrado", label: "Registrado no sistema", color: "#10b981" },
] as const
const STATUS_STYLE: Record<string, string> = {
  termo_gerado: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  aguardando_assinatura: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  assinado: "bg-primary/10 text-primary",
  registrado: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
}
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((stage) => [stage.key, stage.label]))
const DONUT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#9aa8bc"]
const HEADING_FONT = { fontFamily: "var(--font-barlow-condensed), sans-serif" }

function ts(value?: string) {
  const time = value ? new Date(value).getTime() : Number.NaN
  return Number.isNaN(time) ? 0 : time
}
function equipmentName(entry: Entry) {
  return entry.tipoLabel === "Outros" && entry.nomeOutro ? entry.nomeOutro : entry.tipoLabel
}
function pad(value: number) {
  return String(value).padStart(2, "0")
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}
function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0
}
function variation(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}
function countBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, number>()
  for (const item of items) {
    const name = key(item).trim() || "Não informado"
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}
function buildSeries(items: Entry[], period: Period): Point[] {
  const now = new Date()
  const counts = new Map<string, number>()
  if (period === "365") {
    for (const item of items) {
      const key = monthKey(new Date(item.createdAt))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1)
      return { label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), value: counts.get(monthKey(date)) ?? 0 }
    })
  }
  const total = Number(period)
  for (const item of items) {
    const key = dayKey(new Date(item.createdAt))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (total - 1 - index))
    return { label: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`, value: counts.get(dayKey(date)) ?? 0 }
  })
}
function niceMax(value: number) {
  if (value <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / step) * step
}
function smoothPath(points: [number, number][]) {
  const count = points.length
  if (count < 2) return ""
  const widths: number[] = []
  const slopes: number[] = []
  for (let index = 0; index < count - 1; index++) {
    widths.push(points[index + 1][0] - points[index][0] || 1)
    slopes.push((points[index + 1][1] - points[index][1]) / widths[index])
  }
  const tangents: number[] = new Array(count).fill(0)
  tangents[0] = slopes[0]
  tangents[count - 1] = slopes[count - 2]
  for (let index = 1; index < count - 1; index++) {
    const before = slopes[index - 1]
    const after = slopes[index]
    tangents[index] = before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  }
  for (let index = 0; index < count - 1; index++) {
    if (slopes[index] === 0) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    const a = tangents[index] / slopes[index]
    const b = tangents[index + 1] / slopes[index]
    const sum = a * a + b * b
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum)
      tangents[index] = scale * a * slopes[index]
      tangents[index + 1] = scale * b * slopes[index]
    }
  }
  let path = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let index = 0; index < count - 1; index++) {
    const third = widths[index] / 3
    const [x1, y1] = points[index]
    const [x2, y2] = points[index + 1]
    path += ` C${(x1 + third).toFixed(1)} ${(y1 + tangents[index] * third).toFixed(1)} ${(x2 - third).toFixed(1)} ${(y2 - tangents[index + 1] * third).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }
  return path
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"
}

function Card({ title, description, action, className = "", children }: { title: string; description?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold uppercase tracking-wide"><span className="h-4 w-1 rounded-full bg-primary" aria-hidden="true" />{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="grid flex-1 place-items-center rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>
}
function LinkAction({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
}

function Sparkline({ points }: { points: Point[] }) {
  const width = 120
  const height = 36
  const max = Math.max(1, ...points.map((point) => point.value))
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const coords = points.map((point, index) => [index * step, height - 3 - (point.value / max) * (height - 8)] as [number, number])
  if (coords.length < 2) return null
  const line = smoothPath(coords)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="kpi-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill="url(#kpi-spark)" />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Kpi({ icon: Icon, label, value, note, trend, spark, className = "" }: { icon: typeof FileText; label: string; value: string; note?: string; trend?: number | null; spark?: Point[]; className?: string }) {
  const up = (trend ?? 0) >= 0
  const TrendIcon = up ? TrendingUp : TrendingDown
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-[18px]" aria-hidden="true" /></span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-4xl font-semibold leading-none tabular-nums" style={HEADING_FONT}>{value}</p>
        {spark && <div className="w-24 shrink-0"><Sparkline points={spark} /></div>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {trend !== undefined && trend !== null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${up ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
            <TrendIcon className="size-3" aria-hidden="true" />{up ? "+" : ""}{trend}%
          </span>
        )}
        {note && <span>{note}</span>}
      </div>
    </div>
  )
}

function AreaChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 230
  const left = 34
  const right = 12
  const top = 16
  const bottom = 26
  const base = height - bottom
  const max = niceMax(Math.max(0, ...points.map((point) => point.value)))
  const stepX = points.length > 1 ? (width - left - right) / (points.length - 1) : 0
  const x = (index: number) => left + index * stepX
  const y = (value: number) => top + (base - top) * (1 - value / max)
  const coords = points.map((point, index) => [x(index), y(point.value)] as [number, number])
  const line = smoothPath(coords)
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`
  const every = Math.max(1, Math.ceil(points.length / 7))
  const total = points.reduce((sum, point) => sum + point.value, 0)
  const active = hover === null ? null : points[hover]
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Termos gerados ao longo do tempo: ${total} no período`} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="dash-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (max / 4) * tick
          return (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 5"} />
              <text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{Math.round(value)}</text>
            </g>
          )
        })}
        {points.length > 1 && <path d={area} fill="url(#dash-area)" />}
        {points.length > 1 && <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((point, index) => index % every === 0 || index === points.length - 1 ? <text key={`${point.label}-${index}`} x={x(index)} y={height - 7} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted-foreground)">{point.label}</text> : null)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={base} stroke="var(--chart-1)" strokeOpacity="0.35" strokeDasharray="3 3" />}
        {hover !== null && <circle cx={x(hover)} cy={y(points[hover].value)} r="5" fill="var(--card)" stroke="var(--chart-1)" strokeWidth="2.75" />}
        {points.map((point, index) => <rect key={`hit-${index}`} x={x(index) - Math.max(stepX / 2, 6)} y={top} width={Math.max(stepX, 12)} height={base - top} fill="transparent" onMouseEnter={() => setHover(index)} />)}
      </svg>
      {active && hover !== null && (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-lg" style={{ left: `${Math.min(Math.max((x(hover) / width) * 100, 8), 92)}%` }}>
          <p className="font-semibold tabular-nums">{active.value} {active.value === 1 ? "termo" : "termos"}</p>
          <p className="text-muted-foreground">{active.label}</p>
        </div>
      )}
    </div>
  )
}

function Donut({ slices }: { slices: [string, number][] }) {
  const total = slices.reduce((sum, [, value]) => sum + value, 0)
  const radius = 62
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-label={`Equipamentos mais entregues: ${slices.map(([name, value]) => `${name} ${value}`).join(", ")}`}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--muted)" strokeWidth="18" />
        {slices.map(([name, value], index) => {
          const length = (value / total) * circumference
          const circle = <circle key={name} cx="80" cy="80" r={radius} fill="none" stroke={DONUT_COLORS[index % DONUT_COLORS.length]} strokeWidth="18" strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />
          offset += length
          return circle
        })}
        <text x="80" y="82" textAnchor="middle" fontSize="32" fontWeight="600" fill="var(--foreground)" style={HEADING_FONT}>{total}</text>
        <text x="80" y="100" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">termos</text>
      </svg>
      <ul className="grid w-full min-w-0 gap-2 text-sm">
        {slices.map(([name, value], index) => (
          <li key={name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
            <span className="tabular-nums text-muted-foreground">{percent(value, total)}%</span>
            <span className="w-8 text-right font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Bars({ items, total, colors }: { items: [string, number][]; total: number; colors?: string[] }) {
  const max = Math.max(1, ...items.map(([, value]) => value))
  return (
    <ul className="grid gap-3.5">
      {items.map(([name, value], index) => (
        <li key={name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              {colors && <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[index] }} aria-hidden="true" />}
              <span className="truncate" title={name}>{name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground"><strong className="text-foreground">{value}</strong> · {percent(value, total)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(value / max) * 100}%`, background: colors ? colors[index] : "linear-gradient(90deg, var(--chart-1), var(--chart-3))" }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function DashboardView({ entries }: { entries: Entry[] }) {
  const [period, setPeriod] = useState<Period>("30")
  const data = useMemo(() => {
    const now = Date.now()
    const span = Number(period) * DAY
    const current = entries.filter((entry) => now - ts(entry.createdAt) <= span)
    const previous = entries.filter((entry) => { const age = now - ts(entry.createdAt); return age > span && age <= span * 2 })
    const registered = current.filter((entry) => entry.status === "registrado")
    const durations = registered.filter((entry) => ts(entry.status_changed_at) > ts(entry.createdAt)).map((entry) => (ts(entry.status_changed_at) - ts(entry.createdAt)) / DAY)
    const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null
    const waiting = entries.filter((entry) => entry.status === "aguardando_assinatura")
    const late = waiting.map((entry) => ({ entry, days: Math.floor((now - ts(entry.status_changed_at || entry.createdAt)) / DAY) })).filter((item) => item.days > 3).sort((a, b) => b.days - a.days)
    const equipment = countBy(current, equipmentName)
    const top = equipment.slice(0, 5)
    const rest = equipment.slice(5).reduce((sum, [, value]) => sum + value, 0)
    return {
      current,
      variation: variation(current.length, previous.length),
      series: buildSeries(current, period),
      registered: registered.length,
      average,
      waiting: waiting.length,
      late,
      equipmentCount: equipment.length,
      slices: (rest ? [...top, ["Outros", rest]] : top) as [string, number][],
      stages: STAGES.map((stage) => [stage.label, entries.filter((entry) => (entry.status ?? "termo_gerado") === stage.key).length] as [string, number]),
      units: countBy(current, (entry) => entry.unidade).slice(0, 8),
      people: countBy(current, (entry) => entry.createdByNome ?? "").slice(0, 5),
      latest: entries.slice(0, 6),
    }
  }, [entries, period])
  const total = data.current.length
  const headline = data.late.length > 0
    ? `${data.late.length} ${data.late.length === 1 ? "termo aguarda" : "termos aguardam"} assinatura há mais de 3 dias`
    : data.waiting > 0
      ? `${data.waiting} ${data.waiting === 1 ? "termo aguarda" : "termos aguardam"} assinatura, sem atrasos`
      : "Tudo em dia: nenhum termo aguardando assinatura"
  return (
    <div className="grid gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#b91c1c] p-5 text-white shadow-sm sm:p-6">
        <span className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-white/10" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-20 right-24 size-40 rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/80"><Sparkles className="size-3.5" aria-hidden="true" />Resumo</p>
            <p className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl" style={HEADING_FONT}>{headline}</p>
            <p className="mt-1 text-sm text-white/80">{entries.length} {entries.length === 1 ? "termo registrado" : "termos registrados"} no total.</p>
          </div>
          <Link href="/quadro" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">Abrir quadro<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Período" className="inline-flex rounded-xl border border-border bg-muted p-1">
          {PERIODS.map((item) => <button key={item.value} type="button" aria-pressed={period === item.value} onClick={() => setPeriod(item.value)} className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${period === item.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}
        </div>
        <LinkAction href="/historico">Ver histórico completo</LinkAction>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={FileText} label="Termos no período" value={String(total)} trend={data.variation} note={data.variation === null ? "Sem período anterior" : "vs. anterior"} spark={data.series} />
        <Kpi icon={Clock} label="Aguardando assinatura" value={String(data.waiting)} note={data.late.length ? `${data.late.length} há mais de 3 dias` : "Nenhuma atrasada"} />
        <Kpi icon={CheckCircle2} label="Registrados" value={String(data.registered)} note={`${percent(data.registered, total)}% do período`} />
        <Kpi icon={Clock} label="Tempo até registrar" value={data.average === null ? "—" : `${data.average.toFixed(1).replace(".", ",")} d`} note="pela última mudança de etapa" />
        <Kpi icon={Layers} label="Equipamentos" value={String(data.equipmentCount)} note="tipos diferentes" className="col-span-2 md:col-span-1" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card title="Termos gerados" description={period === "365" ? "Por mês, nos últimos 12 meses." : "Por dia, no período selecionado."} className="lg:col-span-8">
          {total === 0 ? <Empty>Nenhum termo gerado neste período.</Empty> : <AreaChart points={data.series} />}
        </Card>
        <Card title="Equipamentos mais entregues" description="Distribuição no período." className="lg:col-span-4">
          {total === 0 ? <Empty>Sem dados no período.</Empty> : <Donut slices={data.slices} />}
        </Card>

        <Card title="Andamento dos termos" description="Etapa atual de todos os termos." className="lg:col-span-6">
          {entries.length === 0 ? <Empty>Nenhum termo gerado ainda.</Empty> : <Bars items={data.stages} total={entries.length} colors={STAGES.map((stage) => stage.color)} />}
        </Card>
        <Card title="Termos por unidade" description="As 8 unidades com mais termos no período." className="lg:col-span-6">
          {data.units.length === 0 ? <Empty>Sem dados no período.</Empty> : <Bars items={data.units} total={total} />}
        </Card>

        <Card title="Quem mais gera" description="Ranking no período." className="lg:col-span-4">
          {data.people.length === 0 ? <Empty>Sem dados no período.</Empty> : (
            <ul className="grid gap-3.5">
              {data.people.map(([name, value], index) => (
                <li key={name} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary ring-1 ring-primary/20" aria-hidden="true">{initials(name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={name}>{index + 1}. {name}</p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(value / Math.max(1, data.people[0][1])) * 100}%` }} /></div>
                  </div>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums">{value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Atenção" description="Aguardando assinatura há mais de 3 dias." className="lg:col-span-4" action={data.late.length > 0 ? <LinkAction href="/quadro">Abrir quadro</LinkAction> : undefined}>
          {data.late.length === 0 ? <Empty>Nenhuma pendência atrasada.</Empty> : (
            <ul className="divide-y divide-border">
              {data.late.slice(0, 5).map(({ entry, days }) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="truncate font-medium">{entry.nome}</p><p className="truncate text-xs text-muted-foreground">{equipmentName(entry)}</p></div>
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-300">há {days} dias</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Últimos termos" className="lg:col-span-4" action={<LinkAction href="/historico">Ver tudo</LinkAction>}>
          {data.latest.length === 0 ? <Empty>Nenhum termo gerado ainda.</Empty> : (
            <ul className="divide-y divide-border">
              {data.latest.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0"><p className="truncate font-medium">{entry.nome}</p><p className="truncate text-xs text-muted-foreground">{equipmentName(entry)} · {new Date(entry.createdAt).toLocaleDateString("pt-BR")}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[entry.status ?? "termo_gerado"] ?? STATUS_STYLE.termo_gerado}`}>{STATUS_LABEL[entry.status ?? "termo_gerado"] ?? entry.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export function Dashboard() {
  const { entries, loaded, error, reload } = useLog()
  if (!loaded) return <div className="grid gap-4" role="status" aria-label="Carregando painel"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="h-10 w-64 animate-pulse rounded-xl bg-muted" /><div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-muted" />)}</div><div className="grid gap-4 lg:grid-cols-12"><div className="h-72 animate-pulse rounded-2xl bg-muted lg:col-span-8" /><div className="h-72 animate-pulse rounded-2xl bg-muted lg:col-span-4" /></div></div>
  if (error) return <div className="grid gap-3"><p className="text-destructive">{error}</p><button type="button" onClick={() => void reload()} className="w-fit rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Tentar novamente</button></div>
  return <DashboardView entries={entries as Entry[]} />
}
