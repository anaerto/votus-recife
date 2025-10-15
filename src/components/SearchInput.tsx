'use client';

import { useEffect, useState, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';

type Option = { label: string; value: string; searchTokens: string[] };

export default function SearchInput({ optionsAll }: { optionsAll: Option[] }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const deferredOptions = useDeferredValue(options);

  const norm = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setOptions([]);
      return;
    }
    const t = setTimeout(() => {
      const qnorm = norm(query);
      const results = optionsAll
        .filter((o) => o.searchTokens.some((t) => t.startsWith(qnorm)) || o.value.startsWith(query))
        .slice(0, 10);
      setOptions(results);
      setOpen(results.length > 0);
      // Prefetch das principais opções para navegação mais rápida
      results.slice(0, 5).forEach((opt) => {
        try {
          router.prefetch(`/candidato/${encodeURIComponent(opt.value)}`);
        } catch {}
      });
    }, 120);
    return () => {
      clearTimeout(t);
    };
  }, [query, optionsAll, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    // aceita número do candidato diretamente
    router.push(`/candidato/${encodeURIComponent(query)}`);
  };

  const onSelect = (opt: Option) => {
    router.push(`/candidato/${encodeURIComponent(opt.value)}`);
  };

  return (
    <div className="relative max-w-2xl mx-auto text-left mt-[20vh]" suppressHydrationWarning>
      <div className="bg-[#00a0c1] px-4 sm:px-8 md:px-16 lg:px-28 py-6 sm:py-8 md:py-12 lg:py-18 pt-8 sm:pt-12 md:pt-16 rounded-lg shadow-lg">
        <label className="block text-left mb-6 text-sm text-white font-medium">
          Selecione um candidato
        </label>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(options.length > 0)}
            onBlur={() => setTimeout(() => setOpen(false), 100)}
            placeholder="Digite um nome ou número"
            aria-label="Digite um nome ou número do candidato"
            className="w-full rounded-md border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
          />
        </form>
      </div>
      {/* Busca local otimizada sem chamadas de rede */}
      {open && (
        <ul className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto text-left">
          {deferredOptions.map((opt) => (
            <li
              key={opt.value}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-left"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => {
                try {
                  router.prefetch(`/candidato/${encodeURIComponent(opt.value)}`);
                } catch {}
              }}
              onClick={() => onSelect(opt)}
            >
              {opt.label}
            </li>
          ))}
          {deferredOptions.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">Nenhum resultado</li>
          )}
        </ul>
      )}
    </div>
  );
}