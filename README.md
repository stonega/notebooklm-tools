# NotebookLM Tools

A collection of tools to generate ready-to-import source bundles for Google's NotebookLM from various web content.

---

## Tools

This repository currently includes three source builders:

1.  **RSS Feed Source Builder**: `(/)` Converts any public RSS feed into a NotebookLM source bundle. It fetches the latest entries, extracts the content provided in the feed, and packages it into a downloadable `.zip` file.
2.  **Hacker News Source Builder**: `(/hackernews)` A specialized tool that fetches the top stories from the Hacker News front page, extracts the full article content from each link, and creates a comprehensive NotebookLM source bundle.
3.  **LLMs.txt Fetcher**: `(/llmstxt)` Fetches or generates [llms.txt](https://llmstxt.org/) files from documentation sites. This tool provides LLM-friendly content that can be used as context for AI applications.

## Features

-   **One-Click Conversion**: Simple interface to turn web content into NotebookLM sources.
-   **Clean Content Extraction**: Uses `@mozilla/readability` to get the core content from articles, removing boilerplate and ads.
-   **Structured Output**: Generates a `.zip` bundle with a `manifest.json`, `sources.json`, and individual Markdown files for each entry, following the NotebookLM source bundle specification.
-   **Metadata Preservation**: Includes metadata like title, URL, and publication date in the generated sources.
-   **LLMs.txt Support**: Fetch existing `llms-full.txt` or `llms.txt` files, or generate them using Firecrawl and OpenRouter APIs.
-   **Modern Tech Stack**: Built with React, TypeScript, Vite, and Tailwind CSS.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or newer recommended)
-   [bun](https://bun.sh/)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/<YOUR_GH_USERNAME>/notebooklm-tools.git
    cd notebooklm-tools
    ```

2.  Install the dependencies:
    ```bash
    bun install
    ```

### Development

Start the development server:

```bash
bun run dev
```

Your application will be available at `http://localhost:5173`.

## Configuration

Set the canonical site URL so generated SEO metadata (canonical links, Open Graph tags, JSON-LD) point to the correct domain:

1. Create a `.env` file at the project root if it does not exist yet.
2. Add the environment variable with your production hostname (no trailing slash):

   ```bash
   VITE_SITE_URL=https://your-domain.example
   ```

3. Restart the dev server after updating the value.

## Building for Production

Create a production-ready build:

```bash
bun run build
```

You can then run the server with:
```bash
bun start
```

## LLMs.txt Fetcher

The LLMs.txt Fetcher tool (`/llmstxt`) helps you obtain LLM-friendly documentation from any website.

### How It Works

1. **Checks for `/llms-full.txt`** - First looks for the full documentation file at the site root
2. **Falls back to `/llms.txt`** - If full version not found, checks for the standard llms.txt
3. **Generates content** - If neither exists, can generate using external APIs

### Generation Mode

If no llms.txt files are found on the target site, you can generate one by providing:

- **[Firecrawl API Key](https://firecrawl.dev/)** - Used to map and scrape website URLs
- **[OpenRouter API Key](https://openrouter.ai/)** - Used to generate titles and descriptions with AI (uses `gpt-4o-mini`)

The generator will:
1. Map all URLs on the website (up to 50 pages)
2. Scrape each page for its markdown content
3. Generate concise titles and descriptions using AI
4. Compile everything into a downloadable text file

### What is llms.txt?

[llms.txt](https://llmstxt.org/) is a proposed standard for websites to provide LLM-friendly content. It's a markdown file at `/llms.txt` that contains:
- A title and description of the site
- Links to additional documentation pages
- Structured content optimized for LLM consumption

## Tech Stack

-   **Framework**: [React](https://react.dev/) with [React Router](https://reactrouter.com/)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
-   **Backend/Server-side Logic**:
    -   `rss-parser` for parsing RSS feeds.
    -   `@mozilla/readability` and `jsdom` for article content extraction.
    -   `jszip` for creating `.zip` archives.
    -   [Firecrawl](https://firecrawl.dev/) for website scraping (optional, for llms.txt generation).
    -   [OpenRouter](https://openrouter.ai/) for AI-powered content generation (optional, for llms.txt generation).

## Contributing

Contributions are welcome! If you have an idea for a new source builder or want to improve an existing one, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
