"use client";

import {
	type ReactElement,
	type ReactNode,
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

// ─── Types ───────────────────────────────────────────────────

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
	readonly content: string;
	readonly children: ReactNode;
	readonly position?: TooltipPosition;
	readonly delay?: number;
}

// ─── Position classes ─────────────────────────────────────────

interface PositionClasses {
	tooltip: string;
	arrow: string;
}

const POSITION_CLASSES: Record<TooltipPosition, PositionClasses> = {
	top: {
		tooltip: "bottom-full left-1/2 -translate-x-1/2 mb-2",
		arrow:
			"absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100",
	},
	bottom: {
		tooltip: "top-full left-1/2 -translate-x-1/2 mt-2",
		arrow:
			"absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-900 dark:border-b-zinc-100",
	},
	left: {
		tooltip: "right-full top-1/2 -translate-y-1/2 mr-2",
		arrow:
			"absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-zinc-900 dark:border-l-zinc-100",
	},
	right: {
		tooltip: "left-full top-1/2 -translate-y-1/2 ml-2",
		arrow:
			"absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900 dark:border-r-zinc-100",
	},
};

// ─── Tooltip ─────────────────────────────────────────────────

export function Tooltip({
	content,
	children,
	position = "top",
	delay = 300,
}: TooltipProps) {
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Stable id links the trigger to the tooltip bubble via aria-describedby
	const tooltipId = useId();

	const show = useCallback(() => {
		timerRef.current = setTimeout(() => setVisible(true), delay);
	}, [delay]);

	const hide = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setVisible(false);
	}, []);

	// Clean up timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	const classes = POSITION_CLASSES[position];

	// Attach handlers directly to the child element so that the interactive
	// element itself carries the event listeners — no wrapper div needed.
	// Falls back to a <span> wrapper for non-element children (strings, etc.).
	const trigger = isValidElement(children)
		? cloneElement(children as ReactElement<Record<string, unknown>>, {
				onMouseEnter: show,
				onMouseLeave: hide,
				onFocus: show,
				onBlur: hide,
				"aria-describedby": visible ? tooltipId : undefined,
			})
		: children;

	return (
		<span className="relative inline-flex">
			{trigger}

			{visible && (
				<span
					id={tooltipId}
					role="tooltip"
					className={[
						"absolute z-50 whitespace-nowrap pointer-events-none",
						"animate-fade-in",
						classes.tooltip,
					].join(" ")}
				>
					{/* Tooltip bubble */}
					<span className="block bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs px-2 py-1 rounded-md shadow-md">
						{content}
					</span>

					{/* Arrow */}
					<span className={classes.arrow} aria-hidden="true" />
				</span>
			)}
		</span>
	);
}
