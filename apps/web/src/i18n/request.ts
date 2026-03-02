import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
	// requestLocale is a Promise<string | undefined> in next-intl v4
	let locale = await requestLocale;

	// Validate that the incoming locale is supported; fall back to default
	if (!locale || !locales.includes(locale as (typeof locales)[number])) {
		locale = defaultLocale;
	}

	return {
		locale,
		messages: (await import(`../../messages/${locale}.json`)).default,
	};
});
