import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("hackernews", "routes/hackernews.tsx"),
	route("llmstxt", "routes/llmstxt.tsx"),
] satisfies RouteConfig;
