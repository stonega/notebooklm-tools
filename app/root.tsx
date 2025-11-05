import {
	isRouteErrorResponse,
	Links,
	Meta,
	NavLink,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { ThemeProvider } from "./components/theme-provider";
import { ThemeSwitch } from "./components/theme-switch";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return (
		<ThemeProvider defaultTheme="light">
			<Header />
			<Outlet />
		</ThemeProvider>
	);
}

function Header() {
	return (
		<header className="backdrop-blur-lg sticky top-0 z-50 border-b">
			<nav className="mx-auto flex max-w-5xl items-center justify-between p-4">
				<div className="flex items-center gap-4">
					<NavLink
						to="/"
						className={({ isActive }) =>
							`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
								isActive
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`
						}
					>
						RSS
					</NavLink>
					<NavLink
						to="/hackernews"
						className={({ isActive }) =>
							`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
								isActive
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`
						}
					>
						Hacker News
					</NavLink>
				</div>
				<ThemeSwitch />
			</nav>
		</header>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
