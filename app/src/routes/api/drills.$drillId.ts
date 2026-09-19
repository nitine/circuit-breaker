import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/drills/$drillId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getDrill } = await import("../../../server/lib/api");
        const d = await getDrill(params.drillId);
        return d ? Response.json(d) : Response.json({ error: "not found" }, { status: 404 });
      },
    },
  },
});
