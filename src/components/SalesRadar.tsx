import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import type { ControlRecord } from '@/types/data';

const GEO_URL =
  '/data/concelhos.geojson';

// CTT CP4 → Concelho
// Covers all 62 CP4 codes observed in the dataset + surrounding codes
const CP4_TO_CONCELHO: Record<string, string> = {
  // Lisboa
  '1000': 'Lisboa', '1100': 'Lisboa', '1200': 'Lisboa', '1300': 'Lisboa',
  '1400': 'Lisboa', '1500': 'Lisboa', '1600': 'Lisboa', '1700': 'Lisboa',
  '1800': 'Lisboa', '1900': 'Lisboa', '1990': 'Lisboa',
  // Grande Lisboa
  '2620': 'Loures', '2630': 'Loures', '2660': 'Loures',
  '2670': 'Odivelas', '2680': 'Loures',
  '2600': 'Vila Franca de Xira',
  '2700': 'Amadora', '2720': 'Amadora',
  '2690': 'Sintra', '2710': 'Sintra', '2745': 'Sintra',
  '2730': 'Oeiras', '2740': 'Oeiras', '2780': 'Oeiras', '2785': 'Oeiras', '2790': 'Oeiras',
  '2750': 'Cascais', '2760': 'Cascais', '2770': 'Cascais',
  // Setúbal
  '2800': 'Almada', '2810': 'Almada',
  '2820': 'Seixal', '2840': 'Seixal',
  '2830': 'Barreiro', '2860': 'Moita', '2870': 'Montijo',
  '2900': 'Setúbal', '2910': 'Setúbal',
  '2925': 'Sesimbra', '2970': 'Sesimbra',
  '2950': 'Palmela', '2975': 'Palmela',
  // Coimbra / Aveiro districts
  '3000': 'Coimbra', '3020': 'Coimbra', '3030': 'Coimbra', '3040': 'Coimbra',
  '3050': 'Mealhada',
  '3060': 'Cantanhede',
  '3080': 'Figueira da Foz',
  // Aveiro
  '3700': 'São João da Madeira',
  '3710': 'Oliveira de Azeméis', '3720': 'Oliveira de Azeméis',
  '3730': 'Vale de Cambra',
  '3740': 'Anadia', '3770': 'Anadia',
  '3750': 'Águeda', '3760': 'Águeda',
  '3800': 'Aveiro', '3810': 'Aveiro', '3820': 'Aveiro',
  '3830': 'Ílhavo', '3840': 'Murtosa',
  '3850': 'Albergaria-a-Velha',
  '3860': 'Estarreja',
  '3870': 'Espinho',
  '3880': 'Ovar', '3885': 'Ovar',
  '3890': 'Santa Maria da Feira',
  // Viseu
  '3500': 'Viseu', '3510': 'Viseu', '3515': 'Viseu',
  '3520': 'Nelas', '3530': 'Mangualde',
  '3570': 'Castro Daire', '3600': 'Castro Daire',
  '3610': 'Cinfães',
  '3620': 'Resende', '3630': 'Resende', '3670': 'Resende',
  '3680': 'Arouca', '3690': 'São Pedro do Sul',
  // Porto cidade
  '4000': 'Porto', '4050': 'Porto', '4100': 'Porto', '4150': 'Porto',
  '4200': 'Porto', '4250': 'Porto', '4300': 'Porto', '4350': 'Porto',
  // Vila Nova de Gaia
  '4400': 'Vila Nova de Gaia', '4410': 'Vila Nova de Gaia',
  '4415': 'Vila Nova de Gaia', '4430': 'Vila Nova de Gaia',
  '4435': 'Vila Nova de Gaia', '4445': 'Vila Nova de Gaia',
  // Gondomar
  '4420': 'Gondomar', '4425': 'Gondomar',
  // Valongo
  '4440': 'Valongo',
  // Maia
  '4405': 'Maia', '4470': 'Maia', '4475': 'Maia', '4480': 'Maia', '4485': 'Maia',
  // Matosinhos
  '4450': 'Matosinhos', '4455': 'Matosinhos', '4460': 'Matosinhos', '4465': 'Matosinhos',
  // Póvoa de Varzim / Vila do Conde
  '4490': 'Póvoa de Varzim',
  '4495': 'Vila do Conde', '4485': 'Vila do Conde',
  // Espinho
  '4500': 'Espinho', '4505': 'Espinho',
  // Santo Tirso
  '4510': 'Santo Tirso', '4780': 'Santo Tirso',
  // Santa Maria da Feira
  '4515': 'Santa Maria da Feira', '4520': 'Santa Maria da Feira',
  '4525': 'Santa Maria da Feira', '4530': 'Santa Maria da Feira',
  '4535': 'Santa Maria da Feira', '4540': 'Santa Maria da Feira',
  // Arouca
  '4545': 'Arouca', '4550': 'Arouca', '4555': 'Arouca',
  // Paredes
  '4560': 'Paredes', '4565': 'Paredes', '4570': 'Paredes',
  // Penafiel
  '4575': 'Penafiel',
  // Paços de Ferreira
  '4580': 'Paços de Ferreira', '4585': 'Paços de Ferreira',
  '4590': 'Paços de Ferreira', '4595': 'Paços de Ferreira',
  // Amarante
  '4600': 'Amarante', '4610': 'Amarante', '4615': 'Amarante',
  // Lousada
  '4620': 'Lousada', '4625': 'Lousada',
  // Felgueiras
  '4630': 'Felgueiras', '4635': 'Felgueiras',
  '4640': 'Felgueiras', '4650': 'Felgueiras',
  // Baião
  '4660': 'Baião', '4670': 'Baião',
  // Marco de Canaveses
  '4690': 'Marco de Canaveses',
  // Braga
  '4700': 'Braga', '4705': 'Braga', '4710': 'Braga', '4715': 'Braga',
  // Amares / Barcelos
  '4720': 'Amares',
  '4730': 'Barcelos', '4750': 'Barcelos', '4755': 'Barcelos', '4790': 'Barcelos',
  // Esposende
  '4740': 'Esposende',
  // Trofa
  '4745': 'Trofa', '4785': 'Trofa',
  // Vila Nova de Famalicão
  '4760': 'Vila Nova de Famalicão', '4765': 'Vila Nova de Famalicão',
  '4770': 'Vila Nova de Famalicão', '4775': 'Vila Nova de Famalicão',
  // Vila do Conde
  '4795': 'Vila do Conde',
  // Guimarães
  '4800': 'Guimarães', '4805': 'Guimarães',
  '4810': 'Guimarães', '4815': 'Guimarães', '4835': 'Guimarães',
  // Fafe / Vizela
  '4820': 'Fafe', '4825': 'Vizela',
  // Arcos de Valdevez
  '4870': 'Arcos de Valdevez',
  // Viana do Castelo
  '4900': 'Viana do Castelo', '4905': 'Viana do Castelo',
  // Caminha / Valença / Monção
  '4910': 'Caminha', '4920': 'Vila Nova de Cerveira',
  '4930': 'Valença', '4940': 'Monção', '4950': 'Monção',
  // Vila Real
  '5000': 'Vila Real',
  // Lamego
  '5100': 'Lamego', '5110': 'Lamego',
  // Bragança
  '5300': 'Bragança', '5320': 'Bragança',
  // Faro
  '8000': 'Faro', '8005': 'Faro',
};

