"use client";

import { getAccessToken } from "@/lib/session";
import type {
	ACLEntry,
	DocumentCategory,
	DocumentItem,
	UserRole,
} from "@/types";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

const HR_CATEGORIES: DocumentCategory[] = [
	"hr_evaluation",
	"hr_compensation",
	"hr_contract",
	"hr_attendance",
	"hr_skills",
	"hr_org",
	"hr_compliance",
];

const BUSINESS_CATEGORIES: DocumentCategory[] = [
	"engineering",
	"sales",
	"marketing",
	"finance",
	"policy",
	"onboarding",
	"project",
	"meeting_notes",
];

const HR_ROLES: Array<{ value: UserRole; labelKey: string }> = [
	{ value: "ceo", labelKey: "roleCeo" },
	{ value: "executive", labelKey: "roleExecutive" },
	{ value: "hr", labelKey: "roleHr" },
	{ value: "manager", labelKey: "roleManager" },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PAGE_SIZE = 20;

// ---- Source type icon -------------------------------------------------------

function SourceTypeIcon({ type }: { type: string }) {
	const base =
		"inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold shrink-0";

	switch (type) {
		case "google_drive":
			return (
				<span
					className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400`}
					title="Google Drive"
				>
					G
				</span>
			);
		case "notion":
			return (
				<span
					className={`${base} bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300`}
					title="Notion"
				>
					N
				</span>
			);
		case "telegram":
			return (
				<span
					className={`${base} bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400`}
					title="Telegram"
				>
					T
				</span>
			);
		default:
			// "upload" or anything else
			return (
				<span
					className={`${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400`}
					title="Upload"
				>
					U
				</span>
			);
	}
}

// ---- Status badge -----------------------------------------------------------

function StatusBadge({
	status,
	label,
}: {
	status: DocumentItem["status"];
	label: string;
}) {
	if (status === "processing") {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400">
				<svg
					className="w-3 h-3 animate-spin shrink-0"
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
				{label}
			</span>
		);
	}

	if (status === "indexed") {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 border bg-green-50 border-green-200 text-green-700 dark:bg-green-950/40 dark:border-green-800 dark:text-green-400">
				<svg
					className="w-3 h-3 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2.5}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M4.5 12.75l6 6 9-13.5"
					/>
				</svg>
				{label}
			</span>
		);
	}

	// error
	return (
		<span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 border bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400">
			<svg
				className="w-3 h-3 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2.5}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
			{label}
		</span>
	);
}

// ---- Category label helper --------------------------------------------------

function getCategoryLabel(
	cat: DocumentCategory,
	t: ReturnType<typeof useTranslations>,
): string {
	const keyMap: Record<DocumentCategory, string> = {
		general: t("categoryGeneral"),
		hr_evaluation: t("categoryHrEvaluation"),
		hr_compensation: t("categoryHrCompensation"),
		hr_contract: t("categoryHrContract"),
		hr_attendance: t("categoryHrAttendance"),
		hr_skills: t("categoryHrSkills"),
		hr_org: t("categoryHrOrg"),
		hr_compliance: t("categoryHrCompliance"),
		engineering: t("categoryEngineering"),
		sales: t("categorySales"),
		marketing: t("categoryMarketing"),
		finance: t("categoryFinance"),
		policy: t("categoryPolicy"),
		onboarding: t("categoryOnboarding"),
		project: t("categoryProject"),
		meeting_notes: t("categoryMeetingNotes"),
	};
	return keyMap[cat] ?? cat;
}

// ---- AI Classification Badge ------------------------------------------------

function AiClassificationBadge({
	aiClassification,
	t,
}: {
	aiClassification: DocumentItem["aiClassification"];
	t: ReturnType<typeof useTranslations>;
}) {
	if (!aiClassification) return null;
	const confidence = Math.round(aiClassification.confidence * 100);
	return (
		<span
			className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${
				aiClassification.overridden
					? "bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-zinc-700/40 dark:border-zinc-600 dark:text-zinc-400"
					: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-400"
			}`}
			title={t("aiConfidence", { confidence: String(confidence) })}
		>
			<span aria-hidden="true" className="text-[10px]">
				🤖
			</span>
			{t("aiClassified")}
			{!aiClassification.overridden && (
				<span className="text-[10px] opacity-70">{confidence}%</span>
			)}
		</span>
	);
}

// ---- Upload zone ------------------------------------------------------------

function UploadZone({
	onUpload,
	isUploading,
}: {
	onUpload: (
		file: File,
		category: DocumentCategory,
		acl: ACLEntry[],
		relatedEmployeeId: string,
	) => Promise<void>;
	isUploading: boolean;
}) {
	const t = useTranslations("documents");
	const [isDragging, setIsDragging] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [category, setCategory] = useState<DocumentCategory>("general");
	const [selectedRoles, setSelectedRoles] = useState<Set<UserRole>>(new Set());
	const [userEmailInput, setUserEmailInput] = useState("");
	const [addedUsers, setAddedUsers] = useState<string[]>([]);
	const [relatedEmployee, setRelatedEmployee] = useState("");
	const [aclError, setAclError] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const userEmailRef = useRef<HTMLInputElement>(null);

	const isHrCategory = category.startsWith("hr_");

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		const file = e.dataTransfer.files[0];
		if (file) setSelectedFile(file);
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) setSelectedFile(file);
		},
		[],
	);

	const toggleRole = useCallback((role: UserRole) => {
		setSelectedRoles((prev) => {
			const next = new Set(prev);
			if (next.has(role)) {
				next.delete(role);
			} else {
				next.add(role);
			}
			return next;
		});
		setAclError(false);
	}, []);

	const handleAddUser = useCallback(() => {
		const email = userEmailInput.trim();
		if (!email) return;
		setAddedUsers((prev) => (prev.includes(email) ? prev : [...prev, email]));
		setUserEmailInput("");
		setAclError(false);
		userEmailRef.current?.focus();
	}, [userEmailInput]);

	const handleRemoveUser = useCallback((email: string) => {
		setAddedUsers((prev) => prev.filter((e) => e !== email));
	}, []);

	const handleUpload = useCallback(async () => {
		if (!selectedFile || isUploading) return;

		if (isHrCategory && selectedRoles.size === 0 && addedUsers.length === 0) {
			setAclError(true);
			return;
		}

		const acl: ACLEntry[] = [
			...Array.from(selectedRoles).map(
				(role): ACLEntry => ({
					granteeType: "role",
					granteeId: role,
					permission: "read",
				}),
			),
			...addedUsers.map(
				(email): ACLEntry => ({
					granteeType: "user",
					granteeId: email,
					permission: "read",
				}),
			),
		];

		await onUpload(selectedFile, category, acl, relatedEmployee);
		setSelectedFile(null);
		setCategory("general");
		setSelectedRoles(new Set());
		setAddedUsers([]);
		setRelatedEmployee("");
		setAclError(false);
		if (inputRef.current) inputRef.current.value = "";
	}, [
		selectedFile,
		isUploading,
		isHrCategory,
		selectedRoles,
		addedUsers,
		category,
		relatedEmployee,
		onUpload,
	]);

	const categoryLabel = (cat: DocumentCategory): string =>
		getCategoryLabel(cat, t);

	return (
		<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5">
			<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-4">
				{t("uploadTitle")}
			</h2>

			{/* Drop zone */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Drop zone allows click via the hidden input */}
			<div
				className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
					isDragging
						? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30"
						: "border-zinc-300 hover:border-indigo-300 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-indigo-700 dark:hover:bg-zinc-700/30"
				}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={() => inputRef.current?.click()}
			>
				<input
					ref={inputRef}
					type="file"
					className="hidden"
					accept=".pdf,.docx,.txt,.md,.csv"
					onChange={handleFileChange}
					aria-label={t("uploadHint")}
				/>

				<div className="flex flex-col items-center gap-3">
					<div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
						<svg
							className="w-6 h-6 text-indigo-500 dark:text-indigo-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.75}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
							/>
						</svg>
					</div>

					{selectedFile ? (
						<div>
							<p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
								{selectedFile.name}
							</p>
							<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
								{(selectedFile.size / 1024).toFixed(1)} KB
							</p>
						</div>
					) : (
						<div>
							<p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
								{t("uploadHint")}
							</p>
							<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
								{t("supportedFormats")}
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Category + HR fields — shown only when a file is selected */}
			{selectedFile && (
				<div className="mt-4 space-y-4">
					{/* Category dropdown */}
					<div>
						<label
							htmlFor="doc-category"
							className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5"
						>
							{t("category")}
						</label>
						<select
							id="doc-category"
							value={category}
							onChange={(e) => {
								setCategory(e.target.value as DocumentCategory);
								setSelectedRoles(new Set());
								setAddedUsers([]);
								setAclError(false);
							}}
							className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
						>
							<option value="general">{t("categoryGeneral")}</option>
							<optgroup label="HR">
								{HR_CATEGORIES.map((cat) => (
									<option key={cat} value={cat}>
										{categoryLabel(cat)}
									</option>
								))}
							</optgroup>
							<optgroup label="Business">
								{BUSINESS_CATEGORIES.map((cat) => (
									<option key={cat} value={cat}>
										{categoryLabel(cat)}
									</option>
								))}
							</optgroup>
						</select>
					</div>

					{/* HR-only: Access control section */}
					{isHrCategory && (
						<div className="rounded-lg border border-zinc-200 dark:border-zinc-600 p-4 space-y-4 bg-zinc-50 dark:bg-zinc-700/40">
							<p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
								{t("accessControl")}
							</p>

							{/* Role-based access */}
							<div>
								<p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
									{t("accessByRole")}
								</p>
								<div className="flex flex-wrap gap-2">
									{HR_ROLES.map(({ value, labelKey }) => {
										const checked = selectedRoles.has(value);
										return (
											<label
												key={value}
												className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
													checked
														? "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-300"
														: "bg-white border-zinc-200 text-zinc-600 hover:border-indigo-200 dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-indigo-700"
												}`}
											>
												<input
													type="checkbox"
													className="sr-only"
													checked={checked}
													onChange={() => toggleRole(value)}
												/>
												{checked && (
													<svg
														className="w-3 h-3 shrink-0"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
														strokeWidth={2.5}
														aria-hidden="true"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															d="M4.5 12.75l6 6 9-13.5"
														/>
													</svg>
												)}
												{t(labelKey as Parameters<typeof t>[0])}
											</label>
										);
									})}
								</div>
							</div>

							{/* User-based access */}
							<div>
								<p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
									{t("accessByUser")}
								</p>
								<div className="flex gap-2">
									<input
										ref={userEmailRef}
										type="email"
										value={userEmailInput}
										onChange={(e) => setUserEmailInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleAddUser();
											}
										}}
										placeholder="user@company.com"
										className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
									/>
									<button
										type="button"
										onClick={handleAddUser}
										className="px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
									>
										{t("addUser")}
									</button>
								</div>

								{/* User chips */}
								{addedUsers.length > 0 && (
									<div className="flex flex-wrap gap-1.5 mt-2">
										{addedUsers.map((email) => (
											<span
												key={email}
												className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
											>
												{email}
												<button
													type="button"
													onClick={() => handleRemoveUser(email)}
													className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
													aria-label={`Remove ${email}`}
												>
													<svg
														className="w-2.5 h-2.5"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
														strokeWidth={2.5}
														aria-hidden="true"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															d="M6 18L18 6M6 6l12 12"
														/>
													</svg>
												</button>
											</span>
										))}
									</div>
								)}
							</div>

							{/* ACL validation error */}
							{aclError && (
								<p className="text-xs text-red-600 dark:text-red-400">
									{t("aclRequired")}
								</p>
							)}
						</div>
					)}

					{/* Related employee (optional, always visible when file selected) */}
					<div>
						<label
							htmlFor="related-employee"
							className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5"
						>
							{t("relatedEmployee")}
						</label>
						<input
							id="related-employee"
							type="email"
							value={relatedEmployee}
							onChange={(e) => setRelatedEmployee(e.target.value)}
							placeholder={t("relatedEmployeePlaceholder")}
							className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
						/>
					</div>

					{/* Upload button */}
					<div className="flex justify-end">
						<button
							type="button"
							disabled={isUploading}
							onClick={handleUpload}
							className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-700 dark:hover:bg-indigo-600"
						>
							{isUploading ? (
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
									{t("uploadButton")}…
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
											d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
										/>
									</svg>
									{t("uploadButton")}
								</>
							)}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ---- Table skeleton ---------------------------------------------------------

function TableSkeleton() {
	return (
		<>
			{Array.from({ length: 5 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows have no meaningful key
				<tr key={i} className="animate-pulse">
					<td className="px-4 py-3">
						<div className="flex items-center gap-3">
							<div className="w-6 h-6 rounded bg-zinc-200 dark:bg-zinc-700 shrink-0" />
							<div className="h-3.5 w-48 bg-zinc-200 dark:bg-zinc-700 rounded" />
						</div>
					</td>
					<td className="px-4 py-3">
						<div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-600 rounded" />
					</td>
					<td className="px-4 py-3">
						<div className="h-3.5 w-20 bg-zinc-100 dark:bg-zinc-600 rounded" />
					</td>
					<td className="px-4 py-3">
						<div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-600 rounded-full" />
					</td>
					<td className="px-4 py-3">
						<div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-600 rounded" />
					</td>
					<td className="px-4 py-3">
						<div className="h-6 w-6 bg-zinc-100 dark:bg-zinc-600 rounded" />
					</td>
				</tr>
			))}
		</>
	);
}

// ---- Page ------------------------------------------------------------------

interface DocumentsApiResponse {
	documents: DocumentItem[];
	total: number;
	page: number;
	page_size: number;
}

export default function DocumentsPage() {
	const t = useTranslations("documents");
	const { data: session } = useSession();

	const [documents, setDocuments] = useState<DocumentItem[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isUploading, setIsUploading] = useState(false);
	const [toast, setToast] = useState<{
		message: string;
		type: "success" | "error";
	} | null>(null);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	const showToast = useCallback(
		(message: string, type: "success" | "error") => {
			setToast({ message, type });
			setTimeout(() => setToast(null), 3500);
		},
		[],
	);

	// Fetch documents
	const loadDocuments = useCallback(
		async (targetPage: number, searchTerm: string) => {
			setIsLoading(true);
			try {
				const params = new URLSearchParams({
					page: String(targetPage),
					page_size: String(PAGE_SIZE),
				});
				if (searchTerm.trim()) {
					params.set("search", searchTerm.trim());
				}

				const res = await fetch(
					`${API_BASE_URL}/api/v1/documents?${params.toString()}`,
					{
						headers: { Authorization: `Bearer ${getToken()}` },
					},
				);

				if (!res.ok) throw new Error(`${res.status}`);

				const data: DocumentsApiResponse = await res.json();
				setDocuments(data.documents);
				setTotal(data.total);
			} catch {
				setDocuments([]);
				setTotal(0);
			} finally {
				setIsLoading(false);
			}
		},
		[getToken],
	);

	// Initial load and whenever page or search changes
	useEffect(() => {
		loadDocuments(page, search);
	}, [page, search, loadDocuments]);

	// Submit search (debounce via controlled input + explicit submit)
	const handleSearchSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			setPage(1);
			setSearch(searchInput);
		},
		[searchInput],
	);

	// Upload handler
	const handleUpload = useCallback(
		async (
			file: File,
			category: DocumentCategory,
			acl: ACLEntry[],
			relatedEmployeeId: string,
		) => {
			setIsUploading(true);
			try {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("category", category);
				if (acl.length > 0) {
					formData.append("acl", JSON.stringify(acl));
				}
				if (relatedEmployeeId.trim()) {
					formData.append("related_employee_id", relatedEmployeeId.trim());
				}

				const res = await fetch(`${API_BASE_URL}/api/v1/documents/upload`, {
					method: "POST",
					headers: { Authorization: `Bearer ${getToken()}` },
					body: formData,
				});

				if (!res.ok) throw new Error(`${res.status}`);

				showToast(t("uploadSuccess"), "success");
				// Reload first page to show the newly uploaded doc
				setPage(1);
				setSearch("");
				setSearchInput("");
				await loadDocuments(1, "");
			} catch {
				showToast(t("uploadError"), "error");
			} finally {
				setIsUploading(false);
			}
		},
		[getToken, showToast, t, loadDocuments],
	);

	// Delete handler
	const handleDelete = useCallback(
		async (id: string) => {
			if (!window.confirm(t("deleteConfirm"))) return;

			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${getToken()}` },
				});

				if (!res.ok) throw new Error(`${res.status}`);

				showToast(t("deleteSuccess"), "success");
				// Refresh current page (step back if the page is now empty)
				const newTotal = total - 1;
				const newTotalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
				const targetPage = Math.min(page, newTotalPages);
				setPage(targetPage);
				await loadDocuments(targetPage, search);
			} catch {
				// no-op; user stays on same state
			}
		},
		[getToken, showToast, t, total, page, search, loadDocuments],
	);

	const formatDate = (iso: string) => {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		} catch {
			return iso;
		}
	};

	const statusLabel = (status: DocumentItem["status"]) => {
		if (status === "processing") return t("statusProcessing");
		if (status === "indexed") return t("statusIndexed");
		return t("statusError");
	};

	const categoryLabel = (cat: DocumentCategory): string =>
		getCategoryLabel(cat, t);

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{/* Toast notification */}
			{toast && (
				<output
					className={`shrink-0 px-6 py-3 flex items-center gap-2 text-sm border-b ${
						toast.type === "success"
							? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
							: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
					}`}
					aria-live="polite"
				>
					{toast.type === "success" ? (
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					)}
					{toast.message}
				</output>
			)}

			{/* Main scrollable content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto space-y-6">
					{/* Upload zone */}
					<UploadZone onUpload={handleUpload} isUploading={isUploading} />

					{/* Documents table card */}
					<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
						{/* Table toolbar */}
						<div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-700">
							<form onSubmit={handleSearchSubmit} className="flex gap-2">
								<div className="relative flex-1 max-w-xs">
									<svg
										className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.75}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
										/>
									</svg>
									<input
										type="search"
										value={searchInput}
										onChange={(e) => setSearchInput(e.target.value)}
										placeholder={t("searchPlaceholder")}
										className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
									/>
								</div>
								<button
									type="submit"
									className="px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition-colors dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
								>
									<svg
										className="w-4 h-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.75}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
										/>
									</svg>
								</button>
							</form>
						</div>

						{/* Table */}
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-zinc-100 dark:border-zinc-800">
										<th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("columnTitle")}
										</th>
										<th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("columnType")}
										</th>
										<th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("category")}
										</th>
										<th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("columnStatus")}
										</th>
										<th className="px-4 py-3 text-left text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("columnDate")}
										</th>
										<th className="px-4 py-3 text-right text-[11px] font-medium text-zinc-400 dark:text-zinc-400 uppercase tracking-widest">
											{t("columnActions")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
									{isLoading ? (
										<TableSkeleton />
									) : documents.length === 0 ? (
										<tr>
											<td colSpan={6} className="px-4 py-16 text-center">
												<div className="flex flex-col items-center gap-3">
													<div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
														<svg
															className="w-6 h-6 text-zinc-400 dark:text-zinc-500"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															strokeWidth={1.5}
															aria-hidden="true"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
															/>
														</svg>
													</div>
													<p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
														{t("noDocuments")}
													</p>
													<p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">
														{t("noDocumentsHint")}
													</p>
												</div>
											</td>
										</tr>
									) : (
										documents.map((doc) => (
											<tr
												key={doc.id}
												className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
											>
												{/* Title */}
												<td className="px-4 py-3">
													<div className="flex items-center gap-3 min-w-0">
														<SourceTypeIcon type={doc.sourceType} />
														<span
															className="truncate font-medium text-zinc-800 dark:text-zinc-200 max-w-xs"
															title={doc.title}
														>
															{doc.title}
														</span>
														{doc.aiClassification && (
															<AiClassificationBadge
																aiClassification={doc.aiClassification}
																t={t}
															/>
														)}
													</div>
												</td>

												{/* Source type label */}
												<td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
													{doc.sourceType === "google_drive"
														? "Google Drive"
														: doc.sourceType.charAt(0).toUpperCase() +
															doc.sourceType.slice(1)}
												</td>

												{/* Category */}
												<td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">
													{doc.category ? categoryLabel(doc.category) : "-"}
												</td>

												{/* Status */}
												<td className="px-4 py-3 whitespace-nowrap">
													<StatusBadge
														status={doc.status}
														label={statusLabel(doc.status)}
													/>
												</td>

												{/* Date */}
												<td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
													{formatDate(doc.updatedAt)}
												</td>

												{/* Actions */}
												<td className="px-4 py-3 text-right">
													<button
														type="button"
														onClick={() => handleDelete(doc.id)}
														title={t("deleteConfirm")}
														className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors dark:hover:text-red-400 dark:hover:bg-red-950/30"
													>
														<svg
															className="w-4 h-4"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															strokeWidth={1.75}
															aria-hidden="true"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
															/>
														</svg>
													</button>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>

						{/* Pagination */}
						{!isLoading && total > 0 && (
							<div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-700">
								<p className="text-xs text-zinc-500 dark:text-zinc-400">
									{t("pagination", { page, total: totalPages })}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										disabled={page <= 1}
										onClick={() => setPage((p) => Math.max(1, p - 1))}
										className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
									>
										<svg
											className="w-3.5 h-3.5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M15.75 19.5L8.25 12l7.5-7.5"
											/>
										</svg>
										Prev
									</button>
									<button
										type="button"
										disabled={page >= totalPages}
										onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
										className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
									>
										Next
										<svg
											className="w-3.5 h-3.5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M8.25 4.5l7.5 7.5-7.5 7.5"
											/>
										</svg>
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
