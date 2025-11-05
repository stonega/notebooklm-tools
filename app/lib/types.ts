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
