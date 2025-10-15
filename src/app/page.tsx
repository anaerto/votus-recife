import SearchInput from "@/components/SearchInput";
import { getSearchOptions } from "@/lib/data";

export default async function Home() {
  const optionsAll = await getSearchOptions();
  return (
    <main className="min-h-svh">
      <section className="py-16 bg-gradient-to-b from-blue-50 to-transparent">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h1 className="text-4xl font-semibold">VOTUS Recife — Consulta por Candidato</h1>
          <p className="mt-3 text-gray-600">
            Digite o Nome de Urna ou o Número do candidato para iniciar.
          </p>
          <div className="mt-8">
            <SearchInput optionsAll={optionsAll} />
          </div>
        </div>
      </section>
    </main>
  );
}