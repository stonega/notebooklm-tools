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
	| { ok: false; error: string }
	| {
			ok: true;
			site: {
				url: string;
				hostname: string;
				llmsTxtUrl: string;
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
	  };
