import CandidatoResultsClient from '@/components/CandidatoResultsClient';
import { getCandidateData, getDataVersion } from '@/lib/data';

type Props = { params: Promise<{ nr: string }> };

export default async function CandidatoPage({ params }: Props) {
  const { nr } = await params;
  let data = null;
  try {
    data = await getCandidateData(nr);
  } catch {
    data = null;
  }
  const version = getDataVersion();
  if (!data) {
    return (
      <main className="container mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold">Candidato não encontrado</h1>
        <p className="mt-2 text-gray-600">Verifique o número ou nome e tente novamente.</p>
      </main>
    );
  }
  return <CandidatoResultsClient candidateNumber={nr} dataVersion={version} initialData={data} />;
}