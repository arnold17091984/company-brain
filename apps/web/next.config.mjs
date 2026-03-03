import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Points to the request config file used by next-intl on the server.
// The default path is ./src/i18n/request.ts — passing it explicitly for clarity.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
	// output: "standalone" and outputFileTracingRoot are for production deploy only.
	...(isDev
		? {}
		: {
				output: "standalone",
				experimental: {
					outputFileTracingRoot: resolve(__dirname, "../../"),
				},
			}),
	transpilePackages: ["next-auth", "@auth/core"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
				pathname: "/**",
			},
		],
	},
	// Persistent webpack cache for faster dev rebuilds
	webpack: (config, { dev }) => {
		if (dev) {
			config.cache = {
				type: "filesystem",
				buildDependencies: {
					config: [resolve(__dirname, "next.config.mjs")],
				},
				cacheDirectory: resolve(__dirname, ".next/cache/webpack"),
			};
		}
		return config;
	},
	// Static asset caching headers
	headers: async () => [
		{
			source: "/:all*(svg|jpg|png|webp|avif|woff2|ico)",
			headers: [
				{
					key: "Cache-Control",
					value: "public, max-age=31536000, immutable",
				},
			],
		},
		{
			source: "/_next/static/:path*",
			headers: [
				{
					key: "Cache-Control",
					value: "public, max-age=31536000, immutable",
				},
			],
		},
	],
};

export default withNextIntl(nextConfig);
