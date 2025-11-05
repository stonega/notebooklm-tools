import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "./ui/accordion";

export function TipCard({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<Accordion type="single" collapsible className="w-full">
			<AccordionItem value={title}>
				<AccordionTrigger>{title}</AccordionTrigger>
				<AccordionContent>{description}</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
