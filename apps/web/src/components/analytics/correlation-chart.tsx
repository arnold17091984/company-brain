"use client";

import { useEffect, useState } from "react";
import {
	CartesianGrid,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

function useDarkMode() {
	const [isDark, setIsDark] = useState(false);
	useEffect(() => {
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const el = document.documentElement;
		const check = () => setIsDark(el.classList.contains("dark") || mql.matches);
		check();
		const obs = new MutationObserver(check);
		obs.observe(el, { attributes: true, attributeFilter: ["class"] });
		mql.addEventListener("change", check);
		return () => {
			obs.disconnect();
			mql.removeEventListener("change", check);
		};
	}, []);
	return isDark;
}

export interface CorrelationDataPoint {
	user_name: string;
	query_count: number;
	kpi_achievement_pct: number;
}

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{ payload: CorrelationDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
	if (!active || !payload || payload.length === 0) return null;

	const d = payload[0].payload;
	return (
		<div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2.5 text-xs">
			<p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
				{d.user_name}
			</p>
			<p className="text-zinc-500 dark:text-zinc-400">
				AI Queries:{" "}
				<span className="font-medium text-indigo-600 dark:text-indigo-400">
					{d.query_count}
				</span>
			</p>
			<p className="text-zinc-500 dark:text-zinc-400">
				KPI Achievement:{" "}
				<span className="font-medium text-green-600 dark:text-green-400">
					{d.kpi_achievement_pct.toFixed(1)}%
				</span>
			</p>
		</div>
	);
}

interface CorrelationChartProps {
	data: CorrelationDataPoint[];
}

export function CorrelationChart({ data }: CorrelationChartProps) {
	const isDark = useDarkMode();
	const axisColor = isDark ? "rgb(168 162 158)" : "rgb(120 113 108)"; // zinc-400 : zinc-500
	const gridColor = isDark ? "rgb(68 64 60)" : "rgb(231 229 228)"; // zinc-700 : zinc-200
	const lineColor = isDark ? "rgb(87 83 78)" : "rgb(214 211 209)"; // zinc-600 : zinc-300

	if (data.length === 0) {
		return (
			<output className="flex items-center justify-center h-64 text-sm text-zinc-400 dark:text-zinc-500">
				No correlation data available
			</output>
		);
	}

	return (
		<div
			role="img"
			aria-label="Scatter plot showing AI usage vs KPI achievement correlation"
		>
			<ResponsiveContainer width="100%" height={320}>
				<ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
					<CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
					<XAxis
						type="number"
						dataKey="query_count"
						name="AI Usage"
						label={{
							value: "AI Queries",
							position: "insideBottom",
							offset: -8,
							fontSize: 11,
							fill: axisColor,
						}}
						tick={{ fontSize: 11, fill: axisColor }}
						tickLine={false}
						axisLine={{ stroke: lineColor }}
					/>
					<YAxis
						type="number"
						dataKey="kpi_achievement_pct"
						name="KPI Achievement %"
						label={{
							value: "KPI %",
							angle: -90,
							position: "insideLeft",
							offset: 12,
							fontSize: 11,
							fill: axisColor,
						}}
						tick={{ fontSize: 11, fill: axisColor }}
						tickLine={false}
						axisLine={{ stroke: lineColor }}
						domain={[0, 100]}
					/>
					<Tooltip content={<CustomTooltip />} />
					<Scatter
						data={data}
						fill="rgb(79 70 229)"
						fillOpacity={0.7}
						stroke="rgb(67 56 202)"
						strokeWidth={1}
						r={6}
					/>
				</ScatterChart>
			</ResponsiveContainer>
		</div>
	);
}
