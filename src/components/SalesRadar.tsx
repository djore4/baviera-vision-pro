import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import type { ControlRecord } from '@/types/data';
import { postalCodeToLatLng } from '@/lib/postal-codes';

const RESP_COLORS = [
  '#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
  '#14B8A6', '#E11D48', '#0EA5E9', '#A855F7',
];

interface SalesRadarProps {
  records: ControlRecord[];
  height?: string;
}

export function SalesRadar({ records, height = '280px' }: SalesRadarProps) {
  const { markers, respColors } = useMemo(() => {
    const resps = [...new Set(records.map(r => r.resp).filter(Boolean))];
    const colorMap: Record<string, string> = {};
    resps.forEach((r, i) => { colorMap[r] = RESP_COLORS[i % RESP_COLORS.length]; });

    const m = records
      .map(r => {
        const coords = postalCodeToLatLng(r.local);
        if (!coords) return null;
        return { lat: coords[0], lng: coords[1], resp: r.resp, cliente: r.cliente, color: colorMap[r.resp] || '#888' };
      })
      .filter(Boolean) as { lat: number; lng: number; resp: string; cliente: string; color: string }[];

    return { markers: m, respColors: colorMap };
  }, [records]);

  const legendEntries = Object.entries(respColors).slice(0, 10);

  return (
    <div className="relative" style={{ height }}>
      <MapContainer
        center={[39.5, -8.0]}
        zoom={6}
        style={{ height: '100%', width: '100%', borderRadius: 'var(--radius)' }}
        scrollWheelZoom={false}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        />
        {markers.map((m, i) => (
          <CircleMarker
            key={i}
            center={[m.lat, m.lng]}
            radius={4}
            pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.8, weight: 1 }}
          >
            <Tooltip>{m.resp} — {m.cliente}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      {legendEntries.length > 0 && (
        <div className="absolute bottom-2 right-2 bg-card/90 backdrop-blur-sm border border-border rounded px-2 py-1 z-[1000]">
          {legendEntries.map(([resp, color]) => (
            <div key={resp} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
              {resp}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
