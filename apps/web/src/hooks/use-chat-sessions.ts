"use client";

import { getAccessToken } from "@/lib/session";
import type { ChatSessionSummary } from "@/types";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface UseChatSessionsReturn {
	sessions: ChatSessionSummary[];
	isLoading: boolean;
	refresh: () => Promise<void>;
}

export function useChatSessions(): UseChatSessionsReturn {
	const { data: session } = useSession();
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const accessToken = getAccessToken(session);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await fetch(`${API_BASE_URL}/api/v1/chat/sessions`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});
			if (response.ok) {
				const data: ChatSessionSummary[] = await response.json();
				setSessions(data);
			}
		} catch {
			// Silently fail — sessions list is non-critical
		} finally {
			setIsLoading(false);
		}
	}, [accessToken]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { sessions, isLoading, refresh };
}
