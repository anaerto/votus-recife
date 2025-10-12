'use client';

import { useMemo, useState, useDeferredValue } from 'react';
import { formatIntBR } from '@/lib/format';

export default function FilterVotes({ titulo, mapa }: { titulo: string; mapa: Record<string, number> }) {
  const nomes = useMemo(() => Object.keys(mapa).sort(), [mapa]);
  const [selecionado, setSelecionado] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);

  const norm = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q || q.length < 1) return nomes.slice(0, 10);
    const tokenStartsWith = (s: string, q: string) =>
      norm(s)
        .split(/[^a-z0-9]+/g)
        .filter(Boolean)
        .some((t) => t.startsWith(q));
    return nomes.filter((n) => tokenStartsWith(n, q)).slice(0, 10);
  }, [nomes, query]);
  const deferredFiltered = useDeferredValue(filtered);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    // seleciona a correspondência exata ou a primeira sugestão
    const exact = nomes.find((n) => n === query);
    const pick = exact ?? filtered[0];
    if (pick) {
      setSelecionado(pick);
      setQuery('');
      setOpen(false);
    }
  };

  return (
    <div className="rounded-md border p-4">
      <div className="text-sm text-gray-500">{titulo}</div>
      <div className="mt-2 relative">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            placeholder={`Digite para filtrar ${titulo.toLowerCase()}`}
            className="w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring focus:border-blue-500"
          />
        </form>
        {open && (
          <ul className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-md shadow max-h-64 overflow-auto">
            {deferredFiltered.map((n) => (
              <li
                key={n}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSelecionado(n);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 text-gray-700">
        {selecionado && (
          <span>
            {selecionado}: <strong>{formatIntBR(mapa[selecionado] || 0)}</strong> VOTOS
          </span>
        )}
      </div>
      {/* Lista abaixo do resultado removida conforme solicitação */}
    </div>
  );
}