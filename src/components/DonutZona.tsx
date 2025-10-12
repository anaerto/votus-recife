'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, Sector } from 'recharts';
import { useRef, useState } from 'react';
import { formatIntBR } from '@/lib/format';

type Props = { data: { name: string; value: number }[] };

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#84CC16', '#EC4899'];

export default function DonutZona({ data }: Props) {
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverSource, setHoverSource] = useState<'pie' | 'legend' | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getLegendTooltipPos = (idx: number) => {
    const el = wrapperRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const cx = w / 2;
    const cy = h / 2;
    const activeOuter = 108; // outerRadius(100) + active bump(8)
    const sumPrev = data.slice(0, idx).reduce((acc, d) => acc + d.value, 0);
    const value = data[idx]?.value ?? 0;
    const midRad = ((sumPrev + value / 2) / total) * Math.PI * 2; // radians, from +X axis
    const x = cx + (activeOuter + 12) * Math.cos(-midRad);
    const y = cy + (activeOuter + 12) * Math.sin(-midRad);
    return { x, y };
  };
  const [activeGeom, setActiveGeom] = useState<{ cx: number; cy: number; midAngle: number; outerRadius: number } | null>(null);
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const name = String(payload[0]?.name ?? '');
      const value = Number(payload[0]?.value ?? 0);
      return (
        <div className="bg-white border rounded-md p-2 text-[11px] leading-tight">
          <div className="font-bold">Zona {name}</div>
          <div className="text-[11px]">{formatIntBR(value)} votos</div>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    const payloadSorted = [...(payload || [])].sort((a, b) => {
      const va = Number(a.value);
      const vb = Number(b.value);
      const aSpecial = va === 149 || va === 150;
      const bSpecial = vb === 149 || vb === 150;
      if (aSpecial && !bSpecial) return 1;
      if (!aSpecial && bSpecial) return -1;
      return va - vb;
    });
    const row1 = payloadSorted.slice(0, 6);
    const row2 = payloadSorted.slice(6);
    const renderItem = (item: any, idx: number) => {
          const name: string = String(item.value ?? '');
          const matchIdx = data.findIndex((d) => String(d.name) === name);
          const active = hoverIdx === matchIdx;
      return (
        <div
          key={idx}
          className={`flex flex-col items-center cursor-pointer ${active ? 'opacity-100' : 'opacity-80'}`}
          onMouseEnter={() => {
            setHoverIdx(matchIdx >= 0 ? matchIdx : null);
            setHoverSource('legend');
          }}
          onMouseLeave={() => {
            setHoverIdx(null);
            setHoverSource(null);
          }}
        >
          <span
            className="block w-8 h-2 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-xs mt-1">{`Z-${name}`}</span>
        </div>
      );
    };
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap gap-3 justify-center">
          {row1.map((item: any, idx: number) => renderItem(item, idx))}
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          {row2.map((item: any, idx: number) => renderItem(item, idx + row1.length))}
        </div>
      </div>
    );
  };
  return (
    <div ref={wrapperRef} className="relative w-full h-80">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={100}
            paddingAngle={1}
            {...(function () {
              const interactiveProps: any = {
                activeIndex: hoverIdx !== null ? hoverIdx : undefined,
                activeShape: (props: any) => (
                  <Sector {...props} outerRadius={(props.outerRadius || 100) + 8} />
                ),
                onMouseEnter: (_: any, idx: number) => {
                  setHoverIdx(idx);
                  setHoverSource('pie');
                },
                onMouseLeave: () => {
                  setHoverIdx(null);
                  setHoverSource(null);
                },
              };
              return interactiveProps;
            })()}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                opacity={hoverIdx == null || hoverIdx === index ? 1 : 0.2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="bottom" align="center" content={CustomLegend as any} />
        </PieChart>
      </ResponsiveContainer>
      {hoverIdx != null && hoverSource === 'legend' && (() => {
        const { x, y } = getLegendTooltipPos(hoverIdx);
        const name = String(data[hoverIdx!]?.name ?? '');
        const value = Number(data[hoverIdx!]?.value ?? 0);
        return (
          <div
            className="absolute z-50 bg-white border rounded-md p-2 text-[11px] leading-tight pointer-events-none shadow"
            style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
          >
            <div className="font-bold">Zona {name}</div>
            <div className="text-[11px]">{formatIntBR(value)} votos</div>
          </div>
        );
      })()}
      <div className="text-sm text-gray-600 mt-2">Total: {formatIntBR(total)} votos</div>
    </div>
  );
}