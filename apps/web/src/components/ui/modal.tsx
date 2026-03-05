"use client";

import { type ReactNode, useEffect, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly title: string;
	readonly children: ReactNode;
	readonly size?: ModalSize;
}

// ─── Size mapping ────────────────────────────────────────────

const SIZE_CLASS: Record<ModalSize, string> = {
	sm: "max-w-sm",
	md: "max-w-lg",
	lg: "max-w-2xl",
};

// ─── Focusable element selector ──────────────────────────────

const FOCUSABLE_SELECTORS = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(", ");

// ─── Modal ───────────────────────────────────────────────────

export function Modal({
	isOpen,
	onClose,
	title,
	children,
	size = "md",
}: ModalProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);

	// Focus trap + Escape key handler
	useEffect(() => {
		if (!isOpen) return;

		// Remember who had focus before the modal opened
		previousFocusRef.current = document.activeElement as HTMLElement;

		// Focus first focusable element inside the dialog
		const dialog = dialogRef.current;
		if (dialog) {
			const firstFocusable =
				dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
			firstFocusable?.focus();
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				onClose();
				return;
			}

			// Tab trap — keep focus within the modal
			if (e.key === "Tab" && dialog) {
				const focusable = Array.from(
					dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
				).filter((el) => !el.closest("[aria-hidden='true']"));

				if (focusable.length === 0) {
					e.preventDefault();
					return;
				}

				const first = focusable[0];
				const last = focusable.at(-1);

				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			// Restore focus to the previously focused element
			previousFocusRef.current?.focus();
		};
	}, [isOpen, onClose]);

	// Prevent body scroll while open
	useEffect(() => {
		document.body.style.overflow = isOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		/* Overlay — full-screen backdrop */
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled globally via document keydown listener above
		<div
			className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
			style={{ zIndex: "var(--z-modal)" }}
			onClick={(e) => {
				// Close when clicking the backdrop directly (not the dialog panel)
				if (e.target === e.currentTarget) onClose();
			}}
			aria-hidden="true"
		>
			{/* Dialog panel — <dialog> element for native a11y semantics */}
			<dialog
				ref={dialogRef}
				open
				aria-labelledby="modal-title"
				aria-hidden="false"
				className={[
					"relative w-full bg-white dark:bg-[#1a1a1f]",
					"rounded-2xl shadow-lg dark:shadow-2xl dark:shadow-black/60",
					"border border-zinc-200/80 dark:border-white/[0.07]",
					"animate-scale-in p-0 m-0 max-h-none",
					SIZE_CLASS[size],
				].join(" ")}
				style={{ zIndex: "var(--z-modal)" }}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-white/[0.06]">
					<h2
						id="modal-title"
						className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight"
					>
						{title}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close dialog"
						className="p-1.5 rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] transition-all duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
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

				{/* Body */}
				<div className="px-6 py-4">{children}</div>
			</dialog>
		</div>
	);
}
