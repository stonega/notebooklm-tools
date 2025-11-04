import { json } from "@react-router/node";
import JSZip from "jszip";
import { convert } from "html-to-text";
import { Loader2, Sparkles, Download, BookOpen, Shield } from "lucide-react";
import Parser from "rss-parser";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import type { Route } from "./+types/home";

type ActionData =
  | { ok: false; error: string }
  | {
      ok: true;
      archiveBase64: string;
      fileName: string;
      feed: {
        title: string;
        description: string | null;
        url: string;
        totalEntries: number;
        extractedEntries: number;
      };
      entries: Array<{
        id: string;
        title: string;
        url: string;
        publishedAt: string | null;
        wordCount: number;
        summary: string;
      }>;
    };

type FeedEntry = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  textContent: string;
};

const SAMPLE_FEED = "https://hnrss.org/frontpage";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "RSS → NotebookLM Source Builder" },
    {
      name: "description",
      content:
        "Transform any RSS feed into a ready-to-import NotebookLM source bundle with a single click.",
    },
  ];
}

export const MAX_LIMIT = 40;

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const feedUrlRaw = formData.get("feedUrl");
  const limitRaw = formData.get("limit");

  if (typeof feedUrlRaw !== "string" || feedUrlRaw.trim().length === 0) {
    return json<ActionData>({ ok: false, error: "Please enter an RSS feed URL." }, { status: 400 });
  }

  let feedUrl: URL;
  try {
    feedUrl = new URL(feedUrlRaw.trim());
  } catch {
    return json<ActionData>({ ok: false, error: "That doesn’t look like a valid URL." }, { status: 422 });
  }

  const parsedLimit = Number.parseInt(typeof limitRaw === "string" ? limitRaw : "", 10);
  const limit = Number.isInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : 15;

  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "NotebookLM-Source-Converter/1.0 (+https://notebooklm.google.com)",
      Accept: "application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
    },
  });

  if (!response.ok) {
    return json<ActionData>(
      {
        ok: false,
        error: `We couldn’t reach that feed (status ${response.status}). Please try again later.`,
      },
      { status: 502 },
    );
  }

  const xml = await response.text();
  const parser = new Parser({
    customFields: {
      item: [["content:encoded", "contentEncoded"], "summary", "isoDate"],
    },
  });

  let feed;
  try {
    feed = await parser.parseString(xml);
  } catch (error) {
    console.error("Failed to parse RSS", error);
    return json<ActionData>(
      {
        ok: false,
        error: "We couldn’t understand that feed. Double-check the URL or try another feed.",
      },
      { status: 422 },
    );
  }

  const sourceTitle = feed.title?.trim() ?? feedUrl.hostname;
  const items = Array.isArray(feed.items) ? feed.items : [];

  if (items.length === 0) {
    return json<ActionData>(
      {
        ok: false,
        error: "That feed didn’t include any entries. Try a different feed with recent posts.",
      },
      { status: 404 },
    );
  }

  const sliced = items.slice(0, limit);
  const entries: FeedEntry[] = [];

  for (const [index, item] of sliced.entries()) {
    const title = (typeof item.title === "string" && item.title.trim().length > 0
      ? item.title.trim()
      : `Entry ${index + 1}`);

    const url = typeof item.link === "string" && item.link.trim().length > 0 ? item.link : feed.link ?? feedUrl.href;

    const rawHtml =
      (typeof (item as Record<string, unknown>).contentEncoded === "string"
        ? (item as Record<string, unknown>).contentEncoded
        : null) ||
      (typeof item.content === "string" ? item.content : null) ||
      (typeof item.summary === "string" ? item.summary : null) ||
      "";

    const textContent = convert(rawHtml, {
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ],
      wordwrap: false,
      preserveNewlines: true,
    }).trim();

    entries.push({
      id: createEntryId(index + 1, title),
      title,
      url,
      publishedAt:
        typeof (item as Record<string, unknown>).isoDate === "string"
          ? (item as Record<string, unknown>).isoDate
          : typeof item.pubDate === "string"
            ? item.pubDate
            : null,
      textContent: textContent.length > 0 ? textContent : "(No body content provided by the feed)",
    });
  }

  const archive = await buildArchive({
    feedTitle: sourceTitle,
    feedDescription: typeof feed.description === "string" ? feed.description : null,
    feedUrl: feed.link ?? feedUrl.href,
    entries,
  });

  return json<ActionData>({
    ok: true,
    archiveBase64: archive.base64,
    fileName: archive.fileName,
    feed: {
      title: sourceTitle,
      description: typeof feed.description === "string" ? feed.description : null,
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
  });
}

