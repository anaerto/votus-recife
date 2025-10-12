import SearchInput from "@/components/SearchInput";
import { getSearchOptions } from "@/lib/data";

export default function Home() {
  const optionsAll = getSearchOptions();
  return (
    <main className="min-h-svh">
      <section className="py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-semibold">VOTUS Recife — Consulta por Candidato</h1>
          <p className="mt-2 text-gray-600">Digite o Nome de Urna ou o Número do candidato para iniciar.</p>
          <div className="mt-6">
            <SearchInput optionsAll={optionsAll} />
          </div>
        </div>
      </section>
    </main>
  );
}
