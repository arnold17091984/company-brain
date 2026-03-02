"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useRef, useState } from "react";

interface MessageInputProps {
	onSend?: (content: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

export function MessageInput({
	onSend,
	disabled = false,
	placeholder,
}: MessageInputProps) {
	const t = useTranslations("chat");
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const resolvedPlaceholder = placeholder ?? t("placeholder");
	const canSend = value.trim().length > 0 && !disabled;

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend?.(trimmed);
		setValue("");
		// Reset textarea height
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleInput() {
		const el = textareaRef.current;
		if (!el) return;
		// Auto-resize up to ~8 lines
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	}

	return (
		<div className="max-w-3xl mx-auto">
			<div
				className={`flex items-end gap-3 rounded-2xl border bg-white dark:bg-stone-800 px-4 py-3 shadow-sm transition-colors ${
					disabled
						? "border-stone-200 dark:border-stone-700 opacity-60"
						: "border-stone-200 dark:border-stone-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10"
				}`}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					onInput={handleInput}
					disabled={disabled}
					placeholder={resolvedPlaceholder}
					rows={1}
					className="flex-1 resize-none bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none min-h-[24px] max-h-[200px] py-0.5 leading-6"
					aria-label="Chat message"
				/>

				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label="Send message"
					className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
						canSend
							? "bg-indigo-700 text-white hover:bg-indigo-800 active:bg-indigo-900 shadow-sm shadow-indigo-500/20"
							: "bg-stone-100 dark:bg-stone-700 text-stone-300 dark:text-stone-500 cursor-not-allowed"
					}`}
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
							d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
						/>
					</svg>
				</button>
			</div>

			<p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-2">
				{t("sendHint")}
			</p>
		</div>
	);
}
