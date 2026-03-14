import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { Checkbox } from '@/components/ui/checkbox';

export function PeriodFilter() {
  const { availablePeriods, filter, setFilter } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedYears, setExpandedYears] = useState<number[]>([]);

  if (availablePeriods.years.length === 0) return null;

  const toggleYear = (year: number) => {
    setFilter(prev => {
      const has = prev.years.includes(year);
      const newYears = has ? prev.years.filter(y => y !== year) : [...prev.years, year];
      // Also remove months for this year if unchecking
      const newMonths = has ? prev.months.filter(m => Math.floor(m / 100) !== year) : prev.months;
      return { ...prev, years: newYears, months: newMonths };
    });
  };

  const toggleMonth = (year: number, month: number) => {
    const key = year * 100 + month;
    setFilter(prev => {
      const has = prev.months.includes(key);
      const newMonths = has ? prev.months.filter(m => m !== key) : [...prev.months, key];
      // Ensure year is also selected
      const newYears = prev.years.includes(year) ? prev.years : [...prev.years, year];
      return { ...prev, years: newYears, months: newMonths };
    });
  };

  const toggleExpandYear = (year: number) => {
    setExpandedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
  };

  const clearAll = () => setFilter({ years: [], quarters: [], months: [] });

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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
        <div className="px-3 pb-3 space-y-1 max-h-64 overflow-y-auto">
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
                <div className="ml-6 space-y-0.5">
                  {availablePeriods.months
                    .filter(m => m.year === year)
                    .map(m => (
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
          ))}
        </div>
      )}
    </div>
  );
}
