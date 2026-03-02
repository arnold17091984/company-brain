"use client";

import type { Message, Source } from "@/types";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ChatApiResponse {
	content: string;
	conversation_id?: string;
	sources?: Source[];
}

interface SseEvent {
	type?: string;
	content?: string;
	conversation_id?: string;
	sources?: Source[];
	done?: boolean;
}

interface UseChatReturn {
	messages: Message[];
	sendMessage: (text: string) => Promise<void>;
	isLoading: boolean;
	error: string | null;
	clearMessages: () => void;
}

let messageCounter = 0;

function generateId(): string {
	messageCounter += 1;
	return `msg-${Date.now()}-${messageCounter}`;
}

export function useChat(): UseChatReturn {
	const { data: session } = useSession();
	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const clearMessages = useCallback(() => {
		setMessages([]);
		setSessionId(null);
		setError(null);
	}, []);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || isLoading) return;

			const accessToken = (session as { accessToken?: string } | null)
				?.accessToken;

			const userMessage: Message = {
				id: generateId(),
				role: "user",
				content: text,
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsLoading(true);
			setError(null);

			const assistantMessageId = generateId();
			const assistantMessage: Message = {
				id: assistantMessageId,
				role: "assistant",
				content: "",
			};
			setMessages((prev) => [...prev, assistantMessage]);

			try {
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
					Accept: "text/event-stream",
				};

				if (accessToken) {
					headers.Authorization = `Bearer ${accessToken}`;
				}

				const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						message: text,
						conversation_id: sessionId,
					}),
				});

				if (!response.ok) {
					throw new Error(
						`API error: ${response.status} ${response.statusText}`,
					);
				}

				const contentType = response.headers.get("content-type") ?? "";

				if (contentType.includes("text/event-stream") && response.body) {
					// Handle SSE streaming response
					const reader = response.body.getReader();
					const decoder = new TextDecoder();
					let accumulatedContent = "";
					let buffer = "";

					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						// Keep the last possibly-incomplete line in the buffer
						buffer = lines.pop() ?? "";

						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed || trimmed.startsWith(":")) continue;

							if (trimmed.startsWith("data: ")) {
								const data = trimmed.slice(6);
								if (data === "[DONE]") break;

								try {
									const parsed: SseEvent = JSON.parse(data);

									if (parsed.conversation_id && !sessionId) {
										setSessionId(parsed.conversation_id);
									}

									if (parsed.content) {
										accumulatedContent += parsed.content;
										const snapshot = accumulatedContent;
										setMessages((prev) =>
											prev.map((m) =>
												m.id === assistantMessageId
													? { ...m, content: snapshot }
													: m,
											),
										);
									}

									if (parsed.done && parsed.sources) {
										const sources = parsed.sources;
										setMessages((prev) =>
											prev.map((m) =>
												m.id === assistantMessageId ? { ...m, sources } : m,
											),
										);
									}
								} catch {
									// Non-JSON SSE data — treat as plain text chunk
									accumulatedContent += data;
									const snapshot = accumulatedContent;
									setMessages((prev) =>
										prev.map((m) =>
											m.id === assistantMessageId
												? { ...m, content: snapshot }
												: m,
										),
									);
								}
							}
						}
					}
				} else {
					// Fallback: regular JSON response
					const json: ChatApiResponse = await response.json();

					if (json.conversation_id && !sessionId) {
						setSessionId(json.conversation_id);
					}

					setMessages((prev) =>
						prev.map((m) =>
							m.id === assistantMessageId
								? {
										...m,
										content: json.content,
										sources: json.sources ?? [],
									}
								: m,
						),
					);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "An unexpected error occurred";
				setError(message);
				// Remove the empty assistant placeholder on error
				setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
			} finally {
				setIsLoading(false);
			}
		},
		[isLoading, session, sessionId],
	);

	return { messages, sendMessage, isLoading, error, clearMessages };
}
