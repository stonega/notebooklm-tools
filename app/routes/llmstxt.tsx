import {
	Check,
	Copy,
	Download,
	ExternalLink,
	FileText,
	Loader2,
	Settings,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	buildCanonicalLink,
	buildMeta,
	getCanonicalUrl,
	siteConfig,
} from "../lib/seo";
import type { LLMsTxtActionData, LLMsTxtLink } from "../lib/types";
import type { Route } from "./+types/llmstxt";

const LLMSTXT_PATH = "/llmstxt";
const LLMSTXT_DESCRIPTION =
	"Fetch and export llms.txt files from documentation sites for LLM-friendly content consumption.";
const LLMSTXT_KEYWORDS = [
	"llms.txt",
	"LLM documentation",
	"docs to text",
	"AI-friendly docs",
	"documentation export",
	"LLM context",
];
const LLMSTXT_CANONICAL_URL = getCanonicalUrl(LLMSTXT_PATH);
const LLMSTXT_JSON_LD = JSON.stringify({
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: `${siteConfig.name} – LLMs.txt Fetcher`,
	applicationCategory: "ProductivityApplication",
	operatingSystem: "Web",
	description: LLMSTXT_DESCRIPTION,
	url: LLMSTXT_CANONICAL_URL,
	creator: {
		"@type": "Person",
		name: "Stone",
	},
	offers: {
		"@type": "Offer",
		price: "0",
		priceCurrency: "USD",
	},
});

export function meta(_args: Route.MetaArgs) {
	return buildMeta({
		title: "LLMs.txt Fetcher",
		description: LLMSTXT_DESCRIPTION,
		path: LLMSTXT_PATH,
		keywords: LLMSTXT_KEYWORDS,
	});
}

export const links: Route.LinksFunction = () => [
	buildCanonicalLink(LLMSTXT_PATH),
];

/**
 * Parse llms.txt content to extract linked markdown files.
 * Format: - [Title](url): Description
 */
function parseLLMsTxtLinks(content: string, baseUrl: string): LLMsTxtLink[] {
	const links: LLMsTxtLink[] = [];
	const linkRegex = /^-\s+\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?$/gm;

	const matches = content.matchAll(linkRegex);
	for (const match of matches) {
		const [, title, url, description] = match;
		let absoluteUrl: string;

		try {
			// Handle relative URLs
			if (url.startsWith("http://") || url.startsWith("https://")) {
				absoluteUrl = url;
			} else {
				const base = new URL(baseUrl);
				absoluteUrl = new URL(url, base.origin).href;
			}
		} catch {
			continue;
		}

		links.push({
			title: title.trim(),
			url: absoluteUrl,
			description: description?.trim() || null,
		});
	}

	return links;
}

/**
 * Extract title and description from llms.txt header
 */
function parseLLMsTxtHeader(content: string): {
	title: string | null;
	description: string | null;
} {
	const lines = content.split("\n");
	let title: string | null = null;
	let description: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!title && trimmed.startsWith("# ")) {
			title = trimmed.slice(2).trim();
		} else if (!description && trimmed.startsWith("> ")) {
			description = trimmed.slice(2).trim();
		}
		if (title && description) break;
	}

	return { title, description };
}

/**
 * Map website URLs using Firecrawl
 */