export default function Home() {
  const fetcher = useFetcher<ActionData>();
  const [feedUrl, setFeedUrl] = useState("");
  const [limit, setLimit] = useState("15");
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
      const blob = base64ToBlob(successPayload.archiveBase64, "application/zip");
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
    if (fetcher.state === "idle") {
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
    return "Paste a feed URL and we’ll handle the rest.";
  }, [errorMessage, isSubmitting, successPayload]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pb-24 pt-16 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>NotebookLM Toolkit · RSS Source Builder</span>
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Turn any RSS feed into rich NotebookLM sources in one step.
          </h1>
          <p className="max-w-2xl text-lg text-slate-200">
            Paste a feed URL, choose how many recent entries to include, and download a ready-to-import zip bundle with clean text, metadata, and article files for NotebookLM.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-200">
            <FeaturePill icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}>
              Cleans and formats content for optimal NotebookLM summaries.
            </FeaturePill>
            <FeaturePill icon={<Shield className="h-4 w-4" aria-hidden="true" />}>
              Keeps all processing local to your session—no caching.
            </FeaturePill>
          </div>
        </header>

        <section className="grid gap-10 lg:grid-cols-[1.2fr,0.8fr]">
          <fetcher.Form
            method="post"
            className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur"
            replace
          >
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="feedUrl">
                RSS feed URL
              </label>
              <input
                id="feedUrl"
                name="feedUrl"
                value={feedUrl}
                onChange={(event) => setFeedUrl(event.target.value)}
                required
                type="url"
                placeholder="https://example.com/feed"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                aria-describedby="feedUrl-help"
              />
              <p id="feedUrl-help" className="text-sm text-slate-300">
                Need inspiration? Try the <button
                  type="button"
                  onClick={() => setFeedUrl(SAMPLE_FEED)}
                  className="underline decoration-dotted underline-offset-4 transition hover:text-sky-200"
                >Hacker News front page feed</button> or any site that offers RSS.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="limit">
                How many recent entries?
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="limit"
                  name="limit"
                  type="number"
                  min={1}
                  max={MAX_LIMIT}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="w-28 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                <span className="text-sm text-slate-300">
                  You can include up to {MAX_LIMIT} items at once. Default is 15.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">What happens next</span>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                <li>Your feed is fetched live and converted into clean text.</li>
                <li>Each entry becomes both a NotebookLM JSON source and a Markdown file.</li>
                <li>You get a downloadable zip bundle ready for import.</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:bg-slate-600/70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Converting…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Build NotebookLM bundle
                  </>
                )}
              </button>
              <span className="text-sm text-slate-300" aria-live="polite">
                {actionDescription}
              </span>
            </div>
          </fetcher.Form>

          <aside className="flex h-full flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 text-sm text-slate-200 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Why NotebookLM sources?</h2>
            <p>
              NotebookLM works best when each source is concise, clean, and richly annotated. This tool
              handles the tedious parts so you can focus on the conversation.
            </p>
            <div className="space-y-3">
              <TipCard
                title="Keep things current"
                description="Run the converter whenever a feed updates and re-import to keep NotebookLM fresh."
              />
              <TipCard
                title="Mix feeds"
                description="Combine multiple bundles inside NotebookLM to create a curated reading brief."
              />
              <TipCard
                title="Share safely"
                description="The zip file stays in your browser session—download or discard as you prefer."
              />
            </div>
            <span className="mt-auto text-xs text-slate-400">
              Looking for other formats? More NotebookLM tools are on the way.
            </span>
          </aside>
        </section>

        <section
          id="conversion-result"
          className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-8 text-slate-100 backdrop-blur"
          aria-live="polite"
        >
          <h2 className="text-2xl font-semibold text-white">Conversion status</h2>
          {errorMessage ? (
            <div className="rounded-2xl border border-red-400/60 bg-red-500/10 p-5 text-red-200">
              <p className="font-medium">We hit a snag.</p>
              <p className="mt-1 text-sm text-red-100">{errorMessage}</p>
            </div>
          ) : successPayload ? (
            <div className="space-y-5">
              <div className="grid gap-4 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-5 text-emerald-100 sm:grid-cols-2">
                <div>
                  <p className="text-sm uppercase tracking-wide text-emerald-200">Feed</p>
                  <p className="mt-1 text-lg font-semibold text-white">{successPayload.feed.title}</p>
                  <p className="mt-1 text-sm text-emerald-100/80">
                    {successPayload.feed.description ?? "No description provided."}
                  </p>
                    <a
                      href={successPayload.feed.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-200 underline decoration-dotted underline-offset-4 transition hover:text-emerald-50"
                    >
                    Visit feed
                    </a>
                </div>
                <div className="flex flex-col justify-between gap-3 rounded-xl bg-black/40 p-4 text-sm text-emerald-100">
                  <p>
                    Extracted <strong className="text-white">{successPayload.feed.extractedEntries}</strong> of
                    <strong className="text-white"> {successPayload.feed.totalEntries}</strong> entries.
                  </p>
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      download={successPayload.fileName}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-100"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download NotebookLM bundle
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">Included entries</h3>
                <ul className="space-y-3">
                  {successPayload.entries.map((entry) => (
                    <li key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-base font-semibold text-white">{entry.title}</p>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                            {entry.wordCount.toLocaleString()} words
                          </span>
                        </div>
                        <p className="text-xs uppercase tracking-wide text-slate-300">
                          {entry.publishedAt ? new Date(entry.publishedAt).toLocaleString() : "Publish date unavailable"}
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
              Conversion updates and the download link will appear here after you submit a feed.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function FeaturePill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-medium text-slate-200">
      {icon}
      {children}
    </span>
  );
}

function TipCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-200">{description}</p>
    </div>
  );
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
      file: `articles/${entry.id}.md`,
    })),
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const articles = zip.folder("articles");
  if (articles) {
    for (const entry of entries) {
      const headerLines = [
        `# ${entry.title}`,
        entry.publishedAt ? `Published: ${entry.publishedAt}` : null,
        `Source: ${entry.url}`,
        "",
      ].filter(Boolean);
      const body = `${headerLines.join("\n")}\n${entry.textContent}\n`;
      articles.file(`${entry.id}.md`, body);
    }
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

function base64ToBlob(base64: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const sliceSize = 1024;
  const slicesCount = Math.ceil(byteCharacters.length / sliceSize);
  const byteArrays = new Array<Uint8Array>(slicesCount);

  for (let sliceIndex = 0; sliceIndex < slicesCount; sliceIndex++) {
    const begin = sliceIndex * sliceSize;
    const end = Math.min(begin + sliceSize, byteCharacters.length);
    const bytes = new Array<number>(end - begin);

    for (let offset = begin, i = 0; offset < end; offset += 1, i += 1) {
      bytes[i] = byteCharacters.charCodeAt(offset);
    }

    byteArrays[sliceIndex] = new Uint8Array(bytes);
  }

  return new Blob(byteArrays, { type: mimeType });
}
