import JSZip from "jszip";
import {
    Code,
    Download,
    FileArchive,
    Github,
    Loader2,
    Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { buildCanonicalLink, buildMeta, getCanonicalUrl } from "../lib/seo";
import type { GitHubActionData, RepoFile } from "../lib/types";
import type { Route } from "./+types/github";

const GITHUB_PATH = "/github";
const GITHUB_DESCRIPTION =
    "Convert GitHub repositories or ZIP archives into NotebookLM sources. Automatically filters files and converts code to text.";
const GITHUB_KEYWORDS = [
    "GitHub to NotebookLM",
    "repo converter",
    "source bundler",
    "code to text",
    "notebooklm tools",
];

export function meta(_args: Route.MetaArgs) {
    return buildMeta({
        title: "GitHub Repo & ZIP Converter",
        description: GITHUB_DESCRIPTION,
        path: GITHUB_PATH,
        keywords: GITHUB_KEYWORDS,
    });
}

export const links: Route.LinksFunction = () => [
    buildCanonicalLink(GITHUB_PATH),
];

// File extension lists
const DOC_EXTENSIONS = new Set(["pdf", "txt", "md", "docx"]);
const IMG_EXTENSIONS = new Set([
    "avif",
    "bmp",
    "gif",
    "ico",
    "jp2",
    "png",
    "webp",
    "tif",
    "tiff",
    "heic",
    "heif",
    "jpeg",
    "jpg",
    "jpe",
]);
const MEDIA_EXTENSIONS = new Set([
    "3g2",
    "3gp",
    "aac",
    "aif",
    "aifc",
    "aiff",
    "amr",
    "au",
    "avi",
    "cda",
    "m4a",
    "mid",
    "mp3",
    "mp4",
    "mpeg",
    "ogg",
    "opus",
    "ra",
    "ram",
    "snd",
    "wav",
    "wma",
]);
// Common code extensions to convert to .txt
const CODE_EXTENSIONS = new Set([
    "js",
    "ts",
    "jsx",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "go",
    "rs",
    "rb",
    "php",
    "swift",
    "kt",
    "scala",
    "vue",
    "svelte",
    "sql",
    "sh",
    "bash",
    "yaml",
    "yml",
    "json",
    "xml",
    "html",
    "css",
    "scss",
    "less",
    "r",
    "m",
    "pl",
    "pm",
    "t",
    "lua",
    "dart",
    "elm",
    "erl",
    "ex",
    "exs",
    "fs",
    "fsx",
    "hs",
    "lhs",
]);
const IGNORED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "target",
    "vendor",
    "bin",
    "obj",
    ".idea",
    ".vscode",
    "__pycache__",
    ".next",
    ".nuxt",
    "coverage",
]);

