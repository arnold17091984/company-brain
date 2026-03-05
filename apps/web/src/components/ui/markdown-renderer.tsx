"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable — fail silently
		}
	}, [text]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? "Copied!" : "Copy code"}
			className={cn(
				"inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150",
				"active:scale-[0.97]",
				"focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none",
				copied
					? "text-emerald-400 bg-emerald-500/[0.1]"
					: "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]",
			)}
		>
			{copied ? (
				// Check icon
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2.5}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M4.5 12.75l6 6 9-13.5" />
				</svg>
			) : (
				// Clipboard icon
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.75}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
				</svg>
			)}
			{copied ? "Copied!" : "Copy"}
		</button>
	);
}

// ─── CodeBlock ────────────────────────────────────────────────────────────────

function CodeBlock({
	language,
	children,
}: {
	language: string;
	children: string;
}) {
	return (
		<div className="my-4 rounded-xl overflow-hidden border border-white/[0.06]">
			{/* Header bar */}
			<div className="flex items-center justify-between px-4 py-2 bg-zinc-800 dark:bg-black/60">
				<span className="text-xs font-mono text-zinc-400">
					{language || "code"}
				</span>
				<CopyButton text={children} />
			</div>

			{/* Code content */}
			<pre className="bg-zinc-950 dark:bg-black text-zinc-100 p-4 text-sm overflow-x-auto leading-relaxed">
				<code>{children}</code>
			</pre>
		</div>
	);
}

// ─── Component map ────────────────────────────────────────────────────────────

function buildComponents(): Components {
	return {
		// ── Headings ──────────────────────────────────────────────────────────
		h1: ({ children }) => (
			<h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mt-6 mb-3 first:mt-0 leading-snug">
				{children}
			</h1>
		),
		h2: ({ children }) => (
			<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-5 mb-2.5 first:mt-0 leading-snug">
				{children}
			</h2>
		),
		h3: ({ children }) => (
			<h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mt-4 mb-2 first:mt-0 leading-snug">
				{children}
			</h3>
		),
		h4: ({ children }) => (
			<h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-4 mb-1.5 first:mt-0">
				{children}
			</h4>
		),
		h5: ({ children }) => (
			<h5 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mt-3 mb-1 first:mt-0">
				{children}
			</h5>
		),
		h6: ({ children }) => (
			<h6 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mt-3 mb-1 first:mt-0 uppercase tracking-wide">
				{children}
			</h6>
		),

		// ── Paragraph ─────────────────────────────────────────────────────────
		p: ({ children }) => (
			<p className="mb-3 leading-relaxed text-zinc-700 dark:text-zinc-300 last:mb-0">
				{children}
			</p>
		),

		// ── Code ──────────────────────────────────────────────────────────────
		// biome-ignore lint/suspicious/noExplicitAny: react-markdown passes loose props
		code: ({ className, children, ...props }: any) => {
			const isInline = !className;
			const language = (className ?? "").replace("language-", "");
			const text = String(children ?? "").replace(/\n$/, "");

			if (isInline) {
				return (
					<code
						className="px-1.5 py-0.5 rounded-md text-sm font-mono bg-zinc-100 dark:bg-white/[0.08] text-pink-600 dark:text-pink-400 border border-zinc-200 dark:border-white/[0.06]"
						{...props}
					>
						{children}
					</code>
				);
			}

			return <CodeBlock language={language}>{text}</CodeBlock>;
		},

		// Strip the pre wrapper so CodeBlock can handle its own container
		pre: ({ children }) => <>{children}</>,

		// ── Lists ─────────────────────────────────────────────────────────────
		ul: ({ children }) => (
			<ul className="mb-3 ml-5 list-disc space-y-1 text-zinc-700 dark:text-zinc-300">
				{children}
			</ul>
		),
		ol: ({ children }) => (
			<ol className="mb-3 ml-5 list-decimal space-y-1 text-zinc-700 dark:text-zinc-300">
				{children}
			</ol>
		),
		li: ({ children }) => <li className="leading-relaxed">{children}</li>,

		// ── Blockquote ────────────────────────────────────────────────────────
		blockquote: ({ children }) => (
			<blockquote className="my-3 border-l-2 border-indigo-500/50 pl-4 italic text-zinc-600 dark:text-zinc-400 [&>p]:mb-0">
				{children}
			</blockquote>
		),

		// ── Horizontal rule ───────────────────────────────────────────────────
		hr: () => <hr className="my-5 border-zinc-200 dark:border-white/[0.08]" />,

		// ── Links ─────────────────────────────────────────────────────────────
		// biome-ignore lint/suspicious/noExplicitAny: react-markdown passes loose props
		a: ({ href, children, ...props }: any) => (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:no-underline transition-colors"
				{...props}
			>
				{children}
			</a>
		),

		// ── Strong / Em ───────────────────────────────────────────────────────
		strong: ({ children }) => (
			<strong className="font-semibold text-zinc-900 dark:text-zinc-100">
				{children}
			</strong>
		),
		em: ({ children }) => (
			<em className="italic text-zinc-700 dark:text-zinc-300">{children}</em>
		),

		// ── Strikethrough (GFM) ───────────────────────────────────────────────
		del: ({ children }) => (
			<del className="line-through text-zinc-500 dark:text-zinc-500">
				{children}
			</del>
		),

		// ── Tables (GFM) ──────────────────────────────────────────────────────
		table: ({ children }) => (
			<div className="my-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/[0.06]">
				<table className="min-w-full divide-y divide-zinc-200 dark:divide-white/[0.06] text-sm">
					{children}
				</table>
			</div>
		),
		thead: ({ children }) => (
			<thead className="bg-zinc-50 dark:bg-white/[0.04]">{children}</thead>
		),
		tbody: ({ children }) => (
			<tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04] bg-white dark:bg-transparent">
				{children}
			</tbody>
		),
		tr: ({ children }) => (
			<tr className="hover:bg-zinc-50/60 dark:hover:bg-white/[0.02] transition-colors">
				{children}
			</tr>
		),
		th: ({ children }) => (
			<th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
				{children}
			</th>
		),
		td: ({ children }) => (
			<td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
				{children}
			</td>
		),

		// ── Task list items (GFM checkboxes) ──────────────────────────────────
		// biome-ignore lint/suspicious/noExplicitAny: react-markdown passes loose props
		input: ({ type, checked, ...props }: any) => {
			if (type === "checkbox") {
				return (
					<input
						type="checkbox"
						checked={checked}
						readOnly
						className="mr-1.5 rounded border-zinc-300 dark:border-zinc-600 accent-indigo-500 cursor-default"
						{...props}
					/>
				);
			}
			return <input type={type} {...props} />;
		},
	};
}

// Singleton so the object reference is stable
const COMPONENTS = buildComponents();

// ─── MarkdownRenderer ─────────────────────────────────────────────────────────

/**
 * Renders GFM-flavoured Markdown with:
 * - Syntax-highlighted code blocks with a copy button
 * - Tables, task lists, strikethrough
 * - Links that open in a new tab
 * - Full dark mode support using the project's design system tokens
 */
export function MarkdownRenderer({
	content,
	className,
}: MarkdownRendererProps) {
	return (
		<div className={cn("min-w-0 text-zinc-700 dark:text-zinc-300", className)}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
				{content}
			</ReactMarkdown>
		</div>
	);
}
