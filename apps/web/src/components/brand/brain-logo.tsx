/**
 * Company Brain logo — front-view brain built from overlapping arcs.
 * Each arc represents a brain lobe, creating the characteristic bumpy outline.
 *
 * Sizes:
 *  - "sm" (sidebar): 32 × 32 container
 *  - "lg" (login):   64 × 64 container
 */

interface BrainLogoProps {
	size?: "sm" | "lg";
}

function BrainIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{/* Left hemisphere — arcs from top→center→bottom create bumpy lobes */}
			<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
			{/* Right hemisphere — mirror */}
			<path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
			{/* Left internal sulci */}
			<path d="M7.04 19.94a2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58" />
			<path d="M5.06 4.04a2.5 2.5 0 0 0-1.68 3.68" />
			{/* Right internal sulci */}
			<path d="M16.96 19.94a2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58" />
			<path d="M18.94 4.04a2.5 2.5 0 0 1 1.68 3.68" />
		</svg>
	);
}

export function BrainLogo({ size = "sm" }: BrainLogoProps) {
	if (size === "lg") {
		return (
			<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/10">
				<BrainIcon className="w-9 h-9 text-amber-400" />
			</div>
		);
	}

	return (
		<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center ring-1 ring-white/10">
			<BrainIcon className="w-5 h-5 text-amber-300" />
		</div>
	);
}
