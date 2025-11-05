import { TipCard } from "./TipCard";

export function WhyNotebookLMSources({
	keepCurrentDescription,
}: {
	keepCurrentDescription: string;
}) {
	return (
		<aside className="flex h-full flex-col gap-4 rounded-lg border border-border/10 bg-card p-6 text-sm backdrop-blur">
			<h2 className="text-lg font-semibold">Why NotebookLM sources?</h2>
			<p>
				NotebookLM works best when each source is concise, clean, and richly
				annotated. This tool handles the tedious parts so you can focus on the
				conversation.
			</p>
			<div className="space-y-3">
				<TipCard
					title="Keep things current"
					description={keepCurrentDescription}
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
			<span className="mt-auto text-xs">
				Looking for other formats? More NotebookLM tools are on the way.
			</span>
		</aside>
	);
}
