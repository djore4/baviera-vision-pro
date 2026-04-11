import { Filter } from 'lucide-react';
import { useData } from '@/contexts/DataContext';

const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function PeriodFilter() {
  const { availablePeriods, filter, setFilter } = useData();

  if (availablePeriods.years.length === 0) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthKey = currentYear * 100 + currentMonth;

  // Detect active quick-action states
  const isCurrentMonth = filter.years.length === 1 && filter.years[0] === currentYear && filter.months.length === 1 && filter.months[0] === currentMonthKey;
  const isCurrentYear = filter.years.length === 1 && filter.years[0] === currentYear && filter.months.length === 0;
  const isAllYears = filter.years.length === availablePeriods.years.length && filter.months.length === 0;
  const isNoFilter = filter.years.length === 0 && filter.months.length === 0;

  const selectCurrentMonth = () => {
    setFilter({ years: [currentYear], quarters: [], months: [currentMonthKey] });
  };

  const selectCurrentYear = () => {
    setFilter({ years: [currentYear], quarters: [], months: [] });
  };

  const selectAll = () => {
    setFilter({ years: [...availablePeriods.years], quarters: [], months: [] });
  };

  const clearAll = () => {
    setFilter({ years: [], quarters: [], months: [] });
  };

  const toggleYear = (year: number) => {
    setFilter(prev => {
      const hasYear = prev.years.includes(year);
      return {
        years: hasYear ? prev.years.filter(y => y !== year) : [...prev.years, year].sort(),
        quarters: prev.quarters.filter(q => Math.floor(q / 10) !== year),
        months: hasYear ? prev.months.filter(m => Math.floor(m / 100) !== year) : prev.months,
      };
    });
  };

  const toggleMonth = (year: number, month: number) => {
    const key = year * 100 + month;
    setFilter(prev => {
      const hasMonth = prev.months.includes(key);
      return {
        years: prev.years.includes(year) ? prev.years : [...prev.years, year].sort(),
        quarters: prev.quarters.filter(q => Math.floor(q / 10) !== year),
        months: hasMonth ? prev.months.filter(m => m !== key) : [...prev.months, key].sort((a, b) => a - b),
      };
    });
  };

  const selectedYears = [...filter.years].sort((a, b) => b - a);

  const quickBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={active
        ? 'rounded-md border border-primary bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground'
        : 'rounded-md border border-border bg-secondary px-2 py-1.5 text-[11px] font-medium text-secondary-foreground hover:bg-accent'
      }
    >
      {label}
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">PERÍODO</span>
        </div>
        {(filter.years.length > 0 || filter.months.length > 0) && (
          <button onClick={clearAll} className="text-[10px] font-medium text-primary hover:underline">Limpar</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {quickBtn('Mês atual', isCurrentMonth, selectCurrentMonth)}
        {quickBtn('Ano atual', isCurrentYear, selectCurrentYear)}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Anos</p>
        <div className="flex flex-wrap gap-1.5">
          {availablePeriods.years.filter(y => y >= 2021).map(year => {
            const active = filter.years.includes(year);
            return (
              <button
                key={year}
                onClick={() => toggleYear(year)}
                className={active
                  ? 'rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                  : 'rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'
                }
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>

      {selectedYears.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meses</p>
          {selectedYears.map(year => {
            const months = availablePeriods.months.filter(month => month.year === year);
            return (
              <div key={year} className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">{year}</p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
                  {months.map(month => {
                    const key = month.year * 100 + month.month;
                    const active = filter.months.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleMonth(month.year, month.month)}
                        className={active
                          ? 'rounded-md border border-primary bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground'
                          : 'rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'
                        }
                      >
                        {monthNames[month.month - 1]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
