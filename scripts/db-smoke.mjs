#!/usr/bin/env node
import { sql } from '@vercel/postgres';

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('Defina POSTGRES_URL no ambiente (.env.local ou via shell).');
    process.exit(1);
  }
  console.log('Executando smoke de banco...');
  const candResult = await sql`SELECT COUNT(*)::int AS count FROM candidatos`;
  const votosResult = await sql`SELECT COUNT(*)::int AS count FROM votos`;
  const candCount = candResult.rows[0].count;
  const votosCount = votosResult.rows[0].count;
  console.log(`candidatos: ${candCount} registros`);
  console.log(`votos: ${votosCount} registros`);

  const top = await sql`SELECT nr_votavel, nm_votavel, total_votos FROM candidatos ORDER BY total_votos DESC NULLS LAST LIMIT 5`;
  console.log('Top 5 candidatos por total_votos:');
  for (const r of top.rows) {
    console.log(` - ${r.nr_votavel} | ${r.nm_votavel} | ${r.total_votos}`);
  }

  // Uma agregação simples para garantir dados em votos
  const agg = await sql`SELECT nm_normalizado, SUM(votos)::int AS total FROM votos GROUP BY nm_normalizado ORDER BY total DESC LIMIT 5`;
  console.log('Top 5 nm_normalizado por votos:');
  for (const r of agg.rows) {
    console.log(` - ${r.nm_normalizado} | ${r.total}`);
  }

  console.log('Smoke OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});