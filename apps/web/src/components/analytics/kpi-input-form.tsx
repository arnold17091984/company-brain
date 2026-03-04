"use client";

import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface User {
	id: string;
	name: string;
}

interface KPIPayload {
	user_id: string;
	period: string;
	kpi_name: string;
	target_value: number;
	actual_value: number;
}

interface FormErrors {
	user_id?: string;
	period?: string;
	kpi_name?: string;
	target_value?: string;
	actual_value?: string;
}

interface KPIInputFormProps {
	token: string;
	users?: User[];
	onSuccess?: () => void;
}

export function KPIInputForm({
	token,
	users = [],
	onSuccess,
}: KPIInputFormProps) {
	const [userId, setUserId] = useState("");
	const [period, setPeriod] = useState(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	});
	const [kpiName, setKpiName] = useState("");
	const [targetValue, setTargetValue] = useState("");
	const [actualValue, setActualValue] = useState("");
	const [errors, setErrors] = useState<FormErrors>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitResult, setSubmitResult] = useState<{
		type: "success" | "error";
		message: string;
	} | null>(null);

	const validate = (): boolean => {
		const newErrors: FormErrors = {};
		if (!userId.trim()) newErrors.user_id = "Please select a user";
		if (!period.trim()) newErrors.period = "Period is required";
		else if (!/^\d{4}-\d{2}$/.test(period))
			newErrors.period = "Format: YYYY-MM";
		if (!kpiName.trim()) newErrors.kpi_name = "KPI name is required";
		if (!targetValue.trim())
			newErrors.target_value = "Target value is required";
		else if (Number.isNaN(Number(targetValue)))
			newErrors.target_value = "Must be a number";
		if (!actualValue.trim())
			newErrors.actual_value = "Actual value is required";
		else if (Number.isNaN(Number(actualValue)))
			newErrors.actual_value = "Must be a number";
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;

		setIsSubmitting(true);
		setSubmitResult(null);

		const payload: KPIPayload = {
			user_id: userId,
			period,
			kpi_name: kpiName.trim(),
			target_value: Number(targetValue),
			actual_value: Number(actualValue),
		};

		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/analytics/kpi`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(
					(errData as { detail?: string }).detail ??
						`${res.status} ${res.statusText}`,
				);
			}

			setSubmitResult({
				type: "success",
				message: "KPI data saved successfully.",
			});
			// Reset form
			setUserId("");
			setKpiName("");
			setTargetValue("");
			setActualValue("");
			setErrors({});
			onSuccess?.();
		} catch (err) {
			setSubmitResult({
				type: "error",
				message: err instanceof Error ? err.message : "Failed to save KPI data",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const fieldClass = (hasError: boolean) =>
		`w-full px-3 py-2 text-sm rounded-lg border bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500 transition-colors ${
			hasError
				? "border-red-400 dark:border-red-600"
				: "border-zinc-200 dark:border-zinc-600"
		}`;

	const labelClass =
		"block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5";
	const errorClass = "mt-1 text-xs text-red-600 dark:text-red-400";

	return (
		<form onSubmit={handleSubmit} className="space-y-4" noValidate>
			{/* User selection */}
			<div>
				<label htmlFor="kpi-user" className={labelClass}>
					User
					<span className="text-red-500 ml-0.5" aria-hidden="true">
						*
					</span>
				</label>
				{users.length > 0 ? (
					<select
						id="kpi-user"
						value={userId}
						onChange={(e) => {
							setUserId(e.target.value);
							setErrors((p) => ({ ...p, user_id: undefined }));
						}}
						className={fieldClass(Boolean(errors.user_id))}
					>
						<option value="">Select a user...</option>
						{users.map((u) => (
							<option key={u.id} value={u.id}>
								{u.name}
							</option>
						))}
					</select>
				) : (
					<input
						id="kpi-user"
						type="text"
						value={userId}
						onChange={(e) => {
							setUserId(e.target.value);
							setErrors((p) => ({ ...p, user_id: undefined }));
						}}
						placeholder="User ID"
						className={fieldClass(Boolean(errors.user_id))}
					/>
				)}
				{errors.user_id && <p className={errorClass}>{errors.user_id}</p>}
			</div>

			{/* Period */}
			<div>
				<label htmlFor="kpi-period" className={labelClass}>
					Period (Month)
					<span className="text-red-500 ml-0.5" aria-hidden="true">
						*
					</span>
				</label>
				<input
					id="kpi-period"
					type="month"
					value={period}
					onChange={(e) => {
						setPeriod(e.target.value);
						setErrors((p) => ({ ...p, period: undefined }));
					}}
					className={fieldClass(Boolean(errors.period))}
				/>
				{errors.period && <p className={errorClass}>{errors.period}</p>}
			</div>

			{/* KPI Name */}
			<div>
				<label htmlFor="kpi-name" className={labelClass}>
					KPI Name
					<span className="text-red-500 ml-0.5" aria-hidden="true">
						*
					</span>
				</label>
				<input
					id="kpi-name"
					type="text"
					value={kpiName}
					onChange={(e) => {
						setKpiName(e.target.value);
						setErrors((p) => ({ ...p, kpi_name: undefined }));
					}}
					placeholder="e.g. Customer Satisfaction Score"
					className={fieldClass(Boolean(errors.kpi_name))}
				/>
				{errors.kpi_name && <p className={errorClass}>{errors.kpi_name}</p>}
			</div>

			{/* Target and Actual values */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label htmlFor="kpi-target" className={labelClass}>
						Target Value
						<span className="text-red-500 ml-0.5" aria-hidden="true">
							*
						</span>
					</label>
					<input
						id="kpi-target"
						type="number"
						step="any"
						value={targetValue}
						onChange={(e) => {
							setTargetValue(e.target.value);
							setErrors((p) => ({ ...p, target_value: undefined }));
						}}
						placeholder="100"
						className={fieldClass(Boolean(errors.target_value))}
					/>
					{errors.target_value && (
						<p className={errorClass}>{errors.target_value}</p>
					)}
				</div>
				<div>
					<label htmlFor="kpi-actual" className={labelClass}>
						Actual Value
						<span className="text-red-500 ml-0.5" aria-hidden="true">
							*
						</span>
					</label>
					<input
						id="kpi-actual"
						type="number"
						step="any"
						value={actualValue}
						onChange={(e) => {
							setActualValue(e.target.value);
							setErrors((p) => ({ ...p, actual_value: undefined }));
						}}
						placeholder="87"
						className={fieldClass(Boolean(errors.actual_value))}
					/>
					{errors.actual_value && (
						<p className={errorClass}>{errors.actual_value}</p>
					)}
				</div>
			</div>

			{/* Preview achievement */}
			{targetValue &&
				actualValue &&
				!Number.isNaN(Number(targetValue)) &&
				!Number.isNaN(Number(actualValue)) &&
				Number(targetValue) > 0 && (
					<div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-700/40 rounded-lg border border-zinc-200 dark:border-zinc-600">
						<svg
							className="w-4 h-4 text-indigo-500 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.75}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
							/>
						</svg>
						<span className="text-xs text-zinc-600 dark:text-zinc-400">
							Achievement rate:{" "}
							<span className="font-semibold text-indigo-600 dark:text-indigo-400">
								{((Number(actualValue) / Number(targetValue)) * 100).toFixed(1)}
								%
							</span>
						</span>
					</div>
				)}

			{/* Result feedback */}
			{submitResult && (
				<div
					className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
						submitResult.type === "success"
							? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
							: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
					}`}
					role="alert"
				>
					{submitResult.type === "success" ? (
						<svg
							className="w-4 h-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M4.5 12.75l6 6 9-13.5"
							/>
						</svg>
					) : (
						<svg
							className="w-4 h-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
							/>
						</svg>
					)}
					{submitResult.message}
				</div>
			)}

			{/* Submit */}
			<div className="flex justify-end pt-1">
				<button
					type="submit"
					disabled={isSubmitting}
					className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-700 dark:hover:bg-indigo-600"
				>
					{isSubmitting ? (
						<>
							<svg
								className="w-4 h-4 animate-spin"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								/>
							</svg>
							Saving...
						</>
					) : (
						<>
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							Save KPI
						</>
					)}
				</button>
			</div>
		</form>
	);
}