// Resolve GeoJSON property name regardless of which field the GeoJSON uses
function getConcelhoName(geo: any): string {
  return (
    geo.properties?.Concelho ||
    geo.properties?.NAME_2 ||
    geo.properties?.name ||
    geo.properties?.NOME ||
    ''
  );
}

// Normalize for fuzzy matching (accents + case insensitive)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .trim();
}

interface SalesRadarProps {
  records: ControlRecord[];
  height?: string;
}

export function SalesRadar({ records, height = '280px' }: SalesRadarProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  // Count sales per Concelho
  const concelhoSales = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      if (!r.local) return;
      const cp4 = String(r.local)
        .replace(/\.0$/, '')
        .replace(/[^0-9]/g, '')
        .substring(0, 4)
        .padStart(4, '0');
      const concelho = CP4_TO_CONCELHO[cp4];
      if (concelho) {
        counts[concelho] = (counts[concelho] || 0) + 1;
      }
    });
    return counts;
  }, [records]);

  // Normalized lookup for GeoJSON name matching
  const normalizedSales = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    Object.entries(concelhoSales).forEach(([name, count]) => {
      map[normalize(name)] = { name, count };
    });
    return map;
  }, [concelhoSales]);

  const maxCount = useMemo(() => {
    const vals = Object.values(concelhoSales);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [concelhoSales]);

  const topConcelhos = useMemo(() => {
    return Object.entries(concelhoSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [concelhoSales]);

  return (
    <div style={{ height }} className="flex flex-col">
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        {tooltip && (
          <div className="pointer-events-none absolute left-1 top-1 z-10 rounded border border-border bg-background px-1.5 py-0.5 text-[9px] shadow-sm">
            {tooltip}
          </div>
        )}
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-8.0, 39.5], scale: 3500 }}
          width={300}
          height={390}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const rawName = getConcelhoName(geo);
                const entry = normalizedSales[normalize(rawName)];
                const count = entry?.count ?? 0;
                const intensity = count / maxCount;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={
                      count > 0
                        ? `hsl(214 76% 47% / ${(0.2 + intensity * 0.75).toFixed(2)})`
                        : 'hsl(var(--muted))'
                    }
                    stroke="hsl(var(--border))"
                    strokeWidth={0.3}
                    style={{
                      default: { outline: 'none' },
                      hover: {
                        fill:
                          count > 0
                            ? 'hsl(214 90% 58%)'
                            : 'hsl(var(--muted-foreground) / 0.3)',
                        outline: 'none',
                        cursor: 'default',
                      },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() =>
                      setTooltip(
                        count > 0 ? `${rawName}: ${count} negócio(s)` : rawName
                      )
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

      {topConcelhos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
          {topConcelhos.map(([name, count]) => (
            <div
              key={name}
              className="flex items-center gap-1 text-[9px] text-muted-foreground"
            >
              <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
              {name}: {count}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
