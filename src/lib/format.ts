export function formatIntBR(n: number): string {
  const num = Number.isFinite(n) ? Math.trunc(n) : 0;
  const s = String(num);
  // insere pontos como separador de milhar, consistente em SSR e cliente
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}