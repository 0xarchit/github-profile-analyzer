"use client";

import { cn } from "@/lib/utils";
import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LineChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, string | number | boolean | null>[];
  index: string;
  categories: string[];
  strokeColors?: string[];
  tooltipBgColor?: string;
  tooltipBorderColor?: string;
  gridColor?: string;
  valueFormatter?: (value: number) => string;
  showGrid?: boolean;
  showTooltip?: boolean;
  strokeWidth?: number;
  dotSize?: number;
  className?: string;
}

const DEFAULT_STROKE_COLORS = ["#ec4899", "#0ea5e9", "#facc15", "#22c55e"];

const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(
  (
    {
      data = [],
      index,
      categories = [],
      strokeColors = DEFAULT_STROKE_COLORS,
      tooltipBgColor = "#ffffff",
      tooltipBorderColor = "#000000",
      gridColor = "rgba(0,0,0,0.1)",
      valueFormatter = (value: number) => value.toString(),
      showGrid = true,
      showTooltip = true,
      strokeWidth = 4,
      dotSize = 6,
      className,
      ...props
    },
    ref,
  ) => {
    const palette =
      strokeColors.length > 0 ? strokeColors : DEFAULT_STROKE_COLORS;
    const formatNumericValue = (value: unknown): string => {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      return valueFormatter(value);
    };

    return (
      <div ref={ref} className={cn("h-80 w-full", className)} {...props}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart
            data={data}
            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
          >
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            )}

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
              tickFormatter={(value) => formatNumericValue(value)}
            />

            {showTooltip && (
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null;
                  return (
                    <div
                      className="neo-card p-3 shadow-neo border-[3px] min-w-30"
                      style={{
                        backgroundColor: tooltipBgColor,
                        borderColor: tooltipBorderColor,
                      }}
                    >
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
                              {formatNumericValue(entry.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
            )}

            {categories.map((category, idx) => {
              const strokeColor = palette[idx % palette.length];

              return (
                <Line
                  key={category}
                  type="monotone"
                  dataKey={category}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  dot={{
                    r: dotSize,
                    fill: "#ffffff",
                    stroke: strokeColor,
                    strokeWidth: 3,
                  }}
                  activeDot={{
                    r: dotSize + 2,
                    fill: strokeColor,
                    stroke: "#000000",
                    strokeWidth: 2,
                  }}
                />
              );
            })}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    );
  },
);

LineChart.displayName = "LineChart";

export { LineChart, type LineChartProps };
