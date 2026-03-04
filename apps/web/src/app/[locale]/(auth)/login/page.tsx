import { BrainLogo } from "@/components/brand/brain-logo";
import { signIn } from "@/lib/auth";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

const isDev =
	process.env.NODE_ENV === "development" && !process.env.GOOGLE_CLIENT_ID;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("login");
	return {
		title: t("pageTitle"),
		description: t("brandTagline"),
	};
}

export default async function LoginPage() {
	const t = await getTranslations("login");
	const tc = await getTranslations("common");

	return (
		<div className="min-h-screen flex items-center justify-center bg-hero-gradient">
			<div className="w-full max-w-sm animate-fade-in">
				{/* Logo / Brand */}
				<div className="flex flex-col items-center mb-10">
					<div className="mb-5">
						<BrainLogo size="lg" />
					</div>
					<h1 className="text-2xl font-semibold text-zinc-900 tracking-tight">
						{tc("companyBrain")}
					</h1>
					<p className="text-zinc-500 text-sm mt-1.5">{t("brandTagline")}</p>
				</div>

				{/* Card */}
				<div className="glass rounded-xl p-8 shadow-lg shadow-zinc-900/5">
					<h2 className="text-lg font-medium text-zinc-800 mb-1">
						{t("heading")}
					</h2>
					<p className="text-zinc-500 text-sm mb-6">{t("subtitle")}</p>

					{isDev ? (
						<form
							action={async (formData: FormData) => {
								"use server";
								await signIn("credentials", {
									email: formData.get("email") as string,
									redirectTo: "/chat",
								});
							}}
						>
							<input
								name="email"
								type="email"
								defaultValue="dev@company.com"
								placeholder="Email"
								className="w-full px-4 py-3 rounded-md border border-zinc-200 text-sm text-zinc-900 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
							/>
							<button
								type="submit"
								className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-2"
							>
								{t("devButton")}
							</button>
							<p className="text-xs text-zinc-500 text-center mt-3">
								{t("devNote")}
							</p>
						</form>
					) : (
						<form
							action={async () => {
								"use server";
								await signIn("google", { redirectTo: "/chat" });
							}}
						>
							<button
								type="submit"
								className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-2"
							>
								{/* Google icon */}
								<svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
									<path
										d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
										fill="rgba(255,255,255,0.9)"
									/>
									<path
										d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
										fill="rgba(255,255,255,0.7)"
									/>
									<path
										d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
										fill="rgba(255,255,255,0.6)"
									/>
									<path
										d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
										fill="rgba(255,255,255,0.8)"
									/>
								</svg>
								{t("googleButton")}
							</button>
						</form>
					)}
				</div>

				<p className="text-center text-xs text-zinc-400 mt-6">
					{t("restricted")}
				</p>
			</div>
		</div>
	);
}
