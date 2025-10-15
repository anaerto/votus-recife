import { sql } from '@vercel/postgres';

// Reexport do cliente SQL da Vercel Postgres
export { sql };

// Normalização para joins e filtros consistentes
export function norm(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}