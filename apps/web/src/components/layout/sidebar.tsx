"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
	label: string;
	href: string;
	icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
	{
		label: "Chat",
		href: "/chat",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
				/>
			</svg>
		),
	},
	{
		label: "Search",
		href: "/search",
		icon: (
			<svg
				className="w-5 h-5"
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
		),
	},
	{
		label: "Admin",
		href: "/admin",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
				/>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		),
	},
];

export function Sidebar() {
	const pathname = usePathname();
	const { data: session } = useSession();

	const userName = session?.user?.name ?? "User";
	const userEmail = session?.user?.email ?? "";

	return (
		<aside className="flex flex-col w-60 flex-shrink-0 bg-slate-900 text-slate-100">
			{/* Brand */}
			<div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-800">
				<div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
					<svg
						className="w-4 h-4 text-white"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
						/>
					</svg>
				</div>
				<span className="text-sm font-semibold text-white">Company Brain</span>
			</div>

			{/* Navigation */}
			<nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
				{NAV_ITEMS.map((item) => {
					const isActive =
						pathname === item.href || pathname.startsWith(`${item.href}/`);

					return (
						<Link
							key={item.href}
							href={item.href}
							className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
								isActive
									? "bg-blue-600 text-white"
									: "text-slate-400 hover:text-white hover:bg-slate-800"
							}`}
							aria-current={isActive ? "page" : undefined}
						>
							{item.icon}
							{item.label}
						</Link>
					);
				})}
			</nav>

			{/* Footer / user area */}
			<div className="border-t border-slate-800 px-3 py-4">
				<div className="flex items-center gap-3 px-3 py-2 rounded-lg">
					<div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
						<svg
							className="w-4 h-4 text-slate-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.75}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/>
						</svg>
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-medium text-slate-300 truncate">
							{userName}
						</p>
						<p className="text-xs text-slate-500 truncate">{userEmail}</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => signOut({ callbackUrl: "/login" })}
					className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
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
							d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
						/>
					</svg>
					Sign out
				</button>
			</div>
		</aside>
	);
}
