export type ActionData =
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

export type FeedEntry = {
	id: string;
	title: string;
	url: string;
	publishedAt: string | null;
	textContent: string;
};

export type LLMsTxtLink = {
	title: string;
	url: string;
	description: string | null;
};

export type LLMsTxtActionData =
	| { ok: false; error: string; requiresGeneration?: boolean }
	| {
		ok: true;
		source: "llms-full.txt" | "llms.txt" | "generated";
		site: {
			url: string;
			hostname: string;
			llmsTxtUrl: string | null;
		};
		llmsTxt: {
			title: string;
			description: string | null;
			content: string;
			links: LLMsTxtLink[];
		};
		fetchedLinks: Array<{
			title: string;
			url: string;
			content: string | null;
			error: string | null;
		}> | null;
		download: {
			contentBase64: string;
			fileName: string;
			wordCount: number;
		};
		noFullTxt?: boolean;
		generated?: {
			llmsTxt: string;
			processedCount: number;
		};
	};

export type RepoFile = {
	path: string;
	name: string;
	originalExtension: string;
	convertedName: string;
	size: number;
	isCode: boolean;
};

export type GitHubActionData =
	| { ok: false; error: string }
	| {
		ok: true;
		source: "github" | "upload";
		repo?: { owner: string; name: string; url: string };
		archiveBase64: string;
		fileName: string;
		stats: {
			totalFiles: number;
			includedFiles: number;
			codeFilesConverted: number;
		};
		files: RepoFile[];
	};
