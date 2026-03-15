import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { Checkbox } from '@/components/ui/checkbox';

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function PeriodFilter() {
  const { availablePeriods, filter, setFilter } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedYears, setExpandedYears] = useState<number[]>([]);
  const [expandedQuarters, setExpandedQuarters] = useState<string[]>([]);

  if (availablePeriods.years.length === 0) return null;

  const toggleYear = (year: number) => {
    setFilter(prev => {
      const has = prev.years.includes(year);
      const newYears = has ? prev.years.filter(y => y !== year) : [...prev.years, year];
      const newMonths = has ? prev.months.filter(m => Math.floor(m / 100) !== year) : prev.months;
      const newQuarters = has ? prev.quarters.filter(q => Math.floor(q / 10) !== year) : prev.quarters;
      return { ...prev, years: newYears, months: newMonths, quarters: newQuarters };
    });
  };

  const toggleQuarter = (year: number, quarter: number) => {
    const key = year * 10 + quarter; // e.g. 20261
    const qMonths = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
    setFilter(prev => {
      const has = prev.quarters.includes(key);
      const newQuarters = has ? prev.quarters.filter(q => q !== key) : [...prev.quarters, key];
      // Toggle all months of this quarter
      let newMonths = prev.months;
      if (has) {
        newMonths = prev.months.filter(m => !(Math.floor(m / 100) === year && qMonths.includes(m % 100)));
      } else {
        const toAdd = qMonths.map(m => year * 100 + m).filter(m => !prev.months.includes(m));
        newMonths = [...prev.months, ...toAdd];
      }
      const newYears = prev.years.includes(year) ? prev.years : [...prev.years, year];
      return { ...prev, years: newYears, quarters: newQuarters, months: newMonths };
    });
  };

  const toggleMonth = (year: number, month: number) => {
    const key = year * 100 + month;
    setFilter(prev => {
      const has = prev.months.includes(key);
      const newMonths = has ? prev.months.filter(m => m !== key) : [...prev.months, key];
      const newYears = prev.years.includes(year) ? prev.years : [...prev.years, year];
      return { ...prev, years: newYears, months: newMonths };
    });
  };

  const toggleExpandYear = (year: number) => {
    setExpandedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
  };

  const toggleExpandQuarter = (key: string) => {
    setExpandedQuarters(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const clearAll = () => setFilter({ years: [], quarters: [], months: [] });

  const isQuarterChecked = (year: number, quarter: number) => {
    const qMonths = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
    return qMonths.every(m => filter.months.includes(year * 100 + m));
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent/50 transition-colors"
      >
        <Filter className="h-3.5 w-3.5 text-primary" />
        PERÍODO
        {filter.years.length > 0 && (
          <span className="ml-auto text-primary text-[10px] font-medium cursor-pointer" onClick={(e) => { e.stopPropagation(); clearAll(); }}>
            Limpar
          </span>
        )}
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1 max-h-72 overflow-y-auto">
          {availablePeriods.years.map(year => (
            <div key={year}>
              <div className="flex items-center gap-2 py-1">
                <Checkbox
                  id={`y-${year}`}
                  checked={filter.years.includes(year)}
                  onCheckedChange={() => toggleYear(year)}
                  className="h-3.5 w-3.5"
                />
                <button
                  onClick={() => toggleExpandYear(year)}
                  className="flex items-center gap-1 text-xs font-medium text-foreground"
                >
                  {expandedYears.includes(year) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {year}
                </button>
              </div>

              {expandedYears.includes(year) && (
                <div className="ml-4 space-y-0.5">
                  {[1, 2, 3, 4].map(q => {
                    const qKey = `${year}-Q${q}`;
                    const qMonths = availablePeriods.months.filter(
                      m => m.year === year && m.month >= (q - 1) * 3 + 1 && m.month <= q * 3
                    );
                    return (
                      <div key={qKey}>
                        <div className="flex items-center gap-2 py-0.5">
                          <Checkbox
                            id={`q-${qKey}`}
                            checked={isQuarterChecked(year, q)}
                            onCheckedChange={() => toggleQuarter(year, q)}
                            className="h-3 w-3"
                          />
                          <button
                            onClick={() => toggleExpandQuarter(qKey)}
                            className="flex items-center gap-1 text-[11px] font-medium text-foreground"
                          >
                            {expandedQuarters.includes(qKey) ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                            {QUARTER_NAMES[q - 1]}
                          </button>
                        </div>
                        {expandedQuarters.includes(qKey) && (
                          <div className="ml-5 space-y-0.5">
                            {qMonths.map(m => (
                              <div key={`${m.year}-${m.month}`} className="flex items-center gap-2 py-0.5">
                                <Checkbox
                                  id={`m-${m.year}-${m.month}`}
                                  checked={filter.months.includes(m.year * 100 + m.month)}
                                  onCheckedChange={() => toggleMonth(m.year, m.month)}
                                  className="h-3 w-3"
                                />
                                <label htmlFor={`m-${m.year}-${m.month}`} className="text-[11px] text-muted-foreground cursor-pointer">
                                  {monthNames[m.month - 1]}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
