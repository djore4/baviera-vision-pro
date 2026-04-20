import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Maximize2, X } from 'lucide-react';
import type { ControlRecord } from '@/types/data';

// IMPORTAÇÃO DIRETA: Acaba com os problemas de rede e caminhos do GitHub
// Garante que o ficheiro está na mesma pasta que este ficheiro .tsx
import geoData from './concelhos.json'; 

const CP4_TO_CONCELHO: Record<string, string> = {
  '1000': 'Lisboa', '1100': 'Lisboa', '1200': 'Lisboa', '1300': 'Lisboa',
  '1400': 'Lisboa', '1500': 'Lisboa', '1600': 'Lisboa', '1700': 'Lisboa',
  '1800': 'Lisboa', '1900': 'Lisboa', '1990': 'Lisboa',
  '2620': 'Loures', '2630': 'Loures', '2660': 'Loures',
  '2670': 'Odivelas', '2680': 'Loures',
  '2600': 'Vila Franca de Xira',
  '2700': 'Amadora', '2720': 'Amadora',
  '2690': 'Sintra', '2710': 'Sintra', '2745': 'Sintra',
  '2730': 'Oeiras', '2740': 'Oeiras', '2780': 'Oeiras', '2785': 'Oeiras', '2790': 'Oeiras',
  '2750': 'Cascais', '2760': 'Cascais', '2770': 'Cascais',
  '2800': 'Almada', '2810': 'Almada',
  '2820': 'Seixal', '2840': 'Seixal',
  '2830': 'Barreiro', '2860': 'Moita', '2870': 'Montijo',
  '2900': 'Setúbal', '2910': 'Setúbal',
  '2925': 'Sesimbra', '2970': 'Sesimbra',
  '2950': 'Palmela', '2975': 'Palmela',
  '3000': 'Coimbra', '3020': 'Coimbra', '3030': 'Coimbra', '3040': 'Coimbra',
  '3050': 'Mealhada', '3060': 'Cantanhede', '3080': 'Figueira da Foz',
  '3700': 'São João da Madeira',
  '3710': 'Oliveira de Azeméis', '3720': 'Oliveira de Azeméis',
  '3730': 'Vale de Cambra',
  '3740': 'Anadia', '3770': 'Anadia',
  '3750': 'Águeda', '3760': 'Águeda',
  '3800': 'Aveiro', '3810': 'Aveiro', '3820': 'Aveiro',
  '3830': 'Ílhavo', '3840': 'Murtosa',
  '3850': 'Albergaria-a-Velha', '3860': 'Estarreja', '3870': 'Espinho',
  '3880': 'Ovar', '3885': 'Ovar', '3890': 'Santa Maria da Feira',
  '3500': 'Viseu', '3510': 'Viseu', '3515': 'Viseu',
  '3520': 'Nelas', '3530': 'Mangualde',
  '3570': 'Castro Daire', '3600': 'Castro Daire', '3610': 'Cinfães',
  '3620': 'Resende', '3630': 'Resende', '3670': 'Resende',
  '3680': 'Arouca', '3690': 'São Pedro do Sul',
  '4000': 'Porto', '4050': 'Porto', '4100': 'Porto', '4150': 'Porto',
  '4200': 'Porto', '4250': 'Porto', '4300': 'Porto', '4350': 'Porto',
  '4400': 'Vila Nova de Gaia', '4410': 'Vila Nova de Gaia',
  '4415': 'Vila Nova de Gaia', '4430': 'Vila Nova de Gaia',
  '4435': 'Vila Nova de Gaia', '4445': 'Vila Nova de Gaia',
  '4420': 'Gondomar', '4425': 'Gondomar',
  '4440': 'Valongo',
  '4405': 'Maia', '4470': 'Maia', '4475': 'Maia', '4480': 'Maia', '4485': 'Maia',
  '4450': 'Matosinhos', '4455': 'Matosinhos', '4460': 'Matosinhos', '4465': 'Matosinhos',
  '4490': 'Póvoa de Varzim', '4495': 'Vila do Conde',
  '4500': 'Espinho', '4505': 'Espinho',
  '4510': 'Santo Tirso', '4780': 'Santo Tirso',
  '4515': 'Santa Maria da Feira', '4520': 'Santa Maria da Feira',
  '4525': 'Santa Maria da Feira', '4530': 'Santa Maria da Feira',
  '4535': 'Santa Maria da Feira', '4540': 'Santa Maria da Feira',
  '4545': 'Arouca', '4550': 'Arouca', '4555': 'Arouca',
  '4560': 'Paredes', '4565': 'Paredes', '4570': 'Paredes',
  '4575': 'Penafiel',
  '4580': 'Paços de Ferreira', '4585': 'Paços de Ferreira',
  '4590': 'Paços de Ferreira', '4595': 'Paços de Ferreira',
  '4600': 'Amarante', '4610': 'Amarante', '4615': 'Amarante',
  '4620': 'Lousada', '4625': 'Lousada',
  '4630': 'Felgueiras', '4635': 'Felgueiras',
  '4640': 'Felgueiras', '4650': 'Felgueiras',
  '4660': 'Baião', '4670': 'Baião',
  '4690': 'Marco de Canaveses',
  '4700': 'Braga', '4705': 'Braga', '4710': 'Braga', '4715': 'Braga',
  '4720': 'Amares',
  '4730': 'Barcelos', '4750': 'Barcelos', '4755': 'Barcelos', '4790': 'Barcelos',
  '4740': 'Esposende',
  '4745': 'Trofa', '4785': 'Trofa',
  '4760': 'Vila Nova de Famalicão', '4765': 'Vila Nova de Famalicão',
  '4770': 'Vila Nova de Famalicão', '4775': 'Vila Nova de Famalicão',
  '4795': 'Vila do Conde',
  '4800': 'Guimarães', '4805': 'Guimarães',
  '4810': 'Guimarães', '4815': 'Guimarães', '4835': 'Guimarães',
  '4820': 'Fafe', '4825': 'Vizela',
  '4870': 'Arcos de Valdevez',
  '4900': 'Viana do Castelo', '4905': 'Viana do Castelo',
  '4910': 'Cminha', '4920': 'Vila Nova de Cerveira',
  '4930': 'Valença', '4940': 'Monção', '4950': 'Monção',
  '5000': 'Vila Real',
  '5100': 'Lamego', '5110': 'Lamego',
  '5300': 'Bragança', '5320': 'Bragança',
  '8000': 'Faro', '8005': 'Faro',
};

