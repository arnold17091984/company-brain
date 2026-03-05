"use client";

import { Badge } from "@/components/ui/badge";
import { type Column, DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return iso;
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Source type icon ─────────────────────────────────────────────────────────

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

// ─── AI Classification badge ──────────────────────────────────────────────────

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

// ─── Document preview modal ───────────────────────────────────────────────────

interface DocumentPreviewModalProps {
	doc: DocumentItem | null;
	onClose: () => void;
	t: ReturnType<typeof useTranslations>;
}

function DocumentPreviewModal({ doc, onClose, t }: DocumentPreviewModalProps) {
	if (!doc) return null;

	const sourceLabel =
		doc.sourceType === "google_drive"
			? "Google Drive"
			: doc.sourceType.charAt(0).toUpperCase() + doc.sourceType.slice(1);

	const statusVariant =
		doc.status === "indexed"
			? "success"
			: doc.status === "processing"
				? "warning"
				: "danger";

	const statusLabel =
		doc.status === "indexed"
			? t("statusIndexed")
			: doc.status === "processing"
				? t("statusProcessing")
				: t("statusError");

	return (
		<Modal isOpen={!!doc} onClose={onClose} title={doc.title} size="lg">
			<div className="space-y-5">
				{/* Status + source row */}
				<div className="flex items-center gap-3 flex-wrap">
					<Badge variant={statusVariant}>{statusLabel}</Badge>
					<div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
						<SourceTypeIcon type={doc.sourceType} />
						<span>{sourceLabel}</span>
					</div>
					{doc.aiClassification && (
						<AiClassificationBadge
							aiClassification={doc.aiClassification}
							t={t}
						/>
					)}
				</div>

				{/* Metadata grid */}
				<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
					{doc.category && (
						<>
							<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
								{t("category")}
							</dt>
							<dd className="text-zinc-900 dark:text-zinc-100">
								{getCategoryLabel(doc.category, t)}
							</dd>
						</>
					)}
					{doc.mimeType && (
						<>
							<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
								{t("columnType")}
							</dt>
							<dd className="text-zinc-900 dark:text-zinc-100 font-mono text-xs">
								{doc.mimeType}
							</dd>
						</>
					)}
					{doc.fileSize !== undefined && (
						<>
							<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
								{t("fileSize")}
							</dt>
							<dd className="text-zinc-900 dark:text-zinc-100">
								{formatBytes(doc.fileSize)}
							</dd>
						</>
					)}
					{doc.relatedEmployeeId && (
						<>
							<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
								{t("relatedEmployee")}
							</dt>
							<dd className="text-zinc-900 dark:text-zinc-100">
								{doc.relatedEmployeeId}
							</dd>
						</>
					)}
					<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
						{t("columnDate")}
					</dt>
					<dd className="text-zinc-900 dark:text-zinc-100">
						{formatDate(doc.updatedAt)}
					</dd>
					<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
						{t("createdAt")}
					</dt>
					<dd className="text-zinc-900 dark:text-zinc-100">
						{formatDate(doc.createdAt)}
					</dd>
					{doc.indexedAt && (
						<>
							<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
								{t("indexedAt")}
							</dt>
							<dd className="text-zinc-900 dark:text-zinc-100">
								{formatDate(doc.indexedAt)}
							</dd>
						</>
					)}
					<dt className="text-zinc-500 dark:text-zinc-400 font-medium">
						{t("accessLevel")}
					</dt>
					<dd className="text-zinc-900 dark:text-zinc-100">
						{doc.accessLevel}
					</dd>
				</dl>

				{/* AI classification details */}
				{doc.aiClassification && !doc.aiClassification.overridden && (
					<div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/20 px-4 py-3 space-y-1.5">
						<p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
							{t("aiClassified")}
						</p>
						<p className="text-sm text-violet-900 dark:text-violet-200">
							{doc.aiClassification.category}
							{doc.aiClassification.suggestedDepartment &&
								` — ${doc.aiClassification.suggestedDepartment}`}
						</p>
						<p className="text-xs text-violet-600 dark:text-violet-400">
							{t("aiConfidence", {
								confidence: String(
									Math.round(doc.aiClassification.confidence * 100),
								),
							})}
						</p>
					</div>
				)}

				{/* Close button */}
				<div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-white/[0.06]">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
					>
						{t("close")}
					</button>
				</div>
			</div>
		</Modal>
	);
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

interface UploadZoneProps {
	onUpload: (
		file: File,
		category: DocumentCategory,
		acl: ACLEntry[],
		relatedEmployeeId: string,
	) => Promise<void>;
	isUploading: boolean;
	isDragOver: boolean;
}

function UploadZone({ onUpload, isUploading, isDragOver }: UploadZoneProps) {
	const t = useTranslations("documents");
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
					isDragOver
						? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/30"
						: "border-zinc-300 hover:border-indigo-300 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-indigo-700 dark:hover:bg-zinc-700/30"
				}`}
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

			{/* Category + HR fields */}
			{selectedFile && (
				<div className="mt-4 space-y-4">
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

					{/* HR-only: Access control */}
					{isHrCategory && (
						<div className="rounded-lg border border-zinc-200 dark:border-zinc-600 p-4 space-y-4 bg-zinc-50 dark:bg-zinc-700/40">
							<p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
								{t("accessControl")}
							</p>

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

							{aclError && (
								<p className="text-xs text-red-600 dark:text-red-400">
									{t("aclRequired")}
								</p>
							)}
						</div>
					)}

					{/* Related employee */}
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

// ─── Bulk action bar ──────────────────────────────────────────────────────────

interface BulkActionBarProps {
	selectedCount: number;
	onDelete: () => void;
	onClear: () => void;
	t: ReturnType<typeof useTranslations>;
}

function BulkActionBar({
	selectedCount,
	onDelete,
	onClear,
	t,
}: BulkActionBarProps) {
	if (selectedCount === 0) return null;

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1f] backdrop-blur-md animate-fade-in">
			<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
				{t("selectedCount", { count: String(selectedCount) })}
			</span>
			<div className="w-px h-4 bg-zinc-200 dark:bg-white/[0.08]" />
			<button
				type="button"
				onClick={onDelete}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors dark:bg-red-500/[0.1] dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/[0.15]"
			>
				<svg
					className="w-3.5 h-3.5"
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
				{t("deleteSelected", { count: String(selectedCount) })}
			</button>
			<button
				type="button"
				onClick={onClear}
				className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors dark:hover:text-zinc-300 dark:hover:bg-white/[0.06]"
				aria-label={t("clearSelection")}
			>
				<svg
					className="w-4 h-4"
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
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface DocumentsApiResponse {
	documents: DocumentItem[];
	total: number;
	page: number;
	page_size: number;
}

export default function DocumentsPage() {
	const t = useTranslations("documents");
	const { data: session } = useSession();
	const { addToast } = useToast();

	// ── Data state ──────────────────────────────────────────────────────────────
	const [documents, setDocuments] = useState<DocumentItem[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [isUploading, setIsUploading] = useState(false);
	const [fetchError, setFetchError] = useState<string | null>(null);

	// ── Selection state ─────────────────────────────────────────────────────────
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// ── Preview modal state ─────────────────────────────────────────────────────
	const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

	// ── Drag overlay state ──────────────────────────────────────────────────────
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const getToken = useCallback(() => getAccessToken(session), [session]);

	// ── Fetch documents ─────────────────────────────────────────────────────────
	const loadDocuments = useCallback(
		async (targetPage: number, searchTerm: string) => {
			setIsLoading(true);
			setFetchError(null);
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
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);

				if (!res.ok) throw new Error(`${res.status}`);

				const data: DocumentsApiResponse = await res.json();
				setDocuments(data.documents);
				setTotal(data.total);
			} catch {
				setFetchError(t("fetchError"));
				setDocuments([]);
				setTotal(0);
			} finally {
				setIsLoading(false);
			}
		},
		[getToken, t],
	);

	useEffect(() => {
		loadDocuments(page, search);
	}, [page, search, loadDocuments]);

	// ── Search ──────────────────────────────────────────────────────────────────
	const handleSearchSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			setPage(1);
			setSearch(searchInput);
			setSelectedIds(new Set());
		},
		[searchInput],
	);

	// ── Page-level drag & drop ──────────────────────────────────────────────────
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		dragCounterRef.current += 1;
		if (dragCounterRef.current === 1) setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) setIsDragOver(false);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		dragCounterRef.current = 0;
		setIsDragOver(false);
		// The actual file pick is handled inside UploadZone via the hidden input;
		// here we only need to dismiss the overlay.
	}, []);

	// ── Upload ──────────────────────────────────────────────────────────────────
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

				addToast(t("uploadSuccess"), "success");
				setPage(1);
				setSearch("");
				setSearchInput("");
				await loadDocuments(1, "");
			} catch {
				addToast(t("uploadError"), "error");
			} finally {
				setIsUploading(false);
			}
		},
		[getToken, addToast, t, loadDocuments],
	);

	// ── Single delete ───────────────────────────────────────────────────────────
	const handleDelete = useCallback(
		async (id: string) => {
			if (!window.confirm(t("deleteConfirm"))) return;

			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${getToken()}` },
				});

				if (!res.ok) throw new Error(`${res.status}`);

				addToast(t("deleteSuccess"), "success");
				const newTotal = total - 1;
				const newTotalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
				const targetPage = Math.min(page, newTotalPages);
				setPage(targetPage);
				setSelectedIds((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
				await loadDocuments(targetPage, search);
			} catch {
				addToast(t("deleteError"), "error");
			}
		},
		[getToken, addToast, t, total, page, search, loadDocuments],
	);

	// ── Bulk delete ─────────────────────────────────────────────────────────────
	const handleBulkDelete = useCallback(async () => {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) return;
		if (!window.confirm(t("bulkDeleteConfirm", { count: String(ids.length) })))
			return;

		let successCount = 0;
		for (const id of ids) {
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/documents/${id}`, {
					method: "DELETE",
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (res.ok) successCount += 1;
			} catch {
				// continue deleting remaining items
			}
		}

		setSelectedIds(new Set());
		if (successCount > 0) {
			addToast(
				t("bulkDeleteSuccess", { count: String(successCount) }),
				"success",
			);
		}
		const newTotal = Math.max(0, total - successCount);
		const newTotalPages = Math.max(1, Math.ceil(newTotal / PAGE_SIZE));
		const targetPage = Math.min(page, newTotalPages);
		setPage(targetPage);
		await loadDocuments(targetPage, search);
	}, [selectedIds, getToken, t, total, page, search, loadDocuments, addToast]);

	// ── Selection helpers ───────────────────────────────────────────────────────
	const allCurrentSelected =
		documents.length > 0 && documents.every((d) => selectedIds.has(d.id));

	const toggleSelectAll = useCallback(() => {
		if (allCurrentSelected) {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const d of documents) next.delete(d.id);
				return next;
			});
		} else {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				for (const d of documents) next.add(d.id);
				return next;
			});
		}
	}, [allCurrentSelected, documents]);

	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	// ── Table columns ───────────────────────────────────────────────────────────
	const columns: Column<DocumentItem>[] = [
		{
			key: "_select",
			label: "",
			align: "center",
			width: "w-10",
			render: (doc) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: row click is handled at the tr level in DataTable
				<span
					onClick={(e) => {
						e.stopPropagation();
						toggleSelect(doc.id);
					}}
					className="flex items-center justify-center"
				>
					<input
						type="checkbox"
						checked={selectedIds.has(doc.id)}
						onChange={() => toggleSelect(doc.id)}
						className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800"
						aria-label={`Select ${doc.title}`}
						onClick={(e) => e.stopPropagation()}
					/>
				</span>
			),
		},
		{
			key: "title",
			label: t("columnTitle"),
			sortable: true,
			render: (doc) => (
				<div className="flex items-center gap-2.5 min-w-0">
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
			),
		},
		{
			key: "sourceType",
			label: t("columnType"),
			sortable: true,
			render: (doc) => (
				<span className="text-zinc-500 dark:text-zinc-400">
					{doc.sourceType === "google_drive"
						? "Google Drive"
						: doc.sourceType.charAt(0).toUpperCase() + doc.sourceType.slice(1)}
				</span>
			),
		},
		{
			key: "status",
			label: t("columnStatus"),
			sortable: true,
			render: (doc) => {
				const variant =
					doc.status === "indexed"
						? "success"
						: doc.status === "processing"
							? "warning"
							: "danger";
				const label =
					doc.status === "indexed"
						? t("statusIndexed")
						: doc.status === "processing"
							? t("statusProcessing")
							: t("statusError");
				return <Badge variant={variant}>{label}</Badge>;
			},
		},
		{
			key: "updatedAt",
			label: t("columnDate"),
			sortable: true,
			render: (doc) => (
				<span className="text-zinc-500 dark:text-zinc-400">
					{formatDate(doc.updatedAt)}
				</span>
			),
		},
		{
			key: "_actions",
			label: t("columnActions"),
			align: "right",
			render: (doc) => (
				// biome-ignore lint/a11y/useKeyWithClickEvents: row click is handled at the tr level in DataTable
				<span onClick={(e) => e.stopPropagation()}>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							handleDelete(doc.id);
						}}
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
				</span>
			),
		},
	];

	// ── Empty state content ─────────────────────────────────────────────────────
	const emptyStateContent = (
		<EmptyState
			icon={
				<svg
					className="w-6 h-6"
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
			}
			title={t("noDocuments")}
			subtitle={t("noDocumentsHint")}
		/>
	);

	return (
		<div
			className="flex flex-col h-full relative"
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{/* Full-page drag overlay */}
			{isDragOver && (
				<div
					className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
					aria-hidden="true"
				>
					<div className="absolute inset-4 rounded-2xl border-2 border-dashed border-indigo-400 dark:border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 backdrop-blur-sm" />
					<div className="relative flex flex-col items-center gap-3 text-indigo-700 dark:text-indigo-300">
						<svg
							className="w-12 h-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.5}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
							/>
						</svg>
						<p className="text-lg font-semibold">{t("dropToUpload")}</p>
					</div>
				</div>
			)}

			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{/* Main scrollable content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto space-y-6">
					{/* Upload zone */}
					<UploadZone
						onUpload={handleUpload}
						isUploading={isUploading}
						isDragOver={isDragOver}
					/>

					{/* Fetch error */}
					{fetchError && (
						<ErrorBanner
							message={fetchError}
							onDismiss={() => setFetchError(null)}
						/>
					)}

					{/* Documents table card */}
					<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
						{/* Toolbar */}
						<div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 flex items-center gap-3">
							{/* Select-all checkbox */}
							{!isLoading && documents.length > 0 && (
								<input
									type="checkbox"
									checked={allCurrentSelected}
									onChange={toggleSelectAll}
									className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800"
									aria-label={t("selectAll")}
								/>
							)}

							{/* Search form */}
							<form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1">
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

						{/* DataTable */}
						<DataTable<DocumentItem>
							columns={columns}
							data={documents}
							isLoading={isLoading}
							loadingRows={5}
							rowKey={(doc) => doc.id}
							onRowClick={(doc) => setPreviewDoc(doc)}
							emptyState={emptyStateContent}
							className="rounded-none border-0"
						/>

						{/* Pagination */}
						{!isLoading && total > 0 && (
							<div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-700">
								<Pagination
									page={page}
									totalPages={totalPages}
									totalItems={total}
									onPageChange={(p) => {
										setPage(p);
										setSelectedIds(new Set());
									}}
								/>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Document preview modal */}
			<DocumentPreviewModal
				doc={previewDoc}
				onClose={() => setPreviewDoc(null)}
				t={t}
			/>

			{/* Floating bulk action bar */}
			<BulkActionBar
				selectedCount={selectedIds.size}
				onDelete={handleBulkDelete}
				onClear={() => setSelectedIds(new Set())}
				t={t}
			/>
		</div>
	);
}
