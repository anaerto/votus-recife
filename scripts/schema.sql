-- Schema para Vercel Postgres (Neon)

CREATE TABLE IF NOT EXISTS candidatos (
  nr_votavel INTEGER PRIMARY KEY,
  nm_votavel TEXT NOT NULL,
  nm_urna TEXT NOT NULL,
  sg_partido TEXT,
  resultado TEXT,
  total_votos INTEGER NOT NULL DEFAULT 0,
  nm_normalizado TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votos (
  id BIGSERIAL PRIMARY KEY,
  nm_votavel TEXT NOT NULL,
  nm_normalizado TEXT NOT NULL,
  zona TEXT NOT NULL,
  bairro TEXT,
  local TEXT,
  secao TEXT,
  votos INTEGER NOT NULL
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_cand_nm_norm ON candidatos (nm_normalizado);
CREATE INDEX IF NOT EXISTS idx_votos_nm_norm ON votos (nm_normalizado);
CREATE INDEX IF NOT EXISTS idx_votos_zona ON votos (zona);
CREATE INDEX IF NOT EXISTS idx_votos_bairro ON votos (bairro);
CREATE INDEX IF NOT EXISTS idx_votos_local ON votos (local);
CREATE INDEX IF NOT EXISTS idx_votos_secao ON votos (secao);