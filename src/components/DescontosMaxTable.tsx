/* Descontos máximos por modelo (referência rápida). `igual` = o mesmo valor com
 * e sem incorporação de 19% de opcionais (célula única). */
type Val = { max: string; mensal: string };
type Linha = { modelos: string; com: Val; sem?: Val };
type Grupo = { titulo: string; linhas: Linha[] };

const v = (max: string, mensal: string): Val => ({ max, mensal });
const SEM_ACUM = 'sem acumulação mensal';

const GRUPOS: Grupo[] = [
  {
    titulo: 'BEV',
    linhas: [
      { modelos: 'iX1, iX2', com: v('13%', '2,16% mensal'), sem: v('10%', '1,66% mensal') },
      { modelos: 'iX3', com: v('10%', SEM_ACUM), sem: v('7%', SEM_ACUM) },
      { modelos: 'i4, iX', com: v('15%', '2,50% mensal') },
      { modelos: 'i5, i7', com: v('18%', '3,00% mensal') },
    ],
  },
  {
    titulo: 'PHEV',
    linhas: [
      { modelos: 'Série 2', com: v('14%', '2,33% mensal'), sem: v('11%', '1,83% mensal') },
      { modelos: 'Série 3, X1, X3', com: v('16%', '2,66% mensal'), sem: v('13%', '2,16% mensal') },
      { modelos: 'Série 5, Série 7, X5, XM', com: v('18%', '3,00% mensal') },
    ],
  },
  {
    titulo: 'ICE (Motor Combustão)',
    linhas: [
      { modelos: 'Série 1, Série 2, X1, X2', com: v('10%', '1,66% mensal'), sem: v('7%', '1,16% mensal') },
      { modelos: 'Série 3, Série 4, Série 5, X3, Z4', com: v('12%', '2,00% mensal'), sem: v('9%', '1,50% mensal') },
      { modelos: 'Série 7, X5, X7, M & MPA', com: v('18%', '3,00% mensal'), sem: v('14%', '2,33% mensal') },
    ],
  },
];

function Valor({ val }: { val: Val }) {
  return (
    <div className="leading-tight">
      <div className="text-sm sm:text-base font-bold tabular-nums">{val.max}</div>
      <div className="text-[10px] sm:text-[11px] text-muted-foreground">{val.mensal}</div>
    </div>
  );
}

export default function DescontosMaxTable() {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Descontos máximos (máx. total e acumulação mensal)
      </h2>
      <div className="grid gap-3 xl:grid-cols-3">
        {GRUPOS.map(g => (
          <div key={g.titulo} className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full table-fixed text-center text-xs">
              <thead>
                <tr className="bg-muted/40 align-bottom">
                  <th className="w-[34%] p-2 text-left font-bold">{g.titulo}</th>
                  <th className="p-2 font-semibold leading-tight">Com 19% de opcionais</th>
                  <th className="p-2 font-semibold leading-tight">Sem 19% de opcionais</th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map(l => (
                  <tr key={l.modelos} className="border-t border-border">
                    <td className="p-2 text-left font-medium break-words">{l.modelos}</td>
                    {l.sem ? (
                      <>
                        <td className="p-2 border-l border-border"><Valor val={l.com} /></td>
                        <td className="p-2 border-l border-border"><Valor val={l.sem} /></td>
                      </>
                    ) : (
                      <td colSpan={2} className="p-2 border-l border-border"><Valor val={l.com} /></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
