/**
 * Tabelas fiscais do simulador de importação (ISV de automóveis ligeiros de
 * passageiros, categoria A). Ficam num ficheiro só porque mudam todos os anos com
 * o Orçamento do Estado: atualizar aqui e mexer em `verified` quando validadas.
 *
 * ESTADO: NÃO VALIDADO. O acesso ao Portal das Finanças e aos códigos tributários
 * não estava disponível quando isto foi escrito.
 *  - `cilindrada`: valores 2026 obtidos de uma fonte secundária (iguais aos de 2025,
 *    o OE 2026 não os atualizou). Falta confirmar na lei.
 *  - `reducaoIdade`: tabela do art. 11.º do CISV de memória. Falta confirmar.
 *  - `co2`: VAZIO. Enquanto estiver vazio, o simulador pede a componente ambiental
 *    à mão (valor do Simulador ISV da AT) em vez de a calcular.
 * Enquanto `verified` for false o ecrã mostra um aviso permanente.
 */

/** Escalão: `ate` é o limite superior INCLUSIVO (cm3 ou g/km); imposto = valor × taxa − abater. */
export interface Escalao {
  ate: number;
  taxa: number;
  abater: number;
}

export type TabelaCo2 = 'gasolina-WLTP' | 'gasolina-NEDC' | 'diesel-WLTP' | 'diesel-NEDC';

export interface ReducaoIdade {
  /** Até quantos anos de idade (inclusive) se aplica esta redução. */
  ateAnos: number;
  /** Percentagem de redução (0–1). */
  pct: number;
}

export interface IsvTables {
  ano: number;
  verified: boolean;
  cilindrada: Escalao[];
  co2: Record<TabelaCo2, Escalao[]>;
  /** Redução do ISV para usados vindos da UE, por idade (aplica-se às duas componentes). */
  reducaoIdade: ReducaoIdade[];
  /** Redução de ISV dos híbridos plug-in que cumprem as condições legais (0–1). */
  phevReducao: number;
  /** Agravamento (€) dos diesel acima do limite de partículas. */
  agravamentoParticulas: number;
}

export const ISV_2026: IsvTables = {
  ano: 2026,
  verified: false,
  cilindrada: [
    { ate: 1000, taxa: 1.09, abater: 849.03 },
    { ate: 1250, taxa: 1.18, abater: 850.69 },
    { ate: Infinity, taxa: 5.61, abater: 6194.88 },
  ],
  co2: {
    'gasolina-WLTP': [],
    'gasolina-NEDC': [],
    'diesel-WLTP': [],
    'diesel-NEDC': [],
  },
  reducaoIdade: [
    { ateAnos: 1, pct: 0.10 },
    { ateAnos: 2, pct: 0.20 },
    { ateAnos: 3, pct: 0.28 },
    { ateAnos: 4, pct: 0.35 },
    { ateAnos: 5, pct: 0.43 },
    { ateAnos: 6, pct: 0.52 },
    { ateAnos: 7, pct: 0.60 },
    { ateAnos: 8, pct: 0.65 },
    { ateAnos: 9, pct: 0.70 },
    { ateAnos: 10, pct: 0.75 },
    { ateAnos: Infinity, pct: 0.80 },
  ],
  phevReducao: 0.75,
  agravamentoParticulas: 500,
};
