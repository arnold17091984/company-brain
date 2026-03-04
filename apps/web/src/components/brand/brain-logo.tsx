/**
 * Company Brain logo — stroke-based brain mark.
 *
 * Two smooth C-arcs (hemispheres) connected by horizontal
 * neural pathways, with a luminous center node.
 * All elements are strokes — clean, safe, iconic.
 *
 * Sizes:
 *  - "sm" (sidebar): 32 × 32
 *  - "lg" (login):   64 × 64
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
			aria-hidden="true"
		>
			{/* Left hemisphere — smooth open arc */}
			<path
				d="M11 4C7 4 4 7.5 4 12s3 8 7 8"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
			/>
			{/* Right hemisphere — mirror */}
			<path
				d="M13 4c4 0 7 3.5 7 8s-3 8-7 8"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
			/>
			{/* Neural pathways — horizontal bridges */}
			<path
				d="M7 9h4M13 9h4M7 15h4M13 15h4"
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinecap="round"
				opacity={0.4}
			/>
			{/* Intelligence core */}
			<circle cx="12" cy="12" r="1.5" fill="currentColor" opacity={0.85} />
		</svg>
	);
}

export function BrainLogo({ size = "sm" }: BrainLogoProps) {
	if (size === "lg") {
		return (
			<div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-800 flex items-center justify-center shadow-xl shadow-indigo-500/30 ring-1 ring-white/20 overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-transparent" />
				<BrainIcon className="relative w-9 h-9 text-white" />
			</div>
		);
	}

	return (
		<div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-800 flex items-center justify-center ring-1 ring-white/15 overflow-hidden">
			<div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] to-transparent" />
			<BrainIcon className="relative w-5 h-5 text-white" />
		</div>
	);
}
