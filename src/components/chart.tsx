import { Card } from "@/components/ui";
import { fill, type Messages } from "@/lib/i18n";
import { formatTnd } from "@/lib/money";

type Month = { key: string; label: string; earnings: number; expenses: number; selected?: boolean };

export function EarningsChart({ months, copy }: { months: Month[]; copy: Messages["chart"] }) {
  const max = Math.max(1, ...months.flatMap((month) => [month.earnings, month.expenses]));
  const width = 720;
  const height = 180;
  const pad = 8;
  const group = (width - pad * 2) / months.length;
  const earnings = months.reduce((sum, month) => sum + month.earnings, 0);
  const expenses = months.reduce((sum, month) => sum + month.expenses, 0);

  return (
    <Card className="mb-6 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{copy.subtitle}</p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-ink" /> {copy.earnings}
            </dt>
            <dd className="font-medium">{formatTnd(earnings)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-accent" /> {copy.expenses}
            </dt>
            <dd className="font-medium">{formatTnd(expenses)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{copy.net}</dt>
            <dd className={`font-medium ${earnings - expenses < 0 ? "text-red-700" : ""}`}>{formatTnd(earnings - expenses)}</dd>
          </div>
        </dl>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full" role="img" aria-label={copy.aria}>
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <line key={step} x1={0} x2={width} y1={height - height * step} y2={height - height * step} stroke="#efebe6" />
        ))}
        {months.map((month, index) => {
          const x = pad + index * group;
          const earnH = (month.earnings / max) * height;
          const spendH = (month.expenses / max) * height;
          const tip = fill(copy.tip, { label: month.label, earned: formatTnd(month.earnings), spent: formatTnd(month.expenses) });
          return (
            <a key={month.key} href={`/?month=${month.key}`} aria-label={tip} aria-current={month.selected ? "true" : undefined}>
              <rect x={x} y={0} width={group} height={height + 22} fill={month.selected ? "#f4ede3" : "transparent"} />
              <title>{tip}</title>
              <rect x={x + group * 0.16} y={height - earnH} width={group * 0.32} height={earnH} rx={3} fill="#1c1917" />
              <rect x={x + group * 0.52} y={height - spendH} width={group * 0.32} height={spendH} rx={3} fill="#8c6a3d" />
              <text x={x + group / 2} y={height + 18} textAnchor="middle" fontSize="11" fill={month.selected ? "#1c1917" : "#78716c"} fontWeight={month.selected ? 600 : 400}>
                {month.label}
              </text>
            </a>
          );
        })}
      </svg>
    </Card>
  );
}
