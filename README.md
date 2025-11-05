# NotebookLM Tools

A collection of open-source tools to generate ready-to-import source bundles for Google's NotebookLM from various web content.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F<YOUR_GH_USERNAME>%2Fnotebooklm-tools)

---

## Tools

This repository currently includes two source builders:

1.  **RSS Feed Source Builder**: `(/)` Converts any public RSS feed into a NotebookLM source bundle. It fetches the latest entries, extracts the content provided in the feed, and packages it into a downloadable `.zip` file.
2.  **Hacker News Source Builder**: `(/hackernews)` A specialized tool that fetches the top stories from the Hacker News front page, extracts the full article content from each link, and creates a comprehensive NotebookLM source bundle.

## Features

-   **One-Click Conversion**: Simple interface to turn web content into NotebookLM sources.
-   **Clean Content Extraction**: Uses `@mozilla/readability` to get the core content from articles, removing boilerplate and ads.
-   **Structured Output**: Generates a `.zip` bundle with a `manifest.json`, `sources.json`, and individual Markdown files for each entry, following the NotebookLM source bundle specification.
-   **Metadata Preservation**: Includes metadata like title, URL, and publication date in the generated sources.
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

## Building for Production

Create a production-ready build:

```bash
bun run build
```

You can then run the server with:
```bash
bun start
```

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

## Contributing

Contributions are welcome! If you have an idea for a new source builder or want to improve an existing one, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
