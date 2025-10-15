'use client';

import { useEffect, useMemo, useState } from 'react';
import DonutZona from '@/components/DonutZona';
import FilterVotes from '@/components/FilterVotes';
import { formatIntBR } from '@/lib/format';
import type { CandidateData } from '@/lib/types';
import { loadResult, saveResult } from '@/lib/cache';
import { useRouter } from 'next/navigation';

type Props = {
  candidateNumber: string;
  dataVersion: string;
  initialData?: CandidateData | null;
};

export default function CandidatoResultsClient({ candidateNumber, dataVersion, initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CandidateData | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(false);
  const cacheKey = useMemo(() => `candidato_analise_${candidateNumber}`, [candidateNumber]);
  const TTL_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    try {
      router.prefetch('/');
    } catch {}

    let mounted = true;
    (async () => {
      const cached = await loadResult<CandidateData>(cacheKey, dataVersion, TTL_7_DAYS_MS);
      if (cached && mounted) {
        setData(cached);
        setLoading(false);
        return;
      }
      if (initialData) {
        setData(initialData);
        saveResult(cacheKey, initialData, dataVersion).catch(() => {});
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/candidato?q=${encodeURIComponent(candidateNumber)}`);
        if (!res.ok) throw new Error('Falha ao obter dados do candidato');
        const payload = (await res.json()) as CandidateData;
        if (mounted) {
          setData(payload);
          saveResult(cacheKey, payload, dataVersion).catch(() => {});
        }
      } catch {
        // no-op
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, dataVersion]);

  if (!data) {
    return (
      <main className="container mx-auto px-4 py-10">
        {loading ? (
          <div className="text-gray-600">Processando análise do candidato...</div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Candidato não encontrado</h1>
            <p className="mt-2 text-gray-600">Verifique o número ou nome e tente novamente.</p>
          </>
        )}
      </main>
    );
  }

  const { candidato, rankingGeralPosicao, rankingGeralTotal, donutPorZona, recordes, mapas } = data;

  return (
    <main className="container mx-auto px-4 py-8">
      <section>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">{candidato.nmVotavel}</h1>
          <button
            type="button"
            aria-label="Nova consulta"
            className="px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-100"
            onClick={() => {
              try {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                  return;
                }
              } catch {}
              router.push('/');
            }}
          >
            Nova consulta
          </button>
        </div>
        <p className="text-gray-600">Urna: {candidato.nmUrna} • Número: {candidato.nrVotavel} • Partido: {candidato.partido}</p>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          <div className="rounded-md border p-4">
            <div className="text-sm text-gray-500">Total de votos</div>
            <div className="text-2xl font-bold">{formatIntBR(candidato.totalVotos)}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-sm text-gray-500">Resultado</div>
            <div className="text-2xl font-bold">{candidato.resultado}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-sm text-gray-500">Posição no ranking geral</div>
            <div className="text-2xl font-bold">{rankingGeralPosicao} / {rankingGeralTotal}</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Maior Votação por Abrangência</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {recordes.zona && (
            <div className="rounded-md border p-4">
              <div className="text-sm text-gray-500">Zona Eleitoral</div>
              <div className="text-lg">{recordes.zona.nome}</div>
              <div className="text-xl font-bold">{formatIntBR(recordes.zona.votos)} votos</div>
              <div className="text-sm text-gray-600">Ranking: {recordes.zona.posicao} / {recordes.zona.total}</div>
            </div>
          )}
          {recordes.secao && (
            <div className="rounded-md border p-4">
              <div className="text-sm text-gray-500">Seção Eleitoral</div>
              <div className="text-lg">{recordes.secao.nome}</div>
              <div className="text-xl font-bold">{formatIntBR(recordes.secao.votos)} votos</div>
              <div className="text-sm text-gray-600">Ranking: {recordes.secao.posicao} / {recordes.secao.total}</div>
            </div>
          )}
          {recordes.bairro && (
            <div className="rounded-md border p-4">
              <div className="text-sm text-gray-500">Bairro</div>
              <div className="text-lg">{recordes.bairro.nome}</div>
              <div className="text-xl font-bold">{formatIntBR(recordes.bairro.votos)} votos</div>
              <div className="text-sm text-gray-600">Ranking: {recordes.bairro.posicao} / {recordes.bairro.total}</div>
            </div>
          )}
          {recordes.local && (
            <div className="rounded-md border p-4">
              <div className="text-sm text-gray-500">Local de Votação</div>
              <div className="text-lg">{recordes.local.nome}</div>
              <div className="text-xl font-bold">{formatIntBR(recordes.local.votos)} votos</div>
              <div className="text-sm text-gray-600">Ranking: {recordes.local.posicao} / {recordes.local.total}</div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Distribuição de votos por Zona</h2>
        <div className="mt-4">
          <DonutZona data={donutPorZona} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Filtros</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-6">
          <FilterVotes titulo="Bairro" mapa={mapas.votosPorBairro} />
          <FilterVotes titulo="Local de Votação" mapa={mapas.votosPorLocal} />
        </div>
      </section>
    </main>
  );
}