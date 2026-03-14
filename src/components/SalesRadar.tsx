import { useMemo } from 'react';
import type { ControlRecord } from '@/types/data';

const RESP_COLORS = [
  '#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
  '#14B8A6', '#E11D48', '#0EA5E9', '#A855F7',
];

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

function postalToSVG(postalCode: string): [number, number] | null {
  if (!postalCode) return null;
  const clean = postalCode.replace(/[^0-9]/g, '');
  if (clean.length < 2) return null;
  const prefix = clean.substring(0, 2);
  const base = PT_SVG_MAP[prefix];
  if (!base) return null;
  // Small jitter to avoid overlap
  const jx = (Math.random() - 0.5) * 8;
  const jy = (Math.random() - 0.5) * 8;
  return [base[0] + jx, base[1] + jy];
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
  const { dots, respColors } = useMemo(() => {
    const resps = [...new Set(records.map(r => r.resp).filter(Boolean))];
    const colorMap: Record<string, string> = {};
    resps.forEach((r, i) => { colorMap[r] = RESP_COLORS[i % RESP_COLORS.length]; });

    const d = records
      .map(r => {
        const coords = postalToSVG(r.local);
        if (!coords) return null;
        return { x: coords[0], y: coords[1], resp: r.resp, cliente: r.cliente, color: colorMap[r.resp] || '#888' };
      })
      .filter(Boolean) as { x: number; y: number; resp: string; cliente: string; color: string }[];

    return { dots: d, respColors: colorMap };
  }, [records]);

  const legendEntries = Object.entries(respColors).slice(0, 12);

  return (
    <div style={{ height }} className="flex flex-col">
      <svg viewBox="0 0 200 340" className="flex-1 w-full" style={{ maxHeight: `calc(${height} - 40px)` }}>
        {/* Portugal outline */}
        <path d={PORTUGAL_PATH} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="1.5" />
        {/* Dots */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="3" fill={d.color} opacity={0.85} stroke="white" strokeWidth="0.5">
            <title>{d.resp} — {d.cliente}</title>
          </circle>
        ))}
      </svg>
      {legendEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
          {legendEntries.map(([resp, color]) => (
            <div key={resp} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
              {resp}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
