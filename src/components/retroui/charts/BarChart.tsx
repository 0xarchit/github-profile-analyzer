"use client";

import { cn } from "@/lib/utils";
import React from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, string | number | boolean | null>[];
  index: string;
  categories: string[];
  strokeColors?: string[];
  fillColors?: string[];
  gridColor?: string;
  valueFormatter?: (value: number) => string;
  showGrid?: boolean;
  showTooltip?: boolean;
  stacked?: boolean;
  alignment?: "vertical" | "horizontal";
  className?: string;
}

const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(
  (
    {
      data = [],
      index,
      categories = [],
      strokeColors = ["#ec4899", "#0ea5e9", "#facc15", "#22c55e"],
      fillColors = ["#ec4899", "#0ea5e9", "#facc15", "#22c55e"],
      gridColor = "rgba(0,0,0,0.1)",
      valueFormatter = (value: number) => value.toString(),
      showGrid = true,
      showTooltip = true,
      stacked = false,
      alignment = "vertical",
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div ref={ref} className={cn("h-80 w-full", className)} {...props}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart
            data={data}
            layout={alignment === "horizontal" ? "vertical" : undefined}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            )}

            {alignment === "horizontal" ? (
              <>
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                  tickFormatter={valueFormatter}
                />

                <YAxis
                  type="category"
                  dataKey={index}
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                  width={80}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey={index}
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  className="text-xs fill-muted-foreground"
                  tickFormatter={valueFormatter}
                />
              </>
            )}

            {showTooltip && (
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null;
                  return (
                    <div className="neo-card p-3 shadow-neo border-[3px] bg-white min-w-[120px]">
                      <p className="text-[10px] uppercase font-black mb-2 border-b-2 border-black pb-1">
                        {label}
                      </p>
                      <div className="space-y-1.5">
                        {payload.map((entry, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center gap-4"
                          >
                            <span className="text-[10px] font-bold uppercase opacity-60">
                              {entry.name}
                            </span>
                            <span
                              className="text-xs font-black tabular-nums"
                              style={{ color: entry.color as string }}
                            >
                              {valueFormatter(entry.value as number)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            )}

            {categories.map((category, catIdx) => {
              const fillColor = fillColors[catIdx] || fillColors[0];
              const strokeColor = strokeColors[catIdx] || strokeColors[0];

              return (
                <Bar
                  key={category}
                  dataKey={category}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={3}
                  radius={[0, 0, 0, 0]}
                  stackId={stacked ? "stack" : undefined}
                />
              );
            })}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    );
  },
);

BarChart.displayName = "BarChart";

export { BarChart, type BarChartProps };
