"use client";

import { useEffect } from "react";

export default function AuthError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Auth error:", error);
	}, [error]);

	return (
		<div className="flex min-h-screen items-center justify-center p-8 bg-zinc-50 dark:bg-[#0e0e11]">
			<div className="max-w-sm w-full text-center space-y-4">
				<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					Authentication Error
				</h2>
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Something went wrong during authentication.
				</p>
				<button
					type="button"
					onClick={reset}
					className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-medium hover:brightness-110 transition-[filter] duration-150 shadow-md shadow-indigo-500/25"
				>
					Try again
				</button>
			</div>
		</div>
	);
}
