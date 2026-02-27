export function Header() {
	return (
		<header className="flex items-center justify-between h-14 px-6 bg-white border-b border-slate-200 flex-shrink-0">
			{/* Left: page title (overridable via slot in future) */}
			<div className="flex items-center gap-2">
				<span className="text-sm font-semibold text-slate-700">
					Company Brain
				</span>
			</div>

			{/* Right: user info */}
			<div className="flex items-center gap-3">
				<div className="hidden sm:flex flex-col items-end">
					<span className="text-xs font-medium text-slate-700 leading-tight">
						User Name
					</span>
					<span className="text-xs text-slate-400 leading-tight">
						user@company.com
					</span>
				</div>
				<div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
					<svg
						className="w-4 h-4 text-blue-600"
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
			</div>
		</header>
	);
}
