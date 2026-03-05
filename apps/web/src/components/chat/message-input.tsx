"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

interface MessageInputProps {
	onSend?: (content: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

const MAX_LINES = 6;
const CHAR_COUNT_THRESHOLD = 100;

export function MessageInput({
	onSend,
	disabled = false,
	placeholder,
}: MessageInputProps) {
	const t = useTranslations("chat");
	const [value, setValue] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const [isVoiceSupported, setIsVoiceSupported] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const recognitionRef = useRef<SpeechRecognition | null>(null);

	const resolvedPlaceholder = placeholder ?? t("placeholder");
	const canSend = value.trim().length > 0 && !disabled;
	const charCount = value.length;
	const showCharCount = charCount > CHAR_COUNT_THRESHOLD;

	// Detect Mac using the modern userAgentData API with navigator.platform as fallback
	const isMac =
		(
			navigator as Navigator & { userAgentData?: { platform?: string } }
		).userAgentData?.platform
			?.toLowerCase()
			.includes("mac") ?? navigator.userAgent.toLowerCase().includes("mac");

	// Container border/shadow classes derived independently to avoid nested ternaries
	function getContainerClass(): string {
		if (disabled) {
			return "border-zinc-200/60 dark:border-white/[0.05] bg-white/60 dark:bg-[#1a1a1f]/60 opacity-70 cursor-not-allowed";
		}
		if (isFocused) {
			return "border-indigo-400/50 dark:border-indigo-500/40 bg-white dark:bg-[#1a1a1f] shadow-lg shadow-indigo-500/[0.08] dark:shadow-indigo-500/[0.12] ring-1 ring-indigo-400/20 dark:ring-indigo-500/20";
		}
		return "border-zinc-200/80 dark:border-white/[0.07] bg-white dark:bg-[#1a1a1f] shadow-sm dark:shadow-xl dark:shadow-black/30";
	}

	// Character count colour derived independently to avoid nested ternaries
	function getCharCountClass(): string {
		if (charCount > 4000) return "text-red-400";
		if (charCount > 2000) return "text-amber-400";
		return "text-zinc-400/70 dark:text-zinc-600";
	}

	useEffect(() => {
		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		setIsVoiceSupported(!!SpeechRecognition);
	}, []);

	function autoResize() {
		const el = textareaRef.current;
		if (!el) return;
		// Reset to measure natural scrollHeight
		el.style.height = "auto";
		// Compute line-height to cap at MAX_LINES
		const lineHeight =
			Number.parseInt(getComputedStyle(el).lineHeight, 10) || 24;
		const maxHeight = lineHeight * MAX_LINES + 24; // +24px for padding
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
	}

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend?.(trimmed);
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			handleSend();
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setValue(e.target.value);
		autoResize();
	}

	function handleMicClick() {
		if (isRecording) {
			recognitionRef.current?.stop();
			return;
		}

		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognition) return;

		const recognition = new SpeechRecognition();
		recognition.continuous = true;
		recognition.interimResults = false;
		recognition.lang = navigator.language || "en-US";

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			let transcript = "";
			for (let i = event.resultIndex; i < event.results.length; i++) {
				if (event.results[i].isFinal) {
					transcript += event.results[i][0].transcript;
				}
			}
			if (transcript) {
				setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
				// Trigger resize after voice input
				requestAnimationFrame(() => autoResize());
			}
		};

		recognition.onend = () => {
			setIsRecording(false);
			recognitionRef.current = null;
		};

		recognition.onerror = () => {
			setIsRecording(false);
			recognitionRef.current = null;
		};

		recognitionRef.current = recognition;
		recognition.start();
		setIsRecording(true);
	}

	return (
		<div className="max-w-3xl mx-auto">
			{/* Glass-morphism input container */}
			<div
				className={`relative flex flex-col rounded-2xl border transition-[border-color,box-shadow] duration-200 ${getContainerClass()}`}
			>
				{/* Textarea row */}
				<div className="flex items-end gap-3 px-4 pt-3 pb-2">
					<textarea
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						disabled={disabled}
						placeholder={resolvedPlaceholder}
						rows={1}
						className="flex-1 resize-none bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600 focus:outline-none min-h-[36px] py-1.5 leading-6 overflow-y-auto"
						aria-label="Chat message"
						aria-multiline="true"
					/>
				</div>

				{/* Actions row */}
				<div className="flex items-center justify-between px-3 pb-3">
					{/* Left: voice button */}
					<div className="flex items-center gap-1.5">
						{isVoiceSupported && (
							<button
								type="button"
								onClick={handleMicClick}
								aria-label={isRecording ? t("voiceStop") : t("voiceStart")}
								aria-pressed={isRecording}
								className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-150 ${
									isRecording
										? "bg-red-500/90 text-white shadow-md shadow-red-500/30 ring-4 ring-red-500/20"
										: "text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] hover:text-zinc-600 dark:hover:text-zinc-300"
								}`}
							>
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
									/>
								</svg>
							</button>
						)}
					</div>

					{/* Right: char count + keyboard shortcut + send button */}
					<div className="flex items-center gap-2">
						{/* Character count — only visible when > threshold */}
						{showCharCount && (
							<span
								className={`text-[11px] tabular-nums transition-colors duration-150 select-none ${getCharCountClass()}`}
								aria-live="polite"
							>
								{charCount.toLocaleString()}
							</span>
						)}

						{/* Ctrl+Enter shortcut hint */}
						<div className="hidden sm:flex items-center gap-1 select-none">
							<kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded border border-zinc-200 dark:border-white/[0.08] bg-zinc-100/80 dark:bg-white/[0.04] text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-none">
								{isMac ? "⌘" : "Ctrl"}
							</kbd>
							<kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded border border-zinc-200 dark:border-white/[0.08] bg-zinc-100/80 dark:bg-white/[0.04] text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-none">
								↵
							</kbd>
						</div>

						{/* Send button */}
						<button
							type="button"
							onClick={handleSend}
							disabled={!canSend}
							aria-label={t("sendMessage")}
							className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 ${
								canSend
									? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-110 shadow-lg shadow-indigo-500/30 active:scale-[0.93] active:shadow-md"
									: "bg-zinc-100/60 dark:bg-white/[0.05] text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
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
				</div>
			</div>
		</div>
	);
}
