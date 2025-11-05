import { Readability } from "@mozilla/readability";
import { convert } from "html-to-text";
import { JSDOM } from "jsdom";
import JSZip from "jszip";
import { BookOpen, Download, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Parser, { type Item, type Output as RssFeed } from "rss-parser";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { ActionData, FeedEntry } from "../lib/types";
import type { Route } from "./+types/hackernews";

const HACKERNEWS_FEED = "https://hnrss.org/frontpage";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Hacker News" },
		{
			name: "description",
			content:
				"Transform Hacker News top stories into a ready-to-import NotebookLM source bundle with a single click.",
		},
	];
}

export const MAX_LIMIT = 40;

type RssItem = Item & {
	"content:encoded"?: string;
	contentEncoded?: string;
	isoDate?: string;
};

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const limitRaw = formData.get("storyCount");

	let feedUrl: URL;
	try {
		feedUrl = new URL(HACKERNEWS_FEED);
	} catch {
		return new Response(
			JSON.stringify({
				ok: false,
				error: "The Hacker News feed URL seems to be invalid.",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const parsedLimit = Number.parseInt(
		typeof limitRaw === "string" ? limitRaw : "",
		10,
	);
	const limit = Number.isInteger(parsedLimit)
		? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
		: 15;

	const response = await fetch(HACKERNEWS_FEED, {
		headers: {
			"User-Agent":
				"NotebookLM-Source-Converter/1.0 (+https://notebooklm.google.com)",
			Accept:
				"application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
		},
	});

	if (!response.ok) {
		return new Response(
			JSON.stringify({
				ok: false,
				error: `We couldn’t reach that feed (status ${response.status}). Please try again later.`,
			}),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
	}

	const xml = await response.text();
	const parser = new Parser({
		customFields: {
			item: [["content:encoded", "contentEncoded"], "summary", "isoDate"],
		},
	});

	let feed: RssFeed<RssItem> | undefined;
	try {
		feed = (await parser.parseString(xml)) as RssFeed<RssItem>;
	} catch (error) {
		console.error("Failed to parse RSS", error);
		return new Response(
			JSON.stringify({
				ok: false,
				error:
					"We couldn’t understand that feed. Double-check the URL or try another feed.",
			}),
			{ status: 422, headers: { "Content-Type": "application/json" } },
		);
	}

	const sourceTitle = feed.title?.trim() ?? feedUrl.hostname;
	const items = Array.isArray(feed.items) ? feed.items : [];

	if (items.length === 0) {
		return new Response(
			JSON.stringify({
				ok: false,
				error:
					"That feed didn’t include any entries. Try a different feed with recent posts.",
			}),
			{ status: 404, headers: { "Content-Type": "application/json" } },
		);
	}

	const sliced = items.slice(0, limit);
	const entries: FeedEntry[] = [];

	for (const [index, item] of sliced.entries()) {
		const title =
			typeof item.title === "string" && item.title.trim().length > 0
				? item.title.trim()
				: `Entry ${index + 1}`;

		const url =
			typeof item.link === "string" && item.link.trim().length > 0
				? item.link
				: (feed.link ?? feedUrl.href);

		const rawHtml =
			item.contentEncoded ??
			item["content:encoded"] ??
			item.content ??
			item.summary ??
			"";

		const textContent = convert(rawHtml, {
			selectors: [
				{ selector: "img", format: "skip" },
				{ selector: "a", options: { hideLinkHrefIfSameAsText: true } },
			],
			wordwrap: false,
			preserveNewlines: true,
		}).trim();

		const articleContent = await fetchArticleContent(url);

		entries.push({
			id: createEntryId(index + 1, title),
			title,
			url,
			publishedAt: item.isoDate ?? item.pubDate ?? null,
			textContent:
				articleContent ??
				(textContent.length > 0
					? textContent
					: "(No body content provided by the feed)"),
		});
	}

	const archive = await buildArchive({
		feedTitle: sourceTitle,
		feedDescription:
			typeof feed.description === "string" ? feed.description : null,
		feedUrl: feed.link ?? feedUrl.href,
		entries,
	});

	return new Response(
		JSON.stringify({
			ok: true,
			archiveBase64: archive.base64,
			fileName: archive.fileName,
			feed: {
				title: sourceTitle,
				description:
					typeof feed.description === "string" ? feed.description : null,
				url: feed.link ?? feedUrl.href,
				totalEntries: items.length,
				extractedEntries: entries.length,
			},
			entries: entries.map((entry) => ({
				id: entry.id,
				title: entry.title,
				url: entry.url,
				publishedAt: entry.publishedAt,
				wordCount: countWords(entry.textContent),
				summary: entry.textContent.slice(0, 320),
			})),
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

export default function HackerNews() {
	const fetcher = useFetcher<ActionData>();
	const [storyCount, setStoryCount] = useState("15");
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
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

		if (successPayload?.archiveBase64) {
			const blob = base64ToBlob(
				successPayload.archiveBase64,
				"application/zip",
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
			const resultRegion = document.getElementById("conversion-result");
			if (resultRegion) {
				resultRegion.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}
	}, [fetcher.state, fetcher.formData]);

	const actionDescription = useMemo(() => {
		if (isSubmitting) {
			return "Fetching feed and preparing NotebookLM source bundle.";
		}
		if (successPayload) {
			return "Finished building your NotebookLM bundle.";
		}
		if (errorMessage) {
			return "We ran into an issue. See the message below.";
		}
		return "Select how many stories you want and we’ll handle the rest.";
	}, [errorMessage, isSubmitting, successPayload]);

	return (
		<main className="min-h-screen ">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pb-24 pt-16 sm:px-6 lg:px-8">
				<header className="flex flex-col gap-6 rounded-sm border border-border/10">
					<div className="flex items-center gap-3 text-sm ">
						<Sparkles className="h-4 w-4" aria-hidden="true" />
						<span>NotebookLM Toolkit · Hacker News Source Builder</span>
					</div>
					<h1 className="text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
						Turn Hacker News front page stories into a NotebookLM source.
					</h1>
					<p className="max-w-2xl text-lg">
						Fetch the latest front page stories from Hacker News and download a
						ready-to-import zip bundle with clean text, metadata, and article
						files for NotebookLM.
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
								htmlFor="storyCount"
							>
								How many stories to include?
							</label>
							<div className="flex items-center gap-3">
								<Input
									id="storyCount"
									name="storyCount"
									type="number"
									min={1}
									max={MAX_LIMIT}
									value={storyCount}
									onChange={(event) => setStoryCount(event.target.value)}
									className="w-28"
								/>
								<span className="text-sm">
									You can include up to {MAX_LIMIT} stories. Default is 15.
								</span>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-sm font-medium">What happens next</span>
							<ul className="list-disc space-y-1 pl-5 text-sm">
								<li>
									The top stories from the Hacker News front page are fetched.
								</li>
								<li>
									Each story becomes both a NotebookLM JSON source and a
									Markdown file.
								</li>
								<li>You get a downloadable zip bundle ready for import.</li>
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
										Building…
									</>
								) : (
									<>
										<Download className="h-4 w-4" aria-hidden="true" />
										Build NotebookLM bundle
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
						id="conversion-result"
						className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-8 text-slate-100 backdrop-blur"
						aria-live="polite"
					>
						<h2 className="text-2xl font-semibold text-white">
							Conversion status
						</h2>
						{errorMessage ? (
							<div className="rounded-2xl border border-red-400/60 bg-red-500/10 p-5 text-red-200">
								<p className="font-medium">We hit a snag.</p>
								<p className="mt-1 text-sm text-red-100">{errorMessage}</p>
							</div>
						) : successPayload ? (
							<div className="space-y-5">
								<div className="grid gap-4 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-5 text-emerald-100 sm:grid-cols-2">
									<div>
										<p className="text-sm uppercase tracking-wide text-emerald-200">
											Source
										</p>
										<p className="mt-1 text-lg font-semibold text-white">
											{successPayload.feed.title}
										</p>
										<p className="mt-1 text-sm text-emerald-100/80">
											{successPayload.feed.description}
										</p>
										<a
											href={successPayload.feed.url}
											target="_blank"
											rel="noreferrer"
											className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-200 underline decoration-dotted underline-offset-4 transition hover:text-emerald-50"
										>
											Visit Hacker News
										</a>
									</div>
									<div className="flex flex-col justify-between gap-3 rounded-xl bg-black/40 p-4 text-sm text-emerald-100">
										<p>
											Extracted{" "}
											<strong className="text-white">
												{successPayload.feed.extractedEntries}
											</strong>{" "}
											of
											<strong className="text-white">
												{" "}
												{successPayload.feed.totalEntries}
											</strong>{" "}
											stories.
										</p>
										{downloadUrl ? (
											<a
												href={downloadUrl}
												download={successPayload.fileName}
												className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100"
											>
												<Download className="h-4 w-4" aria-hidden="true" />
												Download NotebookLM bundle
											</a>
										) : null}
									</div>
								</div>

								<div className="space-y-3">
									<h3 className="text-lg font-semibold text-white">
										Included stories
									</h3>
									<ul className="space-y-3">
										{successPayload.entries.map((entry) => (
											<li
												key={entry.id}
												className="rounded-2xl border border-white/10 bg-white/5 p-4"
											>
												<div className="flex flex-col gap-2">
													<div className="flex flex-wrap items-center justify-between gap-2">
														<p className="text-base font-semibold text-white">
															{entry.title}
														</p>
														<span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
															{entry.wordCount.toLocaleString()} words
														</span>
													</div>
													<p className="text-xs uppercase tracking-wide text-slate-300">
														{entry.publishedAt
															? new Date(entry.publishedAt).toLocaleString()
															: "Publish date unavailable"}
													</p>
													<p className="text-sm text-slate-200">
														{entry.summary}
														{entry.summary.length >= 320 ? "…" : ""}
													</p>
													<a
														href={entry.url}
														target="_blank"
														rel="noreferrer"
														className="inline-flex w-fit items-center gap-2 text-sm font-medium text-sky-300 underline decoration-dotted underline-offset-4 transition hover:text-sky-100"
													>
														Read original article
													</a>
												</div>
											</li>
										))}
									</ul>
								</div>
							</div>
						) : (
							<div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
								Conversion updates and the download link will appear here after
								you start the build.
							</div>
						)}
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
function createEntryId(index: number, title: string) {
	const safeTitle = title
		.toLowerCase()
		.normalize("NFD")
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const short = safeTitle.slice(0, 48);
	return `${index.toString().padStart(2, "0")}-${short.length > 0 ? short : "entry"}`;
}
async function buildArchive({
	feedTitle,
	feedDescription,
	feedUrl,
	entries,
}: {
	feedTitle: string;
	feedDescription: string | null;
	feedUrl: string;
	entries: FeedEntry[];
}) {
	const zip = new JSZip();
	const nowIso = new Date().toISOString();
	const manifest = {
		$schema: "https://notebooklm.google.com/schemas/source-bundle.v1.json",
		generatedAt: nowIso,
		feed: {
			title: feedTitle,
			description: feedDescription,
			url: feedUrl,
		},
		entries: entries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			url: entry.url,
			publishedAt: entry.publishedAt,
			wordCount: countWords(entry.textContent),
			file: `${entry.id}.md`,
		})),
	};
	zip.file("manifest.json", JSON.stringify(manifest, null, 2));
	for (const entry of entries) {
		const headerLines = [
			`# ${entry.title}`,
			entry.publishedAt ? `Published: ${entry.publishedAt}` : null,
			`Source: ${entry.url}`,
			"",
		].filter(Boolean);
		const body = `${headerLines.join("\n")}\n${entry.textContent}\n`;
		zip.file(`${entry.id}.md`, body);
	}
	const summary = {
		version: 1,
		createdAt: nowIso,
		entries: entries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			url: entry.url,
			publishedAt: entry.publishedAt,
			text: entry.textContent,
		})),
	};
	zip.file("sources.json", JSON.stringify(summary, null, 2));
	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	const fileName = `${slugify(feedTitle)}-${nowIso.slice(0, 10)}.zip`;
	return {
		base64: buffer.toString("base64"),
		fileName,
	};
}
function slugify(input: string) {
	const normalized = input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized.length > 0 ? normalized : "notebooklm-source";
}
function countWords(text: string) {
	return text.split(/\s+/).filter(Boolean).length;
}

async function fetchArticleContent(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
			},
		});
		if (!response.ok) {
			console.error(`Failed to fetch article: ${response.statusText}`);
			return null;
		}
		const html = await response.text();
		const dom = new JSDOM(html, { url });
		const reader = new Readability(dom.window.document);
		const article = reader.parse();
		return article?.textContent ?? null;
	} catch (error) {
		console.error("Error fetching or parsing article:", error);
		return null;
	}
}
