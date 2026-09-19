import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/drills/$drillId/debrief")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getDebrief } = await import("../../../server/lib/api");
        const d = await getDebrief(params.drillId);
        return d ? Response.json(d) : Response.json({ error: "not found" }, { status: 404 });
      },
    },
  },
});
