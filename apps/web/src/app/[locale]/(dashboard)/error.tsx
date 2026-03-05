"use client";

import { useEffect } from "react";

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Dashboard error:", error);
	}, [error]);

	return (
		<div className="flex flex-1 items-center justify-center p-8">
			<div className="max-w-md w-full text-center space-y-4">
				<div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
					<svg
						className="w-6 h-6 text-red-600 dark:text-red-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
						/>
					</svg>
				</div>
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					Something went wrong
				</h2>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					An unexpected error occurred. Please try again.
				</p>
				<button
					type="button"
					onClick={reset}
					className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-medium hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] shadow-md shadow-indigo-500/25"
				>
					Try again
				</button>
			</div>
		</div>
	);
}
