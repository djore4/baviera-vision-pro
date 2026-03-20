import { useMemo } from 'react';
import type { ControlRecord } from '@/types/data';

// Map postal code prefix (2 digits) to approximate SVG coordinates
// SVG viewBox is 0 0 200 340, representing Portugal mainland
const PT_SVG_MAP: Record<string, [number, number]> = {
  '10': [85, 230], '11': [83, 228], '12': [80, 225], '13': [87, 227],
  '14': [78, 235], '15': [88, 226], '16': [76, 222], '17': [75, 232],
  '19': [72, 240],
  '20': [90, 210], '21': [88, 215], '22': [92, 205], '23': [90, 200],
  '24': [70, 190], '25': [95, 180], '26': [100, 170], '27': [68, 188],
  '28': [95, 245], '29': [90, 248],
  '30': [110, 135], '31': [105, 140], '32': [115, 115],
  '33': [85, 160], '34': [95, 110], '35': [112, 125],
  '36': [120, 105], '37': [100, 120], '38': [92, 108],
  '40': [65, 55], '41': [85, 80], '42': [88, 78], '43': [92, 82],
  '44': [82, 82], '45': [80, 88], '46': [90, 68], '47': [72, 65],
  '48': [88, 62], '49': [65, 50],
  '50': [105, 72], '51': [130, 48], '52': [120, 60],
  '53': [110, 58], '54': [108, 78],
  '60': [120, 140], '61': [125, 125], '62': [130, 150],
  '63': [115, 145],
  '70': [110, 240], '71': [115, 260], '72': [125, 185],
  '73': [120, 210], '74': [128, 225],
  '75': [112, 238], '76': [100, 250],
  '80': [105, 310], '81': [90, 300], '82': [115, 305],
  '83': [82, 295], '84': [75, 290], '85': [120, 308],
};

function postalPrefix(postalCode: string): string | null {
  if (!postalCode) return null;
  const clean = postalCode.replace(/[^0-9]/g, '');
  if (clean.length < 2) return null;
  const prefix = clean.substring(0, 2);
  return PT_SVG_MAP[prefix] ? prefix : null;
}

interface SalesRadarProps {
  records: ControlRecord[];
  height?: string;
}

// Simplified outline of Portugal mainland
const PORTUGAL_PATH = `M 75 20 L 65 30 L 55 45 L 60 55 L 55 65 L 65 72 
  L 70 80 L 75 85 L 72 95 L 78 105 L 82 115 L 78 130 
  L 72 145 L 68 160 L 72 175 L 68 190 L 72 200 L 78 210 
  L 75 220 L 80 230 L 78 240 L 82 250 L 78 265 L 82 280 
  L 78 290 L 85 300 L 90 310 L 100 320 L 115 315 L 125 305 
  L 130 290 L 135 270 L 138 250 L 140 230 L 138 210 
  L 135 190 L 138 170 L 135 150 L 130 130 L 135 110 
  L 130 90 L 125 70 L 120 55 L 115 40 L 105 30 L 95 22 
  L 85 18 Z`;

export function SalesRadar({ records, height = '280px' }: SalesRadarProps) {
  const { dots, topPostals } = useMemo(() => {
    const counters: Record<string, number> = {};

    records.forEach((r) => {
      const prefix = postalPrefix(r.local);
      if (!prefix) return;
      counters[prefix] = (counters[prefix] || 0) + 1;
    });

    const entries = Object.entries(counters)
      .map(([prefix, count]) => ({
        prefix,
        count,
        x: PT_SVG_MAP[prefix][0],
        y: PT_SVG_MAP[prefix][1],
      }))
      .sort((a, b) => b.count - a.count);

    const maxCount = entries[0]?.count || 1;

    const mapDots = entries.map((entry) => {
      const intensity = entry.count / maxCount;
      return {
        ...entry,
        intensity,
        radius: 3 + intensity * 8,
      };
    });

    return {
      dots: mapDots,
      topPostals: entries.slice(0, 12),
    };
  }, [records]);

  return (
    <div style={{ height }} className="flex flex-col">
      <svg viewBox="0 0 200 340" className="flex-1 w-full" style={{ maxHeight: `calc(${height} - 40px)` }}>
        {/* Portugal outline */}
        <path d={PORTUGAL_PATH} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.5" />
        {/* Postal highlights */}
        {dots.map((d, i) => (
          <g key={i}>
            <circle
              cx={d.x}
              cy={d.y}
              r={d.radius + 2}
              fill="hsl(var(--primary))"
              opacity={0.12 + d.intensity * 0.18}
            />
            <circle
              cx={d.x}
              cy={d.y}
              r={d.radius}
              fill="hsl(var(--primary))"
              opacity={0.35 + d.intensity * 0.5}
              stroke="hsl(var(--background))"
              strokeWidth="0.8"
            >
              <title>CP {d.prefix} — {d.count} negócio(s)</title>
            </circle>
            <text
              x={d.x + d.radius + 1.5}
              y={d.y - d.radius - 0.5}
              fontSize="4.5"
              fill="hsl(var(--foreground))"
              fontWeight="600"
            >
              {d.prefix}
            </text>
          </g>
        ))}
      </svg>
      {topPostals.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {topPostals.map((item) => (
            <div key={item.prefix} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0 bg-primary" />
              CP {item.prefix}: {item.count}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