export default function GitHubTool() {
    const [repoUrl, setRepoUrl] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Only store success data here to avoid type narrowing issues
    const [successData, setSuccessData] = useState<
        Extract<GitHubActionData, { ok: true }> | null
    >(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const downloadUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (downloadUrlRef.current) {
                URL.revokeObjectURL(downloadUrlRef.current);
                downloadUrlRef.current = null;
            }
        };
    }, []);

    const processZip = async (
        zipData: ArrayBuffer,
        sourceName: string,
        repoInfo?: { owner: string; name: string; url: string },
    ) => {
        setIsProcessing(true);
        setError(null);
        setSuccessData(null);

        try {
            const jszip = new JSZip();
            const inputZip = await jszip.loadAsync(zipData);
            const outputZip = new JSZip();

            const stats = {
                totalFiles: 0,
                includedFiles: 0,
                codeFilesConverted: 0,
            };
            const processedFiles: RepoFile[] = [];

            // Helper to check if path contains ignored directory
            const isIgnored = (path: string) => {
                const parts = path.split("/");
                return parts.some((part) => IGNORED_DIRS.has(part));
            };

            const entries = Object.entries(inputZip.files);
            stats.totalFiles = entries.length;

            for (const [path, file] of entries) {
                if (file.dir || isIgnored(path)) continue;

                // Skip dotfiles (except specific config files if needed, but keeping simple for now)
                const fileName = path.split("/").pop() || "";
                if (fileName.startsWith(".")) continue;

                const extension = fileName.split(".").pop()?.toLowerCase() || "";
                let shouldInclude = false;
                let isCode = false;
                let targetPath = path;

                // Flatten directory structure slightly by removing top-level folder if it exists (common in GitHub Zips)
                // GitHub Zips usually wrap everything in `user-repo-sha/`
                const pathParts = path.split("/");
                if (
                    pathParts.length > 1 &&
                    repoInfo &&
                    pathParts[0].includes(repoInfo.name)
                ) {
                    targetPath = pathParts.slice(1).join("/");
                }

                if (
                    DOC_EXTENSIONS.has(extension) ||
                    IMG_EXTENSIONS.has(extension) ||
                    MEDIA_EXTENSIONS.has(extension)
                ) {
                    shouldInclude = true;
                } else if (CODE_EXTENSIONS.has(extension)) {
                    shouldInclude = true;
                    isCode = true;
                    // Rename to .txt for NotebookLM readability
                    targetPath = `${targetPath}.txt`;
                    stats.codeFilesConverted++;
                }

                if (shouldInclude) {
                    const content = await file.async("blob");
                    outputZip.file(targetPath, content);
                    stats.includedFiles++;

                    processedFiles.push({
                        path: targetPath,
                        name: fileName,
                        originalExtension: extension,
                        convertedName: targetPath.split("/").pop() || "",
                        size: content.size,
                        isCode,
                    });
                }
            }

            if (stats.includedFiles === 0) {
                throw new Error("No supported files found in the archive.");
            }

            // Add manifest
            const manifest = {
                source: repoInfo ? "github" : "upload",
                generatedAt: new Date().toISOString(),
                repo: repoInfo,
                stats,
                files: processedFiles.map((f) => f.path),
            };
            outputZip.file("notebooklm-manifest.json", JSON.stringify(manifest, null, 2));

            // Generate output zip
            const outputBlob = await outputZip.generateAsync({ type: "blob" });
            const objectUrl = URL.createObjectURL(outputBlob);

            if (downloadUrlRef.current) {
                URL.revokeObjectURL(downloadUrlRef.current);
            }
            downloadUrlRef.current = objectUrl;
            setDownloadUrl(objectUrl);

            setSuccessData({
                ok: true,
                source: repoInfo ? "github" : "upload",
                repo: repoInfo,
                archiveBase64: "", // Not used in client-side flow, keeping for type compat
                fileName: `${sourceName}-notebooklm.zip`,
                stats,
                files: processedFiles,
            });
        } catch (err) {
            console.error(err);
            setError(
                err instanceof Error ? err.message : "Failed to process ZIP file",
            );
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) return;

        // Parse GitHub URL
        try {
            const url = new URL(repoUrl);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length < 2) throw new Error("Invalid GitHub repository URL");

            const owner = parts[0];
            const repo = parts[1];
            const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;

            setIsProcessing(true);
            setError(null);

            const response = await fetch(zipUrl);
            if (!response.ok) {
                if (response.status === 404)
                    throw new Error("Repository not found or private");
                throw new Error(`Failed to download repo: ${response.statusText}`);
            }

            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            await processZip(buffer, `${owner}-${repo}`, {
                owner,
                name: repo,
                url: `https://github.com/${owner}/${repo}`,
            });
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to fetch repository",
            );
            setIsProcessing(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const buffer = await file.arrayBuffer();
        await processZip(buffer, file.name.replace(/\.zip$/i, ""));
    };

    const statusMessage = useMemo(() => {
        if (isProcessing) return "Processing files and building bundle...";
        if (successData) return "Bundle ready for download!";
        if (error) return "Something went wrong.";
        return "Ready to convert.";
    }, [isProcessing, successData, error]);

    return (
        <main className="min-h-screen">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pb-24 pt-16 sm:px-6 lg:px-8">
                <header className="flex flex-col gap-6 rounded-sm border border-border/10">
                    <div className="flex items-center gap-3 text-sm">
                        <Github className="h-4 w-4" aria-hidden="true" />
                        <span>NotebookLM Toolkit · GitHub & ZIP Converter</span>
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                            Import codebases into NotebookLM.
                        </h1>
                        <p className="max-w-2xl text-lg">
                            Paste a GitHub URL or upload a ZIP. We'll filter for relevant
                            files, convert code to text, and package everything for easy
                            import.
                        </p>
                    </div>
                </header>

                <div className="grid gap-10 lg:grid-cols-2">
                    <section className="flex flex-col gap-8">
                        <div className="rounded-md border border-border/10 bg-card p-6 backdrop-blur">
                            <h2 className="mb-4 text-lg font-medium">From GitHub</h2>
                            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="repo-url" className="text-sm text-foreground">
                                        Repository URL
                                    </label>
                                    <Input
                                        id="repo-url"
                                        type="url"
                                        placeholder="https://github.com/owner/repo"
                                        value={repoUrl}
                                        onChange={(e) => setRepoUrl(e.target.value)}
                                        required
                                        className="bg-background"
                                    />
                                </div>
                                <Button type="submit" disabled={isProcessing}>
                                    {isProcessing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Github className="mr-2 h-4 w-4" />
                                    )}
                                    {isProcessing ? "Downloading..." : "Fetch & Convert"}
                                </Button>
                            </form>
                        </div>

                        <div className="relative flex items-center py-2">
                            <div className="grow border-t border-border/20"></div>
                            <span className="shrink-0 px-4 text-xs text-muted-foreground uppercase">
                                Or
                            </span>
                            <div className="grow border-t border-border/20"></div>
                        </div>

                        <div className="rounded-md border border-border/10 bg-card p-6 backdrop-blur">
                            <h2 className="mb-4 text-lg font-medium">From ZIP Upload</h2>
                            <div className="flex flex-col gap-4">
                                <label
                                    htmlFor="zip-upload"
                                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/40 bg-background/50 p-8 transition hover:bg-accent/50"
                                >
                                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                                    <span className="text-sm font-medium text-foreground">
                                        Click to select ZIP file
                                    </span>
                                    <span className="text-xs text-muted-foreground mt-1">
                                        Supports .zip archives
                                    </span>
                                    <input
                                        id="zip-upload"
                                        type="file"
                                        accept=".zip"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                    />
                                </label>
                            </div>
                        </div>
                    </section>

                    <section className="flex flex-col gap-6">
                        {error && (
                            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-6 text-destructive">
                                <h3 className="font-medium">Error</h3>
                                <p className="mt-1 text-sm opacity-90">{error}</p>
                            </div>
                        )}

                        {successData && (
                            <div className="flex flex-col gap-6 rounded-md border border-border/10 bg-card/50 p-6 backdrop-blur animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-lg font-medium text-foreground">
                                            Conversion Complete
                                        </h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {successData.fileName}
                                        </p>
                                    </div>
                                    {downloadUrl && (
                                        <a
                                            href={downloadUrl}
                                            download={successData.fileName}
                                            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        >
                                            <Download className="mr-2 h-4 w-4" />
                                            Download Bundle
                                        </a>
                                    )}
                                </div>

                                <div className="grid grid-cols-3 gap-4 border-y border-border/10 py-6">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold">
                                            {successData.stats.totalFiles}
                                        </div>
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">
                                            Total Files
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-emerald-500">
                                            {successData.stats.includedFiles}
                                        </div>
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">
                                            Included
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-sky-500">
                                            {successData.stats.codeFilesConverted}
                                        </div>
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">
                                            Converted
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    <h4 className="text-sm font-medium text-muted-foreground sticky top-0 bg-card pb-2">
                                        Included Files
                                    </h4>
                                    {successData.files.map((file, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3 rounded bg-background/50 p-2 text-sm"
                                        >
                                            {file.isCode ? (
                                                <Code className="h-4 w-4 text-sky-500 shrink-0" />
                                            ) : (
                                                <FileArchive className="h-4 w-4 text-emerald-500 shrink-0" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium">{file.name}</div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="truncate max-w-[200px] opacity-70">
                                                        {file.path}
                                                    </span>
                                                    {file.isCode && (
                                                        <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-500">
                                                            Converted
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                {Math.round(file.size / 1024)} KB
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!successData && !error && (
                            <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border/20 bg-background/5 p-8 text-center text-muted-foreground">
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background/50">
                                    <FilesIcon className="h-6 w-6 opacity-50" />
                                </div>
                                <h3 className="text-base font-medium">Ready to process</h3>
                                <p className="mt-2 text-sm max-w-xs mx-auto">
                                    Import a repo or ZIP to verify contents before downloading your
                                    NotebookLM bundle.
                                </p>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

function FilesIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
            <path d="M9 18a2 2 0 0 1-2-2" />
            <path d="M9 12h6" />
            <path d="M9 16h6" />
            <path d="M20 22a2 2 0 0 1-2-2" />
            <path d="M9 2v20" />
            <path d="M12 2h3.5L20 6.5V20a2 2 0 0 1-2 2H9" />
        </svg>
    );
}
