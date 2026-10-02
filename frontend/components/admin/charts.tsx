"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/*
 * Chart conventions (see the dataviz method): one hue per single-series chart,
 * fixed categorical order for multi-series (--series-1..3), thin marks with 4px
 * rounded data-ends, 2px surface gaps between stacked segments, recessive grid,
 * text in text colours (never the series colour), a legend for 2+ series, hover
 * tooltips everywhere, and a data table for every chart.
 */

const AXIS = { stroke: "var(--viz-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;

type Row = Record<string, string | number>;

function TooltipBox({ active, payload, label, format }: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  format?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{format ? format(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function DataTable({ rows, columns }: { rows: Row[]; columns: { key: string; label: string; format?: (v: string) => string }[] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show data table</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-muted-foreground">
              {columns.map((c) => <th key={c.key} className="py-1 pr-3 font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="py-1 pr-3 tabular-nums">{c.format ? c.format(String(r[c.key])) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border bg-card p-5 ${className ?? ""}`} aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Magnitude across categories: one hue, horizontal bars, value labels at the bar end. */
export function HBarChart({ data, label = (s: string) => s, valueLabel = "Count" }: {
  data: { name: string; count: number }[];
  label?: (name: string) => string;
  valueLabel?: string;
}) {
  const rows = data.map((d) => ({ ...d, label: label(d.name) }));
  const height = Math.max(120, rows.length * 30 + 20);
  return (
    <>
      <div style={{ height }} role="img" aria-label={rows.map((r) => `${r.label}: ${r.count}`).join(", ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={130} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<TooltipBox />} />
            <Bar dataKey="count" name={valueLabel} animationDuration={400} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
              <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} columns={[{ key: "label", label: "Category" }, { key: "count", label: valueLabel }]} />
    </>
  );
}

const weekLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Change over time for one measure: weekly columns. */
export function WeeklyColumns({ data, valueLabel }: { data: { week: string; count: number }[]; valueLabel: string }) {
  return (
    <>
      <div className="h-52" role="img" aria-label={`${valueLabel} per week`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="week" tickFormatter={weekLabel} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<TooltipBox format={(l) => `Week of ${weekLabel(l)}`} />} />
            <Bar dataKey="count" name={valueLabel} animationDuration={400} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={data} columns={[{ key: "week", label: "Week of", format: weekLabel }, { key: "count", label: valueLabel }]} />
    </>
  );
}

/** Two measures over time on one shared count axis, with a legend and crosshair tooltip. */
export function TwoLineChart({ data, a, b }: {
  data: Row[];
  a: { key: string; label: string };
  b: { key: string; label: string };
}) {
  return (
    <>
      <Legend items={[{ label: a.label, color: "var(--series-1)" }, { label: b.label, color: "var(--series-2)" }]} />
      <div className="h-52" role="img" aria-label={`${a.label} and ${b.label} per week`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="week" tickFormatter={weekLabel} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }} content={<TooltipBox format={(l) => `Week of ${weekLabel(l)}`} />} />
            <Line type="linear" animationDuration={400} dataKey={a.key} name={a.label} stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
            <Line type="linear" animationDuration={400} dataKey={b.key} name={b.label} stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        rows={data}
        columns={[{ key: "week", label: "Week of", format: weekLabel }, { key: a.key, label: a.label }, { key: b.key, label: b.label }]}
      />
    </>
  );
}

/** Parts of a whole per term: stacked columns, 2px surface gap between segments. */
export function StackedColumns({ data, series, xKey }: { data: Row[]; series: { key: string; label: string; color: string }[]; xKey: string }) {
  return (
    <>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="h-52" role="img" aria-label={`Outcomes per ${xKey}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey={xKey} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis allowDecimals={false} {...AXIS} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<TooltipBox />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                animationDuration={400}
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={40}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={data} columns={[{ key: xKey, label: "Term" }, ...series.map((s) => ({ key: s.key, label: s.label }))]} />
    </>
  );
}
