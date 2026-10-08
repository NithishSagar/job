/**
 * Shared recharts styling.
 *
 * Recharts renders inline SVG attributes rather than CSS classes, so dark mode
 * can't be handled with `dark:` utilities. These values are chosen to read
 * acceptably on both the light and the dark surface; anything that must flip
 * (tooltip background) uses a translucent slate that works either way.
 */

export const AXIS_TICK = { fill: 'currentColor', fontSize: 12 } as const;

export const GRID_STROKE = 'rgb(148 163 184 / 0.25)';

export const TOOLTIP_STYLES = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid rgb(148 163 184 / 0.35)',
    background: 'rgb(15 23 42 / 0.94)',
    color: '#f8fafc',
    fontSize: 12,
    boxShadow: '0 10px 30px rgb(2 6 23 / 0.35)',
  },
  labelStyle: { color: '#cbd5e1', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#f8fafc' },
} as const;
