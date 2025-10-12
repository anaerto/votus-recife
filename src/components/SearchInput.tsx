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
      .toLowerCase();

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
    <div className="relative max-w-xl mx-auto">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(options.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
          placeholder="Busque por Nome de Urna ou Número"
          className="w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring focus:border-blue-500"
        />
      </form>
      {/* Busca local otimizada sem chamadas de rede */}
      {open && (
        <ul className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-md shadow max-h-64 overflow-auto">
          {deferredOptions.map((opt) => (
            <li
              key={opt.value}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
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
        </ul>
      )}
    </div>
  );
}