"use client";

// ─── Types ───────────────────────────────────────────────────

interface ErrorBannerProps {
	readonly message: string;
	readonly onDismiss?: () => void;
	readonly className?: string;
}

// ─── ErrorBanner ─────────────────────────────────────────────

export function ErrorBanner({
	message,
	onDismiss,
	className = "",
}: ErrorBannerProps) {
	return (
		<div
			role="alert"
			aria-live="assertive"
			className={[
				"flex items-start gap-2.5 rounded-xl border px-4 py-3",
				"border-red-200 bg-red-50 text-red-700",
				"dark:border-red-500/20 dark:bg-red-950/30 dark:text-red-400",
				className,
			].join(" ")}
		>
			{/* Exclamation triangle icon */}
			<svg
				className="w-4 h-4 shrink-0 mt-0.5"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8 1.5L1 13.5h14L8 1.5zM8 6v3.5M8 11v.5"
				/>
			</svg>

			{/* Message */}
			<p className="flex-1 text-sm leading-snug">{message}</p>

			{/* Dismiss button (optional) */}
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss error"
					className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity duration-150"
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
			)}
		</div>
	);
}
