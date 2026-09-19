import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/drills/$drillId/end")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { endDrill } = await import("../../../server/lib/api");
        const d = await endDrill(params.drillId);
        return d ? Response.json(d) : Response.json({ error: "not found" }, { status: 404 });
      },
    },
  },
});
