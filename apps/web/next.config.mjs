import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Points to the request config file used by next-intl on the server.
// The default path is ./src/i18n/request.ts — passing it explicitly for clarity.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	transpilePackages: ["next-auth", "@auth/core"],
	experimental: {
		outputFileTracingRoot: resolve(__dirname, "../../"),
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
				pathname: "/**",
			},
		],
	},
};

export default withNextIntl(nextConfig);
