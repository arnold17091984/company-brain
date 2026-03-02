import { locales } from "@/i18n/config";
import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";

interface LocaleLayoutProps {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const titles: Record<string, string> = {
		en: "Company Brain",
		ja: "カンパニーブレイン",
		ko: "컴퍼니 브레인",
	};
	return {
		title: {
			default: titles[locale] ?? "Company Brain",
			template: `%s | ${titles[locale] ?? "Company Brain"}`,
		},
	};
}

export default async function LocaleLayout({
	children,
	params,
}: LocaleLayoutProps) {
	const { locale } = await params;

	// Validate locale; 404 if unsupported
	if (!locales.includes(locale as (typeof locales)[number])) {
		notFound();
	}

	// Enable static rendering for this locale
	setRequestLocale(locale);

	// Load messages for this locale on the server
	const messages = await getMessages();

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			{children}
		</NextIntlClientProvider>
	);
}
