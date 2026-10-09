import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/actions.json")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } }),
      GET: async () =>
        Response.json(
          { rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }] },
          { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } },
        ),
    },
  },
});
