'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/stat-card';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLES } from '@/lib/chart-theme';
import { CHART_COLORS } from '@/lib/constants';

const STATUS_COLORS: Record<string, string> = {
  Applied: '#3b82f6',
  'In Process': '#6366f1',
  Interview: '#8b5cf6',
  Offer: '#10b981',
  Rejected: '#ef4444',
  Withdrawn: '#94a3b8',
  Other: '#f59e0b',
};

export function AnalyticsCharts({
  weeklyTrend,
  statusBreakdown,
  funnel,
  hasData,
}: {
  weeklyTrend: Array<{ week: string; applications: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  funnel: Array<{ stage: string; count: number }>;
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <div className="card">
        <EmptyState
          title="No applications yet"
          description="Mark a job as applied on the Jobs page (or add one on the Applications page) and these charts will populate."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad">
        <h2 className="section-title">Applications per week (last 12 weeks)</h2>
        <div className="mt-3 h-72 w-full text-slate-500 dark:text-slate-400">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrend} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="applicationsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="week" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP_STYLES} />
              <Area
                type="monotone"
                dataKey="applications"
                name="Applications"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#applicationsFill)"
                dot={{ r: 2.5, strokeWidth: 0, fill: '#6366f1' }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <h2 className="section-title">Status breakdown</h2>
          <div className="mt-3 h-64 w-full text-slate-500 dark:text-slate-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusBreakdown}
                layout="vertical"
                margin={{ top: 5, right: 16, bottom: 0, left: 24 }}
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
                  dataKey="status"
                  width={84}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip {...TOOLTIP_STYLES} />
                <Bar dataKey="count" name="Applications" radius={[0, 6, 6, 0]} barSize={18}>
                  {statusBreakdown.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] ?? CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-pad">
          <h2 className="section-title">Pipeline funnel</h2>
          <div className="mt-3 h-64 w-full text-slate-500 dark:text-slate-400">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="stage" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLES} />
                <Bar dataKey="count" name="Applications" radius={[6, 6, 0, 0]} barSize={46}>
                  {funnel.map((entry, index) => (
                    <Cell key={entry.stage} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