async function mapWebsite(
	url: string,
	firecrawlApiKey: string,
	limit = 100,
): Promise<string[]> {
	const response = await fetch("https://api.firecrawl.dev/v1/map", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${firecrawlApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			url,
			limit,
			includeSubdomains: false,
			ignoreSitemap: false,
		}),
	});

	if (!response.ok) {
		throw new Error(`Firecrawl map failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.success && data.links) {
		return data.links;
	}
	return [];
}

/**
 * Scrape a single URL using Firecrawl
 */
async function scrapeUrl(
	url: string,
	firecrawlApiKey: string,
): Promise<{ markdown: string; metadata: Record<string, unknown> } | null> {
	try {
		const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${firecrawlApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url,
				formats: ["markdown"],
				onlyMainContent: true,
				timeout: 30000,
			}),
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();
		if (data.success && data.data) {
			return {
				markdown: data.data.markdown || "",
				metadata: data.data.metadata || {},
			};
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Generate title and description using OpenRouter
 */
async function generateDescription(
	url: string,
	markdown: string,
	openrouterApiKey: string,
): Promise<{ title: string; description: string }> {
	const prompt = `Generate a 9-10 word description and a 3-4 word title of the entire page based on ALL the content one will find on the page for this url: ${url}. This will help in a user finding the page for its intended purpose.

Return the response in JSON format:
{
    "title": "3-4 word title",
    "description": "9-10 word description"
}`;

	try {
		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${openrouterApiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://notebooklm.tools",
					"X-Title": "LLMs.txt Generator",
				},
				body: JSON.stringify({
					model: "openai/gpt-4o-mini",
					messages: [
						{
							role: "system",
							content:
								"You are a helpful assistant that generates concise titles and descriptions for web pages. Always respond with valid JSON.",
						},
						{
							role: "user",
							content: `${prompt}\n\nPage content:\n${markdown.slice(0, 4000)}`,
						},
					],
					temperature: 0.3,
					max_tokens: 100,
					response_format: { type: "json_object" },
				}),
			},
		);

		if (!response.ok) {
			return { title: "Page", description: "No description available" };
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;
		if (content) {
			const result = JSON.parse(content);
			return {
				title: result.title || "Page",
				description: result.description || "No description available",
			};
		}
		return { title: "Page", description: "No description available" };
	} catch {
		return { title: "Page", description: "No description available" };
	}
}

/**
 * Generate llms-full.txt using Firecrawl and OpenRouter
 */
async function generateLLMsFullTxt(
	siteUrl: string,
	firecrawlApiKey: string,
	openrouterApiKey: string,
	maxUrls = 20,
): Promise<{ llmsTxt: string; llmsFullTxt: string; processedCount: number }> {
	// Map the website
	const urls = await mapWebsite(siteUrl, firecrawlApiKey, maxUrls);
	if (urls.length === 0) {
		throw new Error("No URLs found for the website");
	}

	const limitedUrls = urls.slice(0, maxUrls);

	let llmsTxt = `# ${siteUrl} llms.txt\n\n`;
	let llmsFullTxt = `# ${siteUrl} llms-full.txt\n\n`;

	const results: Array<{
		url: string;
		title: string;
		description: string;
		markdown: string;
		index: number;
	}> = [];

	// Process URLs sequentially to avoid rate limiting
	for (let i = 0; i < limitedUrls.length; i++) {
		const url = limitedUrls[i];

		const scraped = await scrapeUrl(url, firecrawlApiKey);
		if (!scraped || !scraped.markdown) {
			continue;
		}

		const { title, description } = await generateDescription(
			url,
			scraped.markdown,
			openrouterApiKey,
		);

		results.push({
			url,
			title,
			description,
			markdown: scraped.markdown,
			index: i,
		});

		// Small delay to avoid rate limiting
		if (i < limitedUrls.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	// Build output strings
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		llmsTxt += `- [${result.title}](${result.url}): ${result.description}\n`;
		llmsFullTxt += `## ${result.title}\n\nURL: ${result.url}\n\n${result.markdown}\n\n---\n\n`;
	}

	return {
		llmsTxt,
		llmsFullTxt,
		processedCount: results.length,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const siteUrlRaw = formData.get("siteUrl");
	const firecrawlApiKey = formData.get("firecrawlApiKey");
	const openrouterApiKey = formData.get("openrouterApiKey");
	const maxUrlsRaw = formData.get("maxUrls");

	if (typeof siteUrlRaw !== "string" || siteUrlRaw.trim().length === 0) {
		return Response.json(
			{ ok: false, error: "Please enter a website URL." },
			{ status: 400 },
		);
	}

	let siteUrl: URL;
	try {
		siteUrl = new URL(siteUrlRaw.trim());
	} catch {
		return Response.json(
			{ ok: false, error: "That doesn't look like a valid URL." },
			{ status: 422 },
		);
	}

	// First, try to fetch /llms-full.txt
	const llmsFullTxtUrl = new URL("/llms-full.txt", siteUrl.origin);

	try {
		const llmsFullResponse = await fetch(llmsFullTxtUrl.href, {
			headers: {
				"User-Agent":
					"LLMsTxt-Fetcher/1.0 (https://github.com/answerdotai/llms-txt)",
				Accept: "text/plain, text/markdown, */*",
			},
		});

		if (llmsFullResponse.ok) {
			const llmsFullContent = await llmsFullResponse.text();

			if (llmsFullContent.trim().length > 0) {
				// Found llms-full.txt, return it
				const { title, description } = parseLLMsTxtHeader(llmsFullContent);
				const links = parseLLMsTxtLinks(llmsFullContent, llmsFullTxtUrl.href);

				const contentBase64 = Buffer.from(llmsFullContent, "utf-8").toString(
					"base64",
				);
				const siteName = siteUrl.hostname.replace(/\./g, "-");
				const fileName = `llms-full-${siteName}-${new Date().toISOString().slice(0, 10)}.txt`;

				return Response.json({
					ok: true,
					source: "llms-full.txt",
					site: {
						url: siteUrl.origin,
						hostname: siteUrl.hostname,
						llmsTxtUrl: llmsFullTxtUrl.href,
					},
					llmsTxt: {
						title: title || siteUrl.hostname,
						description,
						content: llmsFullContent,
						links,
					},
					fetchedLinks: null,
					download: {
						contentBase64,
						fileName,
						wordCount: countWords(llmsFullContent),
					},
				});
			}
		}
	} catch (error) {
		console.error("Failed to fetch llms-full.txt:", error);
	}

	// llms-full.txt not found, check if we have API keys to generate it
	const hasApiKeys =
		typeof firecrawlApiKey === "string" &&
		firecrawlApiKey.trim().length > 0 &&
		typeof openrouterApiKey === "string" &&
		openrouterApiKey.trim().length > 0;

	if (hasApiKeys) {
		// Generate llms-full.txt using Firecrawl and OpenRouter
		try {
			const maxUrls = Number.parseInt(maxUrlsRaw as string, 10) || 20;
			const generated = await generateLLMsFullTxt(
				siteUrl.origin,
				firecrawlApiKey.trim(),
				openrouterApiKey.trim(),
				Math.min(maxUrls, 50),
			);

			const contentBase64 = Buffer.from(
				generated.llmsFullTxt,
				"utf-8",
			).toString("base64");
			const siteName = siteUrl.hostname.replace(/\./g, "-");
			const fileName = `llms-full-${siteName}-${new Date().toISOString().slice(0, 10)}.txt`;

			return Response.json({
				ok: true,
				source: "generated",
				site: {
					url: siteUrl.origin,
					hostname: siteUrl.hostname,
					llmsTxtUrl: null,
				},
				llmsTxt: {
					title: `${siteUrl.hostname} (Generated)`,
					description: `Generated llms-full.txt with ${generated.processedCount} pages`,
					content: generated.llmsFullTxt,
					links: parseLLMsTxtLinks(generated.llmsTxt, siteUrl.origin),
				},
				fetchedLinks: null,
				download: {
					contentBase64,
					fileName,
					wordCount: countWords(generated.llmsFullTxt),
				},
				generated: {
					llmsTxt: generated.llmsTxt,
					processedCount: generated.processedCount,
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to generate content";
			return Response.json(
				{
					ok: false,
					error: `Failed to generate llms-full.txt: ${errorMessage}`,
				},
				{ status: 500 },
			);
		}
	}

	// No llms-full.txt and no API keys, try fallback to /llms.txt
	const llmsTxtUrl = new URL("/llms.txt", siteUrl.origin);

	try {
		const llmsTxtResponse = await fetch(llmsTxtUrl.href, {
			headers: {
				"User-Agent":
					"LLMsTxt-Fetcher/1.0 (https://github.com/answerdotai/llms-txt)",
				Accept: "text/plain, text/markdown, */*",
			},
		});

		if (llmsTxtResponse.ok) {
			const llmsTxtContent = await llmsTxtResponse.text();

			if (llmsTxtContent.trim().length > 0) {
				const { title, description } = parseLLMsTxtHeader(llmsTxtContent);
				const links = parseLLMsTxtLinks(llmsTxtContent, llmsTxtUrl.href);

				const contentBase64 = Buffer.from(llmsTxtContent, "utf-8").toString(
					"base64",
				);
				const siteName = siteUrl.hostname.replace(/\./g, "-");
				const fileName = `llms-${siteName}-${new Date().toISOString().slice(0, 10)}.txt`;

				return Response.json({
					ok: true,
					source: "llms.txt",
					site: {
						url: siteUrl.origin,
						hostname: siteUrl.hostname,
						llmsTxtUrl: llmsTxtUrl.href,
					},
					llmsTxt: {
						title: title || siteUrl.hostname,
						description,
						content: llmsTxtContent,
						links,
					},
					fetchedLinks: null,
					download: {
						contentBase64,
						fileName,
						wordCount: countWords(llmsTxtContent),
					},
					noFullTxt: true,
				});
			}
		}
	} catch (error) {
		console.error("Failed to fetch llms.txt:", error);
	}

	// Neither llms-full.txt nor llms.txt found
	return Response.json(
		{
			ok: false,
			error: `No llms-full.txt or llms.txt found at ${siteUrl.hostname}. You can generate one by providing Firecrawl and OpenRouter API keys.`,
			requiresGeneration: true,
		},
		{ status: 404 },
	);
}

function countWords(text: string) {
	return text.split(/\s+/).filter(Boolean).length;
}

export default function LLMsTxt() {
	const fetcher = useFetcher<LLMsTxtActionData>();
	const [siteUrl, setSiteUrl] = useState("");
	const [showApiKeys, setShowApiKeys] = useState(false);
	const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
	const [openrouterApiKey, setOpenrouterApiKey] = useState("");
	const [maxUrls, setMaxUrls] = useState("20");
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const downloadUrlRef = useRef<string | null>(null);

	const isSubmitting = fetcher.state !== "idle";
	const data = fetcher.data;
	const errorMessage = data?.ok === false ? data.error : null;
	const successPayload = data?.ok ? data : null;
	const requiresGeneration =
		data?.ok === false &&
		"requiresGeneration" in data &&
		data.requiresGeneration;

	useEffect(() => {
		if (downloadUrlRef.current) {
			URL.revokeObjectURL(downloadUrlRef.current);
			downloadUrlRef.current = null;
		}

		if (successPayload?.download.contentBase64) {
			const blob = base64ToBlob(
				successPayload.download.contentBase64,
				"text/plain",
			);
			const objectUrl = URL.createObjectURL(blob);
			downloadUrlRef.current = objectUrl;
			setDownloadUrl(objectUrl);
		} else {
			setDownloadUrl(null);
		}

		return () => {
			if (downloadUrlRef.current) {
				URL.revokeObjectURL(downloadUrlRef.current);
				downloadUrlRef.current = null;
			}
		};
	}, [successPayload]);

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.formData == null) {
			return;
		}
		if (fetcher.state === "submitting") {
			const resultRegion = document.getElementById("fetch-result");
			if (resultRegion) {
				resultRegion.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}
	}, [fetcher.state, fetcher.formData]);

	useEffect(() => {
		if (requiresGeneration) {
			setShowApiKeys(true);
		}
	}, [requiresGeneration]);

	const actionDescription = useMemo(() => {
		if (isSubmitting) {
			if (showApiKeys && firecrawlApiKey && openrouterApiKey) {
				return "Generating llms-full.txt using Firecrawl and OpenRouter...";
			}
			return "Checking for llms-full.txt...";
		}
		if (successPayload) {
			if ("source" in successPayload) {
				if (successPayload.source === "generated") {
					return "Successfully generated llms-full.txt content.";
				}
				if (successPayload.source === "llms-full.txt") {
					return "Found llms-full.txt on the site.";
				}
				if (successPayload.source === "llms.txt") {
					return "Found llms.txt (llms-full.txt not available).";
				}
			}
			return "Successfully fetched content.";
		}
		if (errorMessage) {
			return "We ran into an issue. See the message below.";
		}
		return "Enter a docs site URL to fetch llms-full.txt";
	}, [
		errorMessage,
		isSubmitting,
		successPayload,
		showApiKeys,
		firecrawlApiKey,
		openrouterApiKey,
	]);

	const handleCopyContent = async () => {
		if (successPayload?.llmsTxt.content) {
			await navigator.clipboard.writeText(successPayload.llmsTxt.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<main className="min-h-screen">
			<script
				type="application/ld+json"
				suppressHydrationWarning
				dangerouslySetInnerHTML={{ __html: LLMSTXT_JSON_LD }}
			/>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pb-24 pt-16 sm:px-6 lg:px-8">
				<header className="flex flex-col gap-6 rounded-sm border border-border/10">
					<div className="flex items-center gap-3 text-sm">
						<FileText className="h-4 w-4" aria-hidden="true" />
						<span>NotebookLM Toolkit · LLMs.txt Fetcher</span>
					</div>
					<h1 className="text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
						Fetch or generate llms-full.txt for any site.
					</h1>
					<p className="max-w-2xl text-lg">
						Enter a docs site URL to check for{" "}
						<a
							href="https://llmstxt.org"
							target="_blank"
							rel="noreferrer"
							className="underline decoration-dotted underline-offset-4 hover:text-foreground/80"
						>
							llms-full.txt
						</a>
						. If not found, generate one using Firecrawl and OpenRouter.
					</p>
				</header>

				<section
					className={`grid gap-10 ${data ? "" : "lg:grid-cols-[1.2fr,0.8fr]"}`}
				>
					<fetcher.Form
						method="post"
						className="flex flex-col gap-6 rounded-md border border-border/10 bg-card p-8 backdrop-blur text-foreground"
					>
						<div className="flex flex-col gap-2">
							<label
								className="text-sm font-medium text-foreground"
								htmlFor="siteUrl"
							>
								Documentation site URL
							</label>
							<Input
								id="siteUrl"
								name="siteUrl"
								value={siteUrl}
								onChange={(event) => setSiteUrl(event.target.value)}
								required
								type="url"
								placeholder="https://docs.example.com"
								aria-describedby="siteUrl-help"
							/>
							<p id="siteUrl-help" className="text-sm">
								We'll first check for{" "}
								<code className="bg-muted px-1 py-0.5 rounded text-xs">
									/llms-full.txt
								</code>
								, then fall back to{" "}
								<code className="bg-muted px-1 py-0.5 rounded text-xs">
									/llms.txt
								</code>
								.
							</p>
						</div>

						<div className="flex flex-col gap-4">
							<button
								type="button"
								onClick={() => setShowApiKeys(!showApiKeys)}
								className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<Settings className="h-4 w-4" />
								{showApiKeys ? "Hide" : "Show"} API keys for generation
							</button>

							{showApiKeys && (
								<div className="flex flex-col gap-4 p-4 rounded-lg border border-border/20 bg-muted/30">
									<p className="text-sm text-muted-foreground">
										If no llms-full.txt is found, we can generate one using
										Firecrawl (for scraping) and OpenRouter (for AI
										descriptions).
									</p>

									<div className="flex flex-col gap-2">
										<label
											className="text-sm font-medium"
											htmlFor="firecrawlApiKey"
										>
											Firecrawl API Key
										</label>
										<Input
											id="firecrawlApiKey"
											name="firecrawlApiKey"
											type="password"
											value={firecrawlApiKey}
											onChange={(e) => setFirecrawlApiKey(e.target.value)}
											placeholder="fc-..."
										/>
										<p className="text-xs text-muted-foreground">
											Get your key at{" "}
											<a
												href="https://firecrawl.dev"
												target="_blank"
												rel="noreferrer"
												className="underline"
											>
												firecrawl.dev
											</a>
										</p>
									</div>

									<div className="flex flex-col gap-2">
										<label
											className="text-sm font-medium"
											htmlFor="openrouterApiKey"
										>
											OpenRouter API Key
										</label>
										<Input
											id="openrouterApiKey"
											name="openrouterApiKey"
											type="password"
											value={openrouterApiKey}
											onChange={(e) => setOpenrouterApiKey(e.target.value)}
											placeholder="sk-or-..."
										/>
										<p className="text-xs text-muted-foreground">
											Get your key at{" "}
											<a
												href="https://openrouter.ai"
												target="_blank"
												rel="noreferrer"
												className="underline"
											>
												openrouter.ai
											</a>
										</p>
									</div>

									<div className="flex flex-col gap-2">
										<label className="text-sm font-medium" htmlFor="maxUrls">
											Max URLs to process
										</label>
										<Input
											id="maxUrls"
											name="maxUrls"
											type="number"
											min={1}
											max={50}
											value={maxUrls}
											onChange={(e) => setMaxUrls(e.target.value)}
											className="w-24"
										/>
									</div>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium">How it works</span>
							<ul className="list-disc space-y-1 pl-5 text-sm">
								<li>
									First checks for{" "}
									<code className="bg-muted px-1 py-0.5 rounded text-xs">
										/llms-full.txt
									</code>{" "}
									on the site.
								</li>
								<li>
									Falls back to{" "}
									<code className="bg-muted px-1 py-0.5 rounded text-xs">
										/llms.txt
									</code>{" "}
									if full version not found.
								</li>
								<li>
									If neither found, can generate using Firecrawl + OpenRouter.
								</li>
							</ul>
						</div>

						<div className="flex flex-col gap-3">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? (
									<>
										<Loader2
											className="h-4 w-4 animate-spin"
											aria-hidden="true"
										/>
										{showApiKeys && firecrawlApiKey && openrouterApiKey
											? "Generating..."
											: "Fetching..."}
									</>
								) : (
									<>
										<FileText className="h-4 w-4" aria-hidden="true" />
										Fetch llms-full.txt
									</>
								)}
							</Button>
							<span className="text-sm" aria-live="polite">
								{actionDescription}
							</span>
						</div>
					</fetcher.Form>
				</section>

				{data ? (
					<section
						id="fetch-result"
						className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-8 text-slate-100 backdrop-blur"
						aria-live="polite"
					>
						<h2 className="text-2xl font-semibold text-white">Result</h2>
						{errorMessage ? (
							<div className="rounded-2xl border border-red-400/60 bg-red-500/10 p-5 text-red-200">
								<p className="font-medium">
									{requiresGeneration
										? "No llms-full.txt found"
										: "Error fetching content"}
								</p>
								<p className="mt-1 text-sm text-red-100">{errorMessage}</p>
								{requiresGeneration && (
									<p className="mt-3 text-sm text-red-100">
										Expand the "API keys for generation" section above to
										generate content.
									</p>
								)}
							</div>
						) : successPayload ? (
							<div className="space-y-5">
								<div className="grid gap-4 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-5 text-emerald-100 sm:grid-cols-2">
									<div>
										<p className="text-sm uppercase tracking-wide text-emerald-200">
											{"source" in successPayload &&
											successPayload.source === "generated"
												? "Generated"
												: "Source"}
										</p>
										<p className="mt-1 text-lg font-semibold text-white">
											{successPayload.llmsTxt.title}
										</p>
										{successPayload.llmsTxt.description && (
											<p className="mt-1 text-sm text-emerald-100/80">
												{successPayload.llmsTxt.description}
											</p>
										)}
										{"source" in successPayload && (
											<span className="mt-2 inline-block rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs">
												{successPayload.source === "generated"
													? "Generated with AI"
													: successPayload.source}
											</span>
										)}
										{successPayload.site.llmsTxtUrl && (
											<a
												href={successPayload.site.llmsTxtUrl}
												target="_blank"
												rel="noreferrer"
												className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-200 underline decoration-dotted underline-offset-4 transition hover:text-emerald-50"
											>
												<ExternalLink className="h-3 w-3" aria-hidden="true" />
												View source file
											</a>
										)}
									</div>
									<div className="flex flex-col justify-between gap-3 rounded-xl bg-black/40 p-4 text-sm text-emerald-100">
										<div className="space-y-1">
											<p>
												<strong className="text-white">
													{successPayload.llmsTxt.links.length}
												</strong>{" "}
												linked documents
											</p>
											<p>
												<strong className="text-white">
													{successPayload.download.wordCount.toLocaleString()}
												</strong>{" "}
												total words
											</p>
											{"generated" in successPayload &&
												successPayload.generated && (
													<p>
														<strong className="text-white">
															{successPayload.generated.processedCount}
														</strong>{" "}
														pages processed
													</p>
												)}
										</div>
										<div className="flex flex-col gap-2">
											{downloadUrl && (
												<a
													href={downloadUrl}
													download={successPayload.download.fileName}
													className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100"
												>
													<Download className="h-4 w-4" aria-hidden="true" />
													Download .txt file
												</a>
											)}
											<button
												type="button"
												onClick={handleCopyContent}
												className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
											>
												{copied ? (
													<Check className="h-4 w-4" aria-hidden="true" />
												) : (
													<Copy className="h-4 w-4" aria-hidden="true" />
												)}
												{copied ? "Copied!" : "Copy to clipboard"}
											</button>
										</div>
									</div>
								</div>

								{successPayload.llmsTxt.links.length > 0 && (
									<div className="space-y-3">
										<h3 className="text-lg font-semibold text-white">
											Linked Documentation
										</h3>
										<ul className="space-y-2">
											{successPayload.llmsTxt.links.map((link, index) => (
												<li
													key={`${link.url}-${index}`}
													className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
												>
													<FileText
														className="h-4 w-4 mt-0.5 text-slate-400"
														aria-hidden="true"
													/>
													<div className="flex-1 min-w-0">
														<a
															href={link.url}
															target="_blank"
															rel="noreferrer"
															className="text-sm font-medium text-sky-300 hover:text-sky-100 underline decoration-dotted underline-offset-4"
														>
															{link.title}
														</a>
														{link.description && (
															<p className="text-sm text-slate-400 mt-0.5">
																{link.description}
															</p>
														)}
													</div>
												</li>
											))}
										</ul>
									</div>
								)}

								<div className="space-y-3">
									<h3 className="text-lg font-semibold text-white">
										Raw Content Preview
									</h3>
									<pre className="rounded-xl border border-white/10 bg-black/60 p-4 text-sm text-slate-200 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
										{successPayload.llmsTxt.content.slice(0, 5000)}
										{successPayload.llmsTxt.content.length > 5000 && (
											<span className="text-slate-500">
												{"\n\n"}... (truncated, download for full content)
											</span>
										)}
									</pre>
								</div>
							</div>
						) : null}
					</section>
				) : null}
			</div>
		</main>
	);
}

function base64ToBlob(base64: string, mimeType: string) {
	const byteCharacters = atob(base64);
	const sliceSize = 1024;
	const slicesCount = Math.ceil(byteCharacters.length / sliceSize);
	const byteArrays: BlobPart[] = [];

	for (let sliceIndex = 0; sliceIndex < slicesCount; sliceIndex++) {
		const begin = sliceIndex * sliceSize;
		const end = Math.min(begin + sliceSize, byteCharacters.length);
		const bytes = new Array<number>(end - begin);

		for (let offset = begin, i = 0; offset < end; offset += 1, i += 1) {
			bytes[i] = byteCharacters.charCodeAt(offset);
		}

		byteArrays.push(new Uint8Array(bytes));
	}

	return new Blob(byteArrays, { type: mimeType });
}
