"use client";

import { cn } from "@/lib/utils";
import React from "react";
import {
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface PieChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, string | number | boolean | null>[];
  dataKey: string;
  nameKey: string;
  colors?: string[];
  tooltipBgColor?: string;
  tooltipBorderColor?: string;
  valueFormatter?: (value: number) => string;
  showTooltip?: boolean;
  innerRadius?: number;
  outerRadius?: number;
  className?: string;
}

const PieChart = React.forwardRef<HTMLDivElement, PieChartProps>(
  (
    {
      data = [],
      dataKey,
      nameKey,
      colors = ["#ec4899", "#0ea5e9", "#facc15", "#22c55e", "#a855f7"],
      tooltipBgColor = "#ffffff",
      tooltipBorderColor = "#000000",
      valueFormatter = (value: number) => value.toString(),
      showTooltip = true,
      innerRadius = 0,
      outerRadius = 100,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn("h-80 w-full min-w-0", className)}
        {...props}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={240}
        >
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              isAnimationActive={false}
              className="w-full h-full"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    (entry.color as string) || colors[index % colors.length]
                  }
                  stroke="#000000"
                  strokeWidth={3}
                />
              ))}
            </Pie>

            {showTooltip && (
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0];
                  return (
                    <div
                      className="neo-card p-3 shadow-neo border-[3px] min-w-30"
                      style={{
                        backgroundColor: tooltipBgColor,
                        borderColor: tooltipBorderColor,
                      }}
                    >
                      <p className="text-[10px] uppercase font-black mb-2 border-b-2 border-black pb-1">
                        {String(entry.name)}
                      </p>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-[10px] font-bold uppercase opacity-60">
                          Value
                        </span>
                        <span
                          className="text-xs font-black tabular-nums"
                          style={{ color: entry.payload.color || entry.color }}
                        >
                          {valueFormatter(entry.value as number)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    );
  },
);

PieChart.displayName = "PieChart";

export { PieChart, type PieChartProps };
