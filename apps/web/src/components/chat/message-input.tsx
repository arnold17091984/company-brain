"use client";

import { useRef, useState, type KeyboardEvent } from "react";

interface MessageInputProps {
	onSend?: (content: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

export function MessageInput({
	onSend,
	disabled = false,
	placeholder = "Ask anything about your company knowledge...",
}: MessageInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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
				className={`flex items-end gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm transition-colors ${
					disabled
						? "border-slate-200 opacity-60"
						: "border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/10"
				}`}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					onInput={handleInput}
					disabled={disabled}
					placeholder={placeholder}
					rows={1}
					className="flex-1 resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none min-h-[24px] max-h-[200px] py-0.5 leading-6"
					aria-label="Chat message"
				/>

				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label="Send message"
					className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-colors ${
						canSend
							? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
							: "bg-slate-100 text-slate-300 cursor-not-allowed"
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

			<p className="text-center text-xs text-slate-400 mt-2">
				Press Enter to send, Shift+Enter for new line
			</p>
		</div>
	);
}
