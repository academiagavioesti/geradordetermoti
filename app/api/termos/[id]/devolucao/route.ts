import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { CONDICOES_DEVOLUCAO } from "@/lib/termos"

export const dynamic = "force-dynamic"
const out = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
const text = (value: unknown, max: number) => (typeof value === "string" && value.length <= max ? value.trim() : null)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return out({ error: "Não autenticado." }, 401)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const data = text(body?.data, 20)
  const observacoes = text(body?.observacoes ?? "", 500)
  const acessorios = text(body?.acessorios ?? "", 300)
  const condicao = body?.condicao
  if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data) || observacoes === null || acessorios === null || !(condicao in CONDICOES_DEVOLUCAO)) return out({ error: "Dados da devolução inválidos." }, 400)
  const { data: updated, error } = await supabase.from("termos").update({ devolucao: { data, condicao, observacoes, acessorios }, devolvido_em: new Date().toISOString() }).eq("id", id).select("id,devolvido_em").single()
  if (error || !updated) return out({ error: "Não foi possível registrar a devolução." }, 400)
  return out({ ok: true, devolvidoEm: updated.devolvido_em })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return out({ error: "Não autenticado." }, 401)
  const { id } = await params
  const { error } = await supabase.from("termos").update({ devolucao: null, devolvido_em: null }).eq("id", id)
  if (error) return out({ error: "Não foi possível desfazer a devolução." }, 400)
  return out({ ok: true })
}
