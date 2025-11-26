import type { MetaDescriptor } from "react-router";

const rawBaseUrl =
	typeof import.meta.env.VITE_SITE_URL === "string"
		? import.meta.env.VITE_SITE_URL.trim()
		: "";

const cleanedBaseUrl = rawBaseUrl.replace(/\/$/, "");

const FALLBACK_URL = "http://localhost:5173";

const baseUrl = cleanedBaseUrl.length > 0 ? cleanedBaseUrl : FALLBACK_URL;

const defaultDescription =
	"Generate ready-to-import NotebookLM source bundles from any RSS feed or the Hacker News front page.";

export const siteConfig = {
	name: "NotebookLM Tools",
	tagline: "Source builders for NotebookLM",
	description: defaultDescription,
	keywords: [
		"NotebookLM",
		"RSS to NotebookLM",
		"Hacker News",
		"source bundle",
		"Google NotebookLM",
		"knowledge management",
	],
	locale: "en_US",
	baseUrl,
	defaultOgImage: `${baseUrl}/og-image.svg`,
} as const;

export type BuildMetaOptions = {
	title?: string;
	description?: string;
	path?: string;
	ogImage?: string | null;
	type?: "website" | "article" | string;
	keywords?: string[];
	robots?: string;
};

export function getCanonicalUrl(path: string = "/") {
	const safePath = path.startsWith("/") ? path : `/${path}`;
	return `${siteConfig.baseUrl}${safePath}`;
}

export function buildMeta(options: BuildMetaOptions = {}): MetaDescriptor[] {
	const titleBase = options.title
		? `${options.title} | ${siteConfig.name}`
		: `${siteConfig.name} · ${siteConfig.tagline}`;
	const description = options.description ?? siteConfig.description;
	const canonicalUrl = getCanonicalUrl(options.path ?? "/");
	const ogImage =
		options.ogImage === null
			? null
			: (options.ogImage ?? siteConfig.defaultOgImage);
	const pageType = options.type ?? "website";
	const robots = options.robots ?? "index,follow";
	const keywords = (options.keywords ?? siteConfig.keywords)
		.map((keyword) => keyword.trim())
		.filter((keyword) => keyword.length > 0);

	const meta: MetaDescriptor[] = [
		{ title: titleBase },
		{ name: "description", content: description },
		{ name: "application-name", content: siteConfig.name },
		{ name: "robots", content: robots },
		{ property: "og:title", content: titleBase },
		{ property: "og:description", content: description },
		{ property: "og:url", content: canonicalUrl },
		{ property: "og:site_name", content: siteConfig.name },
		{ property: "og:type", content: pageType },
		{ property: "og:locale", content: siteConfig.locale },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: titleBase },
		{ name: "twitter:description", content: description },
		{ name: "theme-color", content: "#0f172a" },
		{ name: "color-scheme", content: "light dark" },
	];

	if (keywords.length > 0) {
		meta.push({ name: "keywords", content: keywords.join(", ") });
	}

	if (ogImage) {
		meta.push({ property: "og:image", content: ogImage });
		meta.push({ name: "twitter:image", content: ogImage });
	}

	return meta;
}

export function buildCanonicalLink(path: string = "/") {
	return {
		rel: "canonical",
		href: getCanonicalUrl(path),
	} as const;
}

export function getSiteStructuredData() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: siteConfig.name,
		description: siteConfig.description,
		url: siteConfig.baseUrl,
		inLanguage: siteConfig.locale,
		potentialAction: {
			"@type": "SearchAction",
			target: `${siteConfig.baseUrl}/?q={search_term_string}`,
			"query-input": "required name=search_term_string",
		},
	};
}
