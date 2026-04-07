import { useMemo } from 'react';
import type { ControlRecord } from '@/types/data';

// Real Portugal districts GeoJSON-simplified paths (mainland)
// Each district: id, name, simplified SVG path, label position
const DISTRICTS: { id: string; name: string; path: string; cx: number; cy: number; postalPrefixes: string[] }[] = [
  { id: 'braga', name: 'Braga', path: 'M72,48 L82,42 L92,46 L96,56 L88,64 L78,62 L70,56Z', cx: 82, cy: 54, postalPrefixes: ['47', '48'] },
  { id: 'viana', name: 'Viana do Castelo', path: 'M55,30 L68,26 L78,32 L82,42 L72,48 L70,56 L60,52 L52,42Z', cx: 66, cy: 40, postalPrefixes: ['49'] },
  { id: 'vila_real', name: 'Vila Real', path: 'M82,42 L96,36 L110,40 L112,52 L96,56 L92,46Z', cx: 98, cy: 46, postalPrefixes: ['50', '51'] },
  { id: 'braganca', name: 'Bragança', path: 'M96,36 L110,28 L128,26 L134,38 L126,48 L112,52 L110,40Z', cx: 116, cy: 38, postalPrefixes: ['52', '53'] },
  { id: 'porto', name: 'Porto', path: 'M60,52 L70,56 L78,62 L88,64 L90,74 L80,80 L68,78 L58,68Z', cx: 74, cy: 68, postalPrefixes: ['40', '41', '42', '43', '44', '45'] },
  { id: 'aveiro', name: 'Aveiro', path: 'M58,68 L68,78 L80,80 L82,92 L74,100 L60,96 L52,86Z', cx: 68, cy: 86, postalPrefixes: ['38', '34'] },
  { id: 'viseu', name: 'Viseu', path: 'M80,80 L90,74 L88,64 L96,56 L112,52 L118,66 L112,80 L98,88 L82,92Z', cx: 98, cy: 72, postalPrefixes: ['35', '36', '54'] },
  { id: 'guarda', name: 'Guarda', path: 'M112,52 L126,48 L134,38 L142,52 L138,68 L128,80 L118,78 L112,80 L118,66Z', cx: 128, cy: 62, postalPrefixes: ['62', '63'] },
  { id: 'coimbra', name: 'Coimbra', path: 'M52,86 L60,96 L74,100 L82,92 L98,88 L100,102 L90,112 L72,110 L58,104Z', cx: 78, cy: 100, postalPrefixes: ['30', '31', '32', '33'] },
  { id: 'castelo_branco', name: 'Castelo Branco', path: 'M98,88 L112,80 L128,80 L138,68 L142,52 L148,68 L146,90 L138,104 L120,110 L100,102Z', cx: 124, cy: 88, postalPrefixes: ['60', '61'] },
  { id: 'leiria', name: 'Leiria', path: 'M48,104 L58,104 L72,110 L78,122 L68,134 L54,130 L44,118Z', cx: 62, cy: 118, postalPrefixes: ['24', '25'] },
  { id: 'santarem', name: 'Santarém', path: 'M68,134 L78,122 L72,110 L90,112 L100,102 L120,110 L118,130 L104,142 L88,148 L74,144Z', cx: 94, cy: 126, postalPrefixes: ['20', '21'] },
  { id: 'lisboa', name: 'Lisboa', path: 'M44,138 L54,130 L68,134 L74,144 L78,160 L68,170 L54,168 L42,156Z', cx: 60, cy: 152, postalPrefixes: ['10', '11', '12', '13', '14', '15', '16', '17', '19', '26', '27'] },
  { id: 'portalegre', name: 'Portalegre', path: 'M120,110 L138,104 L146,90 L156,100 L152,120 L140,132 L118,130Z', cx: 136, cy: 112, postalPrefixes: ['37', '73'] },
  { id: 'setubal', name: 'Setúbal', path: 'M42,156 L54,168 L68,170 L78,160 L88,168 L92,184 L80,196 L62,194 L46,182Z', cx: 68, cy: 178, postalPrefixes: ['28', '29'] },
  { id: 'evora', name: 'Évora', path: 'M78,160 L88,148 L104,142 L118,130 L140,132 L138,156 L124,172 L104,178 L92,184 L88,168Z', cx: 112, cy: 158, postalPrefixes: ['70', '71'] },
  { id: 'beja', name: 'Beja', path: 'M62,194 L80,196 L92,184 L104,178 L124,172 L138,156 L148,170 L144,196 L128,216 L108,224 L84,218 L68,208Z', cx: 108, cy: 198, postalPrefixes: ['75', '76'] },
  { id: 'faro', name: 'Faro', path: 'M68,208 L84,218 L108,224 L128,216 L144,196 L148,218 L136,236 L108,244 L78,240 L62,228Z', cx: 108, cy: 228, postalPrefixes: ['80', '81', '82', '83', '84', '85'] },
];

function postalPrefix(postalCode: string): string | null {
  if (!postalCode) return null;
  const clean = postalCode.replace(/[^0-9]/g, '');
  if (clean.length < 2) return null;
  return clean.substring(0, 2);
}

interface SalesRadarProps {
  records: ControlRecord[];
  height?: string;
}

export function SalesRadar({ records, height = '280px' }: SalesRadarProps) {
  const { districtData, topDistricts } = useMemo(() => {
    // Count by postal prefix
    const prefixCounts: Record<string, number> = {};
    records.forEach((r) => {
      const prefix = postalPrefix(r.local);
      if (!prefix) return;
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });

    // Aggregate by district
    const districtCounts: { id: string; name: string; count: number }[] = DISTRICTS.map(d => {
      const count = d.postalPrefixes.reduce((sum, p) => sum + (prefixCounts[p] || 0), 0);
      return { id: d.id, name: d.name, count };
    });

    const maxCount = Math.max(...districtCounts.map(d => d.count), 1);

    const districtMap: Record<string, { count: number; intensity: number }> = {};
    districtCounts.forEach(d => {
      districtMap[d.id] = { count: d.count, intensity: d.count / maxCount };
    });

    const topDistricts = districtCounts
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { districtData: districtMap, topDistricts };
  }, [records]);

  return (
    <div style={{ height }} className="flex flex-col">
      <svg viewBox="30 20 140 240" className="flex-1 w-full" style={{ maxHeight: `calc(${height} - 50px)` }} preserveAspectRatio="xMidYMid meet">
        {/* District shapes */}
        {DISTRICTS.map((d) => {
          const data = districtData[d.id];
          const count = data?.count || 0;
          const intensity = data?.intensity || 0;

          return (
            <g key={d.id}>
              <path
                d={d.path}
                fill={count > 0
                  ? `hsl(214 76% 47% / ${0.15 + intensity * 0.7})`
                  : 'hsl(var(--muted))'
                }
                stroke="hsl(var(--border))"
                strokeWidth="0.8"
              >
                <title>{d.name}: {count} negócio(s)</title>
              </path>
              {count > 0 && (
                <text
                  x={d.cx}
                  y={d.cy + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="5.5"
                  fontWeight="700"
                  fill="hsl(var(--foreground))"
                  style={{ pointerEvents: 'none' }}
                >
                  {count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {topDistricts.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {topDistricts.map((item) => (
            <div key={item.id} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0 bg-primary" />
              {item.name}: {item.count}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
