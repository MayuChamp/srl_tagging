"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { BarChart2 } from "lucide-react";

type Tag = {
  id: string | number;
  code_id: string;
  start_time: number;
};

interface ActivityChartProps {
  tags: Tag[];
}

export function ActivityChart({ tags }: ActivityChartProps) {
  const data = useMemo(() => {
    if (!tags || tags.length === 0) return [];

    // Find the max time to know how many bins we need
    const maxTime = Math.max(...tags.map((t) => t.start_time));
    const maxMinutes = Math.ceil(maxTime / 60) + 1; // Add 1 to ensure the last tag fits

    // Initialize bins
    const bins = Array.from({ length: maxMinutes }, (_, i) => ({
      minute: i,
      label: `${i}:00`,
      count: 0,
    }));

    // Populate bins
    tags.forEach((tag) => {
      const minute = Math.floor(tag.start_time / 60);
      if (bins[minute]) {
        bins[minute].count += 1;
      }
    });

    return bins;
  }, [tags]);

  if (data.length === 0) {
    return (
      <div className="empty-state flex-1">
        <div className="empty-state-icon" aria-hidden="true">
          <BarChart2 size={22} />
        </div>
        <div>
          <p className="empty-state-title">Waiting for AI to generate tags...</p>
          <p className="empty-state-text mt-1">Events will appear here per minute once tags exist</p>
        </div>
      </div>
    );
  }

  // Recharts takes CSS variables (not Tailwind classes), so every color
  // below follows the light/dark theme tokens. Single series in the brand
  // terracotta (var(--primary)); grid/axes are recessive solid hairlines.
  return (
    <div className="flex-1 min-h-[300px] w-full mt-2" role="figure" aria-label="SRL events per minute">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 0,
            left: -20,
            bottom: 5,
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={12}
            interval="preserveStartEnd"
            tickMargin={8}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)", opacity: 0.6 }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              color: "var(--popover-foreground)",
              borderRadius: 12,
              boxShadow: "var(--shadow-md)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            itemStyle={{ color: "var(--popover-foreground)" }}
            labelFormatter={(label) => `Minute ${label}`}
          />
          <Bar
            dataKey="count"
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            activeBar={{ fillOpacity: 0.8 }}
            name="SRL Events"
          />
          {data.length > 5 && (
            <Brush
              dataKey="label"
              height={25}
              stroke="var(--primary)"
              fill="var(--secondary)"
              travellerWidth={8}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
