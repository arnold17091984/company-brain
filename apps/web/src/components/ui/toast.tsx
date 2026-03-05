"use client";

import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

// ─── Types ───────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
	id: string;
	message: string;
	variant: ToastVariant;
	exiting: boolean;
}

interface ToastContextValue {
	addToast: (message: string, variant?: ToastVariant) => void;
}

// ─── Context ─────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ─── Constants ───────────────────────────────────────────────

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const EXIT_ANIMATION_MS = 200;

// ─── Variant config ──────────────────────────────────────────

interface VariantConfig {
	borderClass: string;
	iconColorClass: string;
	icon: ReactNode;
}

function CheckIcon() {
	return (
		<svg
			className="w-4 h-4 shrink-0"
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
	);
}

function XCircleIcon() {
	return (
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
				d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}

function InfoIcon() {
	return (
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
				d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
			/>
		</svg>
	);
}

function WarningIcon() {
	return (
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
				d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
			/>
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg
			className="w-3.5 h-3.5"
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
	);
}

const VARIANT_CONFIG: Record<ToastVariant, VariantConfig> = {
	success: {
		borderClass: "border-l-green-500",
		iconColorClass: "text-green-500 dark:text-green-400",
		icon: <CheckIcon />,
	},
	error: {
		borderClass: "border-l-red-500",
		iconColorClass: "text-red-500 dark:text-red-400",
		icon: <XCircleIcon />,
	},
	info: {
		borderClass: "border-l-indigo-500",
		iconColorClass: "text-indigo-500 dark:text-indigo-400",
		icon: <InfoIcon />,
	},
	warning: {
		borderClass: "border-l-amber-500",
		iconColorClass: "text-amber-500 dark:text-amber-400",
		icon: <WarningIcon />,
	},
};

// ─── ToastItem ───────────────────────────────────────────────

interface ToastItemProps {
	readonly toast: Toast;
	readonly onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
	const config = VARIANT_CONFIG[toast.variant];

	return (
		<div
			role="alert"
			aria-live="polite"
			className={[
				"glass rounded-xl border-l-4 shadow-lg px-4 py-3",
				"flex items-start gap-3 min-w-[280px] max-w-[420px] w-full",
				config.borderClass,
				toast.exiting ? "animate-toast-exit" : "animate-toast-enter",
			].join(" ")}
		>
			{/* Variant icon */}
			<span className={`mt-0.5 ${config.iconColorClass}`}>{config.icon}</span>

			{/* Message */}
			<p className="flex-1 text-sm text-zinc-700 dark:text-zinc-200 leading-snug">
				{toast.message}
			</p>

			{/* Dismiss button */}
			<button
				type="button"
				onClick={() => onDismiss(toast.id)}
				aria-label="Dismiss notification"
				className="shrink-0 mt-0.5 p-0.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
			>
				<CloseIcon />
			</button>
		</div>
	);
}

// ─── ToastProvider ───────────────────────────────────────────

export function ToastProvider({ children }: { readonly children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	// Map of toast id -> auto-dismiss timer
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	const removeToast = useCallback((id: string) => {
		// Trigger exit animation first
		setToasts((prev) =>
			prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
		);
		// Remove from DOM after animation completes
		const exitTimer = setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, EXIT_ANIMATION_MS);
		timersRef.current.set(`exit-${id}`, exitTimer);
	}, []);

	const addToast = useCallback(
		(message: string, variant: ToastVariant = "info") => {
			const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
			const newToast: Toast = { id, message, variant, exiting: false };

			setToasts((prev) => {
				// Cap at MAX_TOASTS — drop the oldest if needed
				const trimmed =
					prev.length >= MAX_TOASTS
						? prev.slice(prev.length - MAX_TOASTS + 1)
						: prev;
				return [...trimmed, newToast];
			});

			// Schedule auto-dismiss
			const timer = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
			timersRef.current.set(id, timer);
		},
		[removeToast],
	);

	// Clean up all timers on unmount
	useEffect(() => {
		const timers = timersRef.current;
		return () => {
			for (const timer of timers.values()) {
				clearTimeout(timer);
			}
		};
	}, []);

	return (
		<ToastContext.Provider value={{ addToast }}>
			{children}

			{/* Toast container — fixed top-center */}
			{toasts.length > 0 && (
				<div
					aria-label="Notifications"
					className="fixed top-4 inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none"
					style={{ zIndex: "var(--z-toast)" }}
				>
					{toasts.map((toast) => (
						<div
							key={toast.id}
							className="pointer-events-auto w-full flex justify-center"
						>
							<ToastItem toast={toast} onDismiss={removeToast} />
						</div>
					))}
				</div>
			)}
		</ToastContext.Provider>
	);
}

// ─── useToast hook ───────────────────────────────────────────

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return ctx;
}
