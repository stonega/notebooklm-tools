import {
	Check,
	Copy,
	Download,
	ExternalLink,
	FileText,
	Loader2,
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

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const siteUrlRaw = formData.get("siteUrl");
	const fetchLinkedRaw = formData.get("fetchLinked");
	const fetchLinked = fetchLinkedRaw === "true";

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

	// Construct the llms.txt URL
	const llmsTxtUrl = new URL("/llms.txt", siteUrl.origin);

	// Check if llms.txt exists
	let llmsTxtResponse: Response;
	try {
		llmsTxtResponse = await fetch(llmsTxtUrl.href, {
			headers: {
				"User-Agent":
					"LLMsTxt-Fetcher/1.0 (https://github.com/answerdotai/llms-txt)",
				Accept: "text/plain, text/markdown, */*",
			},
		});
	} catch (error) {
		console.error("Failed to fetch llms.txt:", error);
		return Response.json(
			{
				ok: false,
				error: `Could not connect to ${siteUrl.hostname}. Please check the URL and try again.`,
			},
			{ status: 502 },
		);
	}

	if (!llmsTxtResponse.ok) {
		if (llmsTxtResponse.status === 404) {
			return Response.json(
				{
					ok: false,
					error: `No llms.txt file found at ${llmsTxtUrl.href}. This site doesn't appear to support the llms.txt specification.`,
				},
				{ status: 404 },
			);
		}
		return Response.json(
			{
				ok: false,
				error: `Failed to fetch llms.txt (status ${llmsTxtResponse.status}). Please try again later.`,
			},
			{ status: 502 },
		);
	}

	const llmsTxtContent = await llmsTxtResponse.text();

	if (llmsTxtContent.trim().length === 0) {
		return Response.json(
			{
				ok: false,
				error: "The llms.txt file exists but is empty.",
			},
			{ status: 422 },
		);
	}

	// Parse the llms.txt content
	const { title, description } = parseLLMsTxtHeader(llmsTxtContent);
	const links = parseLLMsTxtLinks(llmsTxtContent, llmsTxtUrl.href);

	// Build the output content
	const outputParts: string[] = [];

	// Add the main llms.txt content first
	outputParts.push("=".repeat(80));
	outputParts.push(`SOURCE: ${llmsTxtUrl.href}`);
	outputParts.push("=".repeat(80));
	outputParts.push("");
	outputParts.push(llmsTxtContent);
	outputParts.push("");

	// Fetch linked content if requested
	const fetchedLinks: Array<{
		title: string;
		url: string;
		content: string | null;
		error: string | null;
	}> = [];

	if (fetchLinked && links.length > 0) {
		for (const link of links) {
			try {
				const response = await fetch(link.url, {
					headers: {
						"User-Agent":
							"LLMsTxt-Fetcher/1.0 (https://github.com/answerdotai/llms-txt)",
						Accept: "text/plain, text/markdown, text/html, */*",
					},
				});

				if (response.ok) {
					const content = await response.text();
					fetchedLinks.push({
						title: link.title,
						url: link.url,
						content,
						error: null,
					});

					outputParts.push("");
					outputParts.push("=".repeat(80));
					outputParts.push(`LINKED DOC: ${link.title}`);
					outputParts.push(`URL: ${link.url}`);
					outputParts.push("=".repeat(80));
					outputParts.push("");
					outputParts.push(content);
				} else {
					fetchedLinks.push({
						title: link.title,
						url: link.url,
						content: null,
						error: `HTTP ${response.status}`,
					});
				}
			} catch {
				fetchedLinks.push({
					title: link.title,
					url: link.url,
					content: null,
					error: "Failed to fetch",
				});
			}
		}
	}

	const fullContent = outputParts.join("\n");

	// Create a base64-encoded txt file for download
	const contentBase64 = Buffer.from(fullContent, "utf-8").toString("base64");
	const siteName = siteUrl.hostname.replace(/\./g, "-");
	const fileName = `llmstxt-${siteName}-${new Date().toISOString().slice(0, 10)}.txt`;

	return Response.json({
		ok: true,
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
		fetchedLinks: fetchLinked ? fetchedLinks : null,
		download: {
			contentBase64,
			fileName,
			wordCount: countWords(fullContent),
		},
	});
}

function countWords(text: string) {
	return text.split(/\s+/).filter(Boolean).length;
}