function getConcelhoName(geo: any): string {
  return (
    geo.properties?.shapeName ||
    geo.properties?.Concelho ||
    geo.properties?.NAME_2 ||
    geo.properties?.name ||
    ''
  );
}

function normalize(s: string): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').trim();
}

function MapContent({
  normalizedSales,
  maxCount,
  tooltip,
  setTooltip,
  width,
  height,
  scale,
}: any) {
  return (
    <div className="relative w-full h-full">
      {tooltip && (
        <div className="pointer-events-none absolute left-2 top-2 z-50 rounded border border-border bg-background px-2 py-1 text-[11px] shadow-sm">
          {tooltip}
        </div>
      )}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-8.2, 39.5], scale }} // Ajustado centro para Portugal Continental
        width={width}
        height={height}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Passamos o objeto geoData diretamente aqui */}
        <Geographies geography={geoData}>
          {({ geographies }) =>
            geographies
              .filter((geo) => {
                const type = geo.geometry?.type;
                const coords = geo.geometry?.coordinates;
                let lon = 0;
                if (type === 'Polygon') lon = coords?.[0]?.[0]?.[0];
                else if (type === 'MultiPolygon') lon = coords?.[0]?.[0]?.[0]?.[0];
                return typeof lon === 'number' && lon > -12; // Filtro para garantir que estamos no continente
              })
              .map((geo) => {
                const rawName = getConcelhoName(geo);
                const entry = normalizedSales[normalize(rawName)];
                const count = entry?.count ?? 0;
                const intensity = Math.min(count / maxCount, 1);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={count > 0 ? `hsl(214, 76%, ${Math.round(70 - intensity * 40)}%)` : '#cbd5e1'}
                    stroke="#94a3b8"
                    strokeWidth={0.2}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: count > 0 ? '#1C69D4' : '#94a3b8', outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() => setTooltip(count > 0 ? `${rawName}: ${count} negócio(s)` : rawName)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

export function SalesRadar({ records, height = '350px' }: { records: ControlRecord[], height?: string }) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const concelhoSales = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      if (!r.local) return;
      const cp4 = String(r.local).replace(/[^0-9]/g, '').substring(0, 4).padStart(4, '0');
      const concelho = CP4_TO_CONCELHO[cp4];
      if (concelho) counts[concelho] = (counts[concelho] || 0) + 1;
    });
    return counts;
  }, [records]);

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
    return Object.entries(concelhoSales).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [concelhoSales]);

  return (
    <div style={{ height }} className="flex flex-col border rounded-lg p-2 bg-card">
      <div className="relative flex-1">
        <button 
          onClick={() => setExpanded(true)}
          className="absolute right-0 top-0 z-10 p-1 hover:bg-accent rounded"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <MapContent
          normalizedSales={normalizedSales}
          maxCount={maxCount}
          tooltip={tooltip}
          setTooltip={setTooltip}
          width={400}
          height={500}
          scale={4500}
        />
      </div>
      {/* Listagem de Top Concelhos para validação visual rápida */}
      <div className="mt-2 flex gap-2 flex-wrap justify-center">
        {topConcelhos.map(([name, count]) => (
          <span key={name} className="text-[10px] bg-muted px-2 py-0.5 rounded border">
            {name}: {count}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setExpanded(false)}>
          <div className="bg-background w-full h-full max-w-4xl max-h-[90vh] rounded-xl flex flex-col p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Distribuição Geográfica</h3>
              <button onClick={() => setExpanded(false)}><X /></button>
            </div>
            <div className="flex-1 min-h-0">
               <MapContent
                normalizedSales={normalizedSales}
                maxCount={maxCount}
                tooltip={tooltip}
                setTooltip={setTooltip}
                width={800}
                height={1000}
                scale={9000}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
