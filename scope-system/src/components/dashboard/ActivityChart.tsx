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
} from "recharts";

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
      <div className="flex-1 flex items-center justify-center text-muted-foreground border-2 border-dashed border-border/50 rounded-lg">
        Waiting for AI to generate tags...
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-[300px] w-full mt-4">
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
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis 
            dataKey="label" 
            tick={{ fill: "#888", fontSize: 12 }} 
            tickLine={false}
            axisLine={{ stroke: "#333" }}
          />
          <YAxis 
            tick={{ fill: "#888", fontSize: 12 }} 
            tickLine={false}
            axisLine={{ stroke: "#333" }}
            allowDecimals={false}
          />
          <Tooltip 
            cursor={{ fill: "#ffffff10" }}
            contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", borderRadius: "8px" }}
            labelFormatter={(label) => `Minute ${label}`}
          />
          <Bar 
            dataKey="count" 
            fill="#3b82f6" 
            radius={[4, 4, 0, 0]}
            name="SRL Events"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
