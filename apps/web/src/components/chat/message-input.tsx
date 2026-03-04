"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

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
	const [isRecording, setIsRecording] = useState(false);
	const [isVoiceSupported, setIsVoiceSupported] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const recognitionRef = useRef<SpeechRecognition | null>(null);

	const resolvedPlaceholder = placeholder ?? t("placeholder");
	const canSend = value.trim().length > 0 && !disabled;

	useEffect(() => {
		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		setIsVoiceSupported(!!SpeechRecognition);
	}, []);

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

	function handleInput() {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
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
			<div
				className={`input-premium flex items-end gap-3 rounded-2xl border px-4 py-3.5 transition-[border-color,box-shadow] duration-150 ${
					disabled
						? "border-zinc-200/60 dark:border-white/[0.05] bg-white/60 dark:bg-[#1a1a1f]/60 opacity-70 cursor-not-allowed"
						: "border-zinc-200/80 dark:border-white/[0.07] bg-white dark:bg-[#1a1a1f] shadow-sm dark:shadow-xl dark:shadow-black/30"
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
					className="flex-1 resize-none bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400/70 dark:placeholder:text-zinc-600 focus:outline-none min-h-[24px] max-h-[200px] py-1 leading-relaxed"
					aria-label="Chat message"
				/>

				{isVoiceSupported && (
					<button
						type="button"
						onClick={handleMicClick}
						aria-label={isRecording ? t("voiceStop") : t("voiceStart")}
						aria-pressed={isRecording}
						className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-xl transition-[colors,transform,box-shadow] duration-150 ${
							isRecording
								? "bg-red-500/90 text-white shadow-md shadow-red-500/30 ring-4 ring-red-500/20"
								: "bg-zinc-100/80 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-white/[0.09] hover:text-zinc-700 dark:hover:text-zinc-300"
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

				<button
					type="button"
					onClick={handleSend}
					disabled={!canSend}
					aria-label={t("sendMessage")}
					className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-[colors,transform,box-shadow] duration-150 ${
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

			<p className="text-center text-[11px] text-zinc-400/60 dark:text-zinc-700 mt-2 select-none tracking-wide">
				{t("sendHint")}
			</p>
		</div>
	);
}
