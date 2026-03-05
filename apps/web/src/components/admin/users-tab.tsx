"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface UserSummary {
	id: string;
	email: string;
	name: string;
	department: string | null;
	department_id: string | null;
	access_level: string;
	role: string;
	telegram_id: number | null;
	created_at: string;
}

interface Department {
	id: string;
	name: string;
	slug: string;
	user_count: number;
}

// ---- AccessBadge ----------------------------------------------------------

function AccessBadge({ level }: { level: string }) {
	const colour =
		level === "all"
			? "text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-800"
			: level === "department"
				? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800"
				: "text-zinc-600 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-[#1e1e24] dark:border-white/[0.06]";
	return (
		<span
			className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${colour}`}
		>
			{level}
		</span>
	);
}

// ---- RoleBadge ------------------------------------------------------------

function RoleBadge({ role }: { role: string }) {
	const colour =
		role === "admin"
			? "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
			: role === "ceo" || role === "executive"
				? "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800"
				: role === "hr" || role === "manager"
					? "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800"
					: "text-zinc-600 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-[#1e1e24] dark:border-white/[0.06]";
	return (
		<span
			className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${colour}`}
		>
			{role}
		</span>
	);
}

// ---- DepartmentManager ----------------------------------------------------

function DepartmentManager({
	departments,
	onUpdate,
	getAccessToken,
}: {
	departments: Department[];
	onUpdate: () => Promise<void>;
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [newName, setNewName] = useState("");
	const [newSlug, setNewSlug] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const autoSlug = (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");

	const handleCreate = async () => {
		if (!newName.trim() || !newSlug.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/departments`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: newName.trim(),
					slug: newSlug.trim(),
				}),
			});
			if (res.status === 409) {
				setError(t("deptSlugExists"));
				return;
			}
			if (!res.ok) throw new Error(`${res.status}`);
			setNewName("");
			setNewSlug("");
			await onUpdate();
		} catch {
			setError(t("loadError"));
		} finally {
			setSaving(false);
		}
	};

	const handleUpdate = async (id: string) => {
		if (!editName.trim() || !editSlug.trim()) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/departments/${id}`,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: editName.trim(),
						slug: editSlug.trim(),
					}),
				},
			);
			if (res.status === 409) {
				setError(t("deptSlugExists"));
				return;
			}
			if (!res.ok) throw new Error(`${res.status}`);
			setEditingId(null);
			await onUpdate();
		} catch {
			setError(t("loadError"));
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!window.confirm(t("deptDeleteConfirm"))) return;
		setDeletingId(id);
		setError(null);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/departments/${id}`,
				{
					method: "DELETE",
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				},
			);
			if (res.status === 409) {
				setError(t("deptHasUsers"));
				return;
			}
			if (!res.ok) throw new Error(`${res.status}`);
			await onUpdate();
		} catch {
			setError(t("loadError"));
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="mt-8">
			<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">
				{t("departments")}
			</h3>

			{error && (
				<div className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] overflow-hidden">
				<table className="min-w-full divide-y divide-zinc-200 dark:divide-white/[0.04]">
					<thead className="bg-zinc-50 dark:bg-white/[0.02]">
						<tr>
							{[
								t("departmentName"),
								t("departmentSlug"),
								t("deptUsers"),
								t("actions"),
							].map((col) => (
								<th
									key={col}
									className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
								>
									{col}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
						{departments.map((dept, _dIdx) => (
							<tr
								key={dept.id}
								className="animate-fade-in opacity-0"
								style={{
									animationDelay: `${_dIdx * 50}ms`,
									animationFillMode: "forwards",
								}}
							>
								{editingId === dept.id ? (
									<>
										<td className="px-4 py-2">
											<input
												type="text"
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												className="w-full px-2 py-1 text-sm rounded-lg border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
											/>
										</td>
										<td className="px-4 py-2">
											<input
												type="text"
												value={editSlug}
												onChange={(e) => setEditSlug(e.target.value)}
												className="w-full px-2 py-1 text-sm rounded-lg border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
											/>
										</td>
										<td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
											{dept.user_count}
										</td>
										<td className="px-4 py-2">
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => handleUpdate(dept.id)}
													disabled={saving}
													className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg hover:brightness-110 transition-[filter,transform] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none disabled:opacity-50"
												>
													{t("saveConfig")}
												</button>
												<button
													type="button"
													onClick={() => setEditingId(null)}
													className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.04] rounded-lg hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-colors"
												>
													{t("cancel")}
												</button>
											</div>
										</td>
									</>
								) : (
									<>
										<td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100">
											{dept.name}
										</td>
										<td className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 font-mono">
											{dept.slug}
										</td>
										<td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
											{dept.user_count}
										</td>
										<td className="px-4 py-2">
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => {
														setEditingId(dept.id);
														setEditName(dept.name);
														setEditSlug(dept.slug);
													}}
													className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/[0.08] rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.15] transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
												>
													{t("edit")}
												</button>
												<button
													type="button"
													onClick={() => handleDelete(dept.id)}
													disabled={
														deletingId === dept.id || dept.user_count > 0
													}
													className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/[0.08] rounded-lg hover:bg-red-100 dark:hover:bg-red-500/[0.15] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
												>
													{t("delete")}
												</button>
											</div>
										</td>
									</>
								)}
							</tr>
						))}

						{/* Add new department row */}
						<tr className="bg-zinc-50/50 dark:bg-white/[0.01]">
							<td className="px-4 py-2">
								<input
									type="text"
									value={newName}
									onChange={(e) => {
										setNewName(e.target.value);
										if (!editingId) setNewSlug(autoSlug(e.target.value));
									}}
									placeholder={t("deptNamePlaceholder")}
									className="w-full px-2 py-1 text-sm rounded-lg border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-zinc-400"
								/>
							</td>
							<td className="px-4 py-2">
								<input
									type="text"
									value={newSlug}
									onChange={(e) => setNewSlug(e.target.value)}
									placeholder="slug"
									className="w-full px-2 py-1 text-sm rounded-lg border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono placeholder:text-zinc-400"
								/>
							</td>
							<td className="px-4 py-2" />
							<td className="px-4 py-2">
								<button
									type="button"
									onClick={handleCreate}
									disabled={saving || !newName.trim() || !newSlug.trim()}
									className="min-h-[32px] px-3 py-1 text-xs font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg hover:brightness-110 transition-[filter] disabled:opacity-50 shadow-sm shadow-indigo-500/25"
								>
									{saving ? "..." : t("deptAdd")}
								</button>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ---- UsersTab -------------------------------------------------------------

export function UsersTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [users, setUsers] = useState<UserSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [editRole, setEditRole] = useState("");
	const [editAccessLevel, setEditAccessLevel] = useState("");
	const [editDepartmentId, setEditDepartmentId] = useState<string | null>(null);
	const [editTelegramId, setEditTelegramId] = useState<string>("");
	const [saving, setSaving] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [createEmail, setCreateEmail] = useState("");
	const [createName, setCreateName] = useState("");
	const [createRole, setCreateRole] = useState("employee");
	const [createDepartmentId, setCreateDepartmentId] = useState<string | null>(
		null,
	);
	const [createAccessLevel, setCreateAccessLevel] = useState("restricted");
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: UserSummary[] = await res.json();
				if (!cancelled) setUsers(data);
			} catch {
				if (!cancelled) setError(t("loadError"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, t]);

	useEffect(() => {
		async function loadDepartments() {
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/departments`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (res.ok) {
					const data: Department[] = await res.json();
					setDepartments(data);
				}
			} catch {
				// Non-critical
			}
		}
		loadDepartments();
	}, [getAccessToken]);

	useEffect(() => {
		if (editingUser) {
			setEditRole(editingUser.role);
			setEditAccessLevel(editingUser.access_level);
			setEditDepartmentId(editingUser.department_id);
			setEditTelegramId(editingUser.telegram_id?.toString() ?? "");
		}
	}, [editingUser]);

	const handleSaveUser = async () => {
		if (!editingUser) return;
		setSaving(true);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/users/${editingUser.id}`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${getAccessToken()}`,
					},
					body: JSON.stringify({
						role: editRole,
						access_level: editAccessLevel,
						department_id: editDepartmentId,
						...(editTelegramId
							? { telegram_id: Number.parseInt(editTelegramId, 10) }
							: {}),
					}),
				},
			);
			if (!res.ok) throw new Error(`${res.status}`);
			setEditingUser(null);
			const usersRes = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (usersRes.ok) {
				setUsers(await usersRes.json());
			}
		} catch {
			setError(t("loadError"));
		} finally {
			setSaving(false);
		}
	};

	const handleCreateUser = async () => {
		setCreating(true);
		try {
			const body: Record<string, unknown> = {
				email: createEmail,
				name: createName,
				role: createRole,
				access_level: createAccessLevel,
			};
			if (createDepartmentId) body.department_id = createDepartmentId;
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
			if (res.status === 409) {
				alert(t("emailExists"));
				return;
			}
			if (!res.ok) throw new Error(`${res.status}`);
			setShowCreateModal(false);
			setCreateEmail("");
			setCreateName("");
			setCreateRole("employee");
			setCreateDepartmentId(null);
			setCreateAccessLevel("restricted");
			const listRes = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (listRes.ok) setUsers(await listRes.json());
		} catch {
			setError(t("loadError"));
		} finally {
			setCreating(false);
		}
	};

	const roleOptions = [
		"admin",
		"ceo",
		"executive",
		"hr",
		"manager",
		"employee",
	];
	const selectClass =
		"w-full px-3 py-2 text-sm rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/40 transition-colors";

	return (
		<div className="space-y-4 animate-fade-in">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
						{t("usersTitle")}
					</h2>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
						{t("usersSub")}
					</p>
				</div>
				<button
					type="button"
					onClick={() => setShowCreateModal(true)}
					className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] shadow-md shadow-indigo-500/25"
				>
					{t("addUser")}
				</button>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-zinc-200 dark:divide-white/[0.04]">
						<thead className="bg-zinc-50 dark:bg-white/[0.02]">
							<tr>
								{[
									t("userName"),
									t("userEmail"),
									t("userDept"),
									t("userAccess"),
									t("userRole"),
									t("userJoined"),
									t("actions"),
								].map((col) => (
									<th
										key={col}
										className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
							{loading ? (
								(["r0", "r1", "r2", "r3"] as const).map((rowKey) => (
									<tr key={rowKey} className="animate-pulse">
										{(["c0", "c1", "c2", "c3", "c4", "c5", "c6"] as const).map(
											(colKey) => (
												<td key={colKey} className="px-4 py-3">
													<div className="h-3 bg-zinc-200 dark:bg-white/[0.06] rounded w-24" />
												</td>
											),
										)}
									</tr>
								))
							) : users.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500"
									>
										—
									</td>
								</tr>
							) : (
								users.map((user) => (
									<tr
										key={user.id}
										className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
									>
										<td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
											{user.name}
										</td>
										<td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
											{user.email}
										</td>
										<td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
											{user.department ?? "—"}
										</td>
										<td className="px-4 py-3">
											<AccessBadge level={user.access_level} />
										</td>
										<td className="px-4 py-3">
											<RoleBadge role={user.role} />
										</td>
										<td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
											{new Date(user.created_at).toLocaleDateString(undefined, {
												dateStyle: "medium",
											})}
										</td>
										<td className="px-4 py-3">
											<button
												type="button"
												onClick={() => setEditingUser(user)}
												className="min-h-[44px] inline-flex items-center text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
											>
												{t("editUser")}
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Edit user modal */}
			{editingUser && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div className="bg-white dark:bg-[#1e1e24] rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4 p-6">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
								{t("editUser")}
							</h3>
							<button
								type="button"
								onClick={() => setEditingUser(null)}
								aria-label={t("cancel")}
								className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<div className="space-y-4">
							<div>
								<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
									{t("userName")}
								</p>
								<p className="text-sm text-zinc-900 dark:text-zinc-100">
									{editingUser.name}
								</p>
							</div>
							<div>
								<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
									{t("userEmail")}
								</p>
								<p className="text-sm text-zinc-500 dark:text-zinc-400">
									{editingUser.email}
								</p>
							</div>

							<div>
								<label
									htmlFor="edit-user-role"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userRole")}
								</label>
								<select
									id="edit-user-role"
									value={editRole}
									onChange={(e) => setEditRole(e.target.value)}
									className={selectClass}
								>
									{roleOptions.map((r) => (
										<option key={r} value={r}>
											{t(`role_${r}` as Parameters<typeof t>[0])}
										</option>
									))}
								</select>
							</div>

							<div>
								<label
									htmlFor="edit-user-access-level"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userAccessLevel")}
								</label>
								<select
									id="edit-user-access-level"
									value={editAccessLevel}
									onChange={(e) => setEditAccessLevel(e.target.value)}
									className={selectClass}
								>
									{["all", "department", "restricted"].map((l) => (
										<option key={l} value={l}>
											{l}
										</option>
									))}
								</select>
							</div>

							<div>
								<label
									htmlFor="edit-user-department"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userDept")}
								</label>
								<select
									id="edit-user-department"
									value={editDepartmentId ?? ""}
									onChange={(e) => setEditDepartmentId(e.target.value || null)}
									className={selectClass}
								>
									<option value="">— None —</option>
									{departments.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</div>

							<div>
								<label
									htmlFor="edit-user-telegram"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("telegramId")}
								</label>
								<input
									id="edit-user-telegram"
									type="number"
									value={editTelegramId}
									onChange={(e) => setEditTelegramId(e.target.value)}
									placeholder={t("telegramIdHint")}
									className={selectClass}
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3 mt-6">
							<button
								type="button"
								onClick={() => setEditingUser(null)}
								className="min-h-[44px] px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors duration-150"
							>
								{t("cancel")}
							</button>
							<button
								type="button"
								onClick={handleSaveUser}
								disabled={saving}
								className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-indigo-500/25"
							>
								{saving ? "..." : t("saveUser")}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Create user modal */}
			{showCreateModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div className="bg-white dark:bg-[#1e1e24] rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4 p-6">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
								{t("addUserTitle")}
							</h3>
							<button
								type="button"
								onClick={() => setShowCreateModal(false)}
								aria-label={t("cancel")}
								className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
							{t("addUserSub")}
						</p>
						<div className="space-y-4">
							<div>
								<label
									htmlFor="create-user-email"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userEmail")}
								</label>
								<input
									id="create-user-email"
									type="email"
									value={createEmail}
									onChange={(e) => setCreateEmail(e.target.value)}
									className={selectClass}
								/>
							</div>
							<div>
								<label
									htmlFor="create-user-name"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userName")}
								</label>
								<input
									id="create-user-name"
									type="text"
									value={createName}
									onChange={(e) => setCreateName(e.target.value)}
									className={selectClass}
								/>
							</div>
							<div>
								<label
									htmlFor="create-user-role"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userRole")}
								</label>
								<select
									id="create-user-role"
									value={createRole}
									onChange={(e) => setCreateRole(e.target.value)}
									className={selectClass}
								>
									{roleOptions.map((r) => (
										<option key={r} value={r}>
											{t(`role_${r}` as Parameters<typeof t>[0])}
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									htmlFor="create-user-dept"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userDept")}
								</label>
								<select
									id="create-user-dept"
									value={createDepartmentId ?? ""}
									onChange={(e) =>
										setCreateDepartmentId(e.target.value || null)
									}
									className={selectClass}
								>
									<option value="">— None —</option>
									{departments.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									htmlFor="create-user-access"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("userAccessLevel")}
								</label>
								<select
									id="create-user-access"
									value={createAccessLevel}
									onChange={(e) => setCreateAccessLevel(e.target.value)}
									className={selectClass}
								>
									{["all", "department", "restricted"].map((l) => (
										<option key={l} value={l}>
											{l}
										</option>
									))}
								</select>
							</div>
						</div>
						<div className="flex justify-end gap-3 mt-6">
							<button
								type="button"
								onClick={() => setShowCreateModal(false)}
								className="min-h-[44px] px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors duration-150"
							>
								{t("cancel")}
							</button>
							<button
								type="button"
								onClick={handleCreateUser}
								disabled={creating || !createEmail || !createName}
								className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-indigo-500/25"
							>
								{creating ? "..." : t("addUser")}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Department management section */}
			<DepartmentManager
				departments={departments}
				onUpdate={async () => {
					try {
						const res = await fetch(
							`${API_BASE_URL}/api/v1/admin/departments`,
							{
								headers: {
									Authorization: `Bearer ${getAccessToken()}`,
								},
							},
						);
						if (res.ok) setDepartments(await res.json());
					} catch {
						/* non-critical */
					}
				}}
				getAccessToken={getAccessToken}
			/>
		</div>
	);
}
