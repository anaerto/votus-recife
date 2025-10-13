export type Candidato = {
  nrVotavel: string;
  nmVotavel: string;
  nmUrna: string;
  partido: string;
  resultado: string;
  totalVotos: number;
};

export type Voto = {
  nmVotavel: string;
  zona: string;
  bairro: string;
  local: string;
  secao: string;
  votos: number;
};

export type CandidateData = {
  candidato: Candidato;
  rankingGeralPosicao: number;
  rankingGeralTotal: number;
  donutPorZona: { name: string; value: number }[];
  recordes: {
    zona: { nome: string; votos: number; posicao: number; total: number } | null;
    secao: { nome: string; votos: number; posicao: number; total: number } | null;
    bairro: { nome: string; votos: number; posicao: number; total: number } | null;
    local: { nome: string; votos: number; posicao: number; total: number } | null;
  };
  mapas: {
    votosPorBairro: Record<string, number>;
    votosPorLocal: Record<string, number>;
  };
};

export type DataCache = {
  candidatos: Candidato[];
  votos: Voto[];
  candidatosPorNome: Map<string, Candidato>;
  candidatosPorNumero: Map<string, Candidato>;
  autocompleteIndex?: Map<string, { label: string; value: string }[]>;
};