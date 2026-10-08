'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/stat-card';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLES } from '@/lib/chart-theme';
import { CHART_COLORS } from '@/lib/constants';

export function BoardStatisticsCharts({
  pieData,
  weeklyData,
  snapshotData,
}: {
  pieData: Array<{ board: string; value: number }>;
  weeklyData: Array<{ board: string; jobs: number }>;
  snapshotData: Array<{ board: string; today: number; week: number; month: number }>;
}) {
  const hasAny = pieData.length > 0 || weeklyData.length > 0 || snapshotData.length > 0;

  if (!hasAny) {
    return (
      <div className="card">
        <EmptyState
          title="Nothing to chart yet"
          description="These three charts are driven by job_board_stats. They fill in as soon as the scraper reports volume for at least one board."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---------- pie: all-time distribution ---------- */}
        <div className="card card-pad">
          <h2 className="section-title">Jobs scraped by board (all-time)</h2>
          <div className="mt-3 h-80 w-full text-slate-500 dark:text-slate-400">
            {pieData.length === 0 ? (
              <p className="pt-10 text-center text-sm">No all-time volume reported yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="board"
                    cx="50%"
                    cy="45%"
                    innerRadius="45%"
                    outerRadius="72%"
                    paddingAngle={1.5}
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.board} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLES} />
                  <Legend
                    verticalAlign="bottom"
                    height={56}
                    wrapperStyle={{ fontSize: 12, color: 'currentColor' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ---------- bar: this week ---------- */}
        <div className="card card-pad">
          <h2 className="section-title">Jobs this week per board</h2>
          <div className="mt-3 h-80 w-full text-slate-500 dark:text-slate-400">
            {weeklyData.length === 0 ? (
              <p className="pt-10 text-center text-sm">No jobs scraped this week yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weeklyData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, bottom: 0, left: 8 }}
                >
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="board"
                    width={120}
                    tick={{ ...AXIS_TICK, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip {...TOOLTIP_STYLES} />
                  <Bar dataKey="jobs" name="Jobs this week" radius={[0, 5, 5, 0]} barSize={14}>
                    {weeklyData.map((entry, index) => (
                      <Cell key={entry.board} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ---------- grouped bar: snapshot by period ---------- */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">Scrape volume by period (current snapshot)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Today vs this week vs this month, per board
          </p>
        </div>
        <div className="mt-3 h-80 w-full text-slate-500 dark:text-slate-400">
          {snapshotData.length === 0 ? (
            <p className="pt-10 text-center text-sm">No period volume reported yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshotData} margin={{ top: 4, right: 8, bottom: 40, left: -18 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="board"
                  tick={{ ...AXIS_TICK, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLES} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'currentColor' }} />
                <Bar dataKey="today" name="Today" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="week" name="This week" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="month" name="This month" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          The schema has no <code className="font-mono">job_board_stats_history</code> table, so
          there is no real time series to plot. Rather than invent one, this chart shows the current
          snapshot across the three periods the schema does store. Add a history table (one row per
          board per day) and this becomes a true line chart.
        </p>
      </div>
    </div>
  );
}
