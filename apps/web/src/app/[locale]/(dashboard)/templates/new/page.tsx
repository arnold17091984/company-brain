"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Category = "cs" | "marketing" | "development" | "accounting" | "general_affairs";

interface Template {
	id: string;
	title: string;
	description: string;
	content: string;
	category: Category;
}

interface FormErrors {
	title?: string;
	content?: string;
}

const CATEGORIES: { value: Category; labelKey: string }[] = [
	{ value: "cs", labelKey: "categoryCs" },
	{ value: "marketing", labelKey: "categoryMarketing" },
	{ value: "development", labelKey: "categoryDevelopment" },
	{ value: "accounting", labelKey: "categoryAccounting" },
	{ value: "general_affairs", labelKey: "categoryGeneralAffairs" },
];

export default function TemplateFormPage() {
	const { data: session } = useSession();
	const t = useTranslations("templates");
	const router = useRouter();
	const searchParams = useSearchParams();

	const editId = searchParams.get("edit");
	const isEditing = Boolean(editId);

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const [category, setCategory] = useState<Category>("cs");
	const [errors, setErrors] = useState<FormErrors>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isLoadingEdit, setIsLoadingEdit] = useState(isEditing);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const getToken = useCallback(() => {
		return (session as { accessToken?: string } | null)?.accessToken ?? "dev-token";
	}, [session]);

	// Load existing template when editing
	useEffect(() => {
		if (!editId) return;

		let cancelled = false;

		async function load() {
			setIsLoadingEdit(true);
			setLoadError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/templates/${editId}`, {
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: Template = await res.json();
				if (!cancelled) {
					setTitle(data.title);
					setDescription(data.description ?? "");
					setContent(data.content);
					setCategory(data.category);
				}
			} catch (err) {
				if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load template");
			} finally {
				if (!cancelled) setIsLoadingEdit(false);
			}
		}

		load();
		return () => { cancelled = true; };
	}, [editId, getToken]);

	const validate = (): boolean => {
		const newErrors: FormErrors = {};
		if (!title.trim()) newErrors.title = t("errorTitleRequired");
		if (!content.trim()) newErrors.content = t("errorContentRequired");
		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;

		setIsSubmitting(true);
		setSubmitError(null);

		const payload = { title: title.trim(), description: description.trim(), content: content.trim(), category };

		try {
			let res: Response;
			if (isEditing && editId) {
				res = await fetch(`${API_BASE_URL}/api/v1/templates/${editId}`, {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${getToken()}`,
					},
					body: JSON.stringify(payload),
				});
			} else {
				res = await fetch(`${API_BASE_URL}/api/v1/templates`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${getToken()}`,
					},
					body: JSON.stringify(payload),
				});
			}

			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

			const saved: Template = await res.json();
			router.push(`../templates/${saved.id}`);
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Failed to save template");
			setIsSubmitting(false);
		}
	};

	if (isLoadingEdit) {
		return (
			<div className="flex flex-col h-full">
				<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
					<div className="h-5 w-40 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
				</div>
				<div className="flex-1 flex items-center justify-center">
					<svg className="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
						<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
						<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
					</svg>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
				<div className="flex items-center gap-3">
					<Link
						href={isEditing && editId ? `../templates/${editId}` : "../templates"}
						className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
						{t("back")}
					</Link>
					<span className="text-stone-300 dark:text-stone-600">/</span>
					<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
						{isEditing ? t("editTemplate") : t("newTemplate")}
					</h1>
				</div>
			</div>

			{/* Form */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-2xl mx-auto">
					{loadError && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-6">
							<p className="text-sm text-red-700 dark:text-red-400">{loadError}</p>
						</div>
					)}

					<form onSubmit={handleSubmit} noValidate className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6 space-y-5">
						{/* Title */}
						<div>
							<label htmlFor="tpl-title" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
								{t("fieldTitle")}
								<span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
							</label>
							<input
						id="tpl-title"
						type="text"
						aria-required="true"
						value={title}
						onChange={(e) => { setTitle(e.target.value); setErrors((prev) => ({ ...prev, title: undefined })); }}
						placeholder={t("fieldTitlePlaceholder")}
								className={`w-full px-3 py-2 text-sm rounded-lg border bg-stone-50 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 transition-colors ${
									errors.title
										? "border-red-400 dark:border-red-600"
										: "border-stone-200 dark:border-stone-600"
								}`}
							/>
							{errors.title && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.title}</p>
							)}
						</div>

						{/* Description */}
						<div>
							<label htmlFor="tpl-desc" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
								{t("fieldDescription")}
							</label>
							<textarea
								id="tpl-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={t("fieldDescriptionPlaceholder")}
								rows={3}
								className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 resize-none"
							/>
						</div>

						{/* Category */}
						<div>
							<label htmlFor="tpl-category" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
								{t("fieldCategory")}
							</label>
							<select
								id="tpl-category"
								value={category}
								onChange={(e) => setCategory(e.target.value as Category)}
								className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
							>
								{CATEGORIES.map((cat) => (
									<option key={cat.value} value={cat.value}>
										{t(cat.labelKey as Parameters<typeof t>[0])}
									</option>
								))}
							</select>
						</div>

						{/* Content */}
						<div>
							<label htmlFor="tpl-content" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5">
								{t("fieldContent")}
								<span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
							</label>
							<textarea
						id="tpl-content"
						aria-required="true"
						value={content}
						onChange={(e) => { setContent(e.target.value); setErrors((prev) => ({ ...prev, content: undefined })); }}
						placeholder={t("fieldContentPlaceholder")}
								rows={12}
								className={`w-full px-3 py-2 text-sm font-mono rounded-lg border bg-stone-50 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 resize-y ${
									errors.content
										? "border-red-400 dark:border-red-600"
										: "border-stone-200 dark:border-stone-600"
								}`}
							/>
							{errors.content && (
								<p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.content}</p>
							)}
						</div>

						{/* Submit error */}
						{submitError && (
							<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
								<svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
								</svg>
								<p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
							</div>
						)}

						{/* Actions */}
						<div className="flex items-center justify-end gap-3 pt-2">
							<Link
								href={isEditing && editId ? `../templates/${editId}` : "../templates"}
								className="px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
							>
								{t("cancel")}
							</Link>
							<button
								type="submit"
								disabled={isSubmitting}
								className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-700 dark:hover:bg-indigo-600"
							>
								{isSubmitting ? (
									<>
										<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
										</svg>
										{t("saving")}
									</>
								) : (
									t("save")
								)}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
