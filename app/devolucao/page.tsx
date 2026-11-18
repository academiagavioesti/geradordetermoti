import { Devolucao } from "@/components/devolucao"
import { PageHeader } from "@/components/page-header"

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <PageHeader title="Termo de devolução" description="Escolha o equipamento devolvido, registre a condição e baixe o termo na hora." />
      <Devolucao />
    </div>
  )
}