export default function LLMsTxt() {
	const fetcher = useFetcher<LLMsTxtActionData>();
	const [siteUrl, setSiteUrl] = useState("");
	const [fetchLinked, setFetchLinked] = useState(false);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const downloadUrlRef = useRef<string | null>(null);

	const isSubmitting = fetcher.state !== "idle";
	const data = fetcher.data;
	const errorMessage = data?.ok === false ? data.error : null;
	const successPayload = data?.ok ? data : null;

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

	const actionDescription = useMemo(() => {
		if (isSubmitting) {
			return "Checking for llms.txt and fetching content...";
		}
		if (successPayload) {
			return "Successfully fetched llms.txt content.";
		}
		if (errorMessage) {
			return "We ran into an issue. See the message below.";
		}
		return "Enter a docs site URL to check for llms.txt";
	}, [errorMessage, isSubmitting, successPayload]);

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
						Fetch llms.txt from any documentation site.
					</h1>
					<p className="max-w-2xl text-lg">
						Enter a docs site URL to check if it supports the{" "}
						<a
							href="https://llmstxt.org"
							target="_blank"
							rel="noreferrer"
							className="underline decoration-dotted underline-offset-4 hover:text-foreground/80"
						>
							llms.txt specification
						</a>
						. If found, download the LLM-friendly content as a text file.
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
								We'll check for{" "}
								<code className="bg-muted px-1 py-0.5 rounded text-xs">
									/llms.txt
								</code>{" "}
								at the root of this domain.
							</p>
						</div>

						<div className="flex items-center gap-3">
							<input
								type="checkbox"
								id="fetchLinked"
								name="fetchLinked"
								value="true"
								checked={fetchLinked}
								onChange={(e) => setFetchLinked(e.target.checked)}
								className="h-4 w-4 rounded border-border"
							/>
							<label htmlFor="fetchLinked" className="text-sm">
								Also fetch all linked documentation files
							</label>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium">What is llms.txt?</span>
							<ul className="list-disc space-y-1 pl-5 text-sm">
								<li>
									A markdown file at{" "}
									<code className="bg-muted px-1 py-0.5 rounded text-xs">
										/llms.txt
									</code>{" "}
									on a website.
								</li>
								<li>Provides LLM-friendly documentation and context.</li>
								<li>Contains links to additional markdown documentation.</li>
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
										Fetching...
									</>
								) : (
									<>
										<FileText className="h-4 w-4" aria-hidden="true" />
										Fetch llms.txt
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
								<p className="font-medium">No llms.txt found</p>
								<p className="mt-1 text-sm text-red-100">{errorMessage}</p>
							</div>
						) : successPayload ? (
							<div className="space-y-5">
								<div className="grid gap-4 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-5 text-emerald-100 sm:grid-cols-2">
									<div>
										<p className="text-sm uppercase tracking-wide text-emerald-200">
											Site
										</p>
										<p className="mt-1 text-lg font-semibold text-white">
											{successPayload.llmsTxt.title}
										</p>
										{successPayload.llmsTxt.description && (
											<p className="mt-1 text-sm text-emerald-100/80">
												{successPayload.llmsTxt.description}
											</p>
										)}
										<a
											href={successPayload.site.llmsTxtUrl}
											target="_blank"
											rel="noreferrer"
											className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-200 underline decoration-dotted underline-offset-4 transition hover:text-emerald-50"
										>
											<ExternalLink className="h-3 w-3" aria-hidden="true" />
											View llms.txt
										</a>
									</div>
									<div className="flex flex-col justify-between gap-3 rounded-xl bg-black/40 p-4 text-sm text-emerald-100">
										<div className="space-y-1">
											<p>
												<strong className="text-white">
													{successPayload.llmsTxt.links.length}
												</strong>{" "}
												linked documents found
											</p>
											<p>
												<strong className="text-white">
													{successPayload.download.wordCount.toLocaleString()}
												</strong>{" "}
												total words
											</p>
											{successPayload.fetchedLinks && (
												<p>
													<strong className="text-white">
														{
															successPayload.fetchedLinks.filter(
																(l) => l.content,
															).length
														}
													</strong>{" "}
													of {successPayload.fetchedLinks.length} docs fetched
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
													{successPayload.fetchedLinks && (
														<span
															className={`text-xs px-2 py-0.5 rounded-full ${
																successPayload.fetchedLinks.find(
																	(l) => l.url === link.url,
																)?.content
																	? "bg-emerald-500/20 text-emerald-300"
																	: "bg-red-500/20 text-red-300"
															}`}
														>
															{successPayload.fetchedLinks.find(
																(l) => l.url === link.url,
															)?.content
																? "Fetched"
																: "Failed"}
														</span>
													)}
												</li>
											))}
										</ul>
									</div>
								)}

								<div className="space-y-3">
									<h3 className="text-lg font-semibold text-white">
										Raw llms.txt Content
									</h3>
									<pre className="rounded-xl border border-white/10 bg-black/60 p-4 text-sm text-slate-200 overflow-x-auto whitespace-pre-wrap">
										{successPayload.llmsTxt.content}
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
