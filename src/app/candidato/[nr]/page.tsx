import CandidatoResultsClient from '@/components/CandidatoResultsClient';
import { getCandidateData, getDataVersion } from '@/lib/data';

type Props = { params: { nr: string } };

export default function CandidatoPage({ params }: Props) {
  const { nr } = params;
  const data = getCandidateData(nr);
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