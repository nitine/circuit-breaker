import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/drills/$drillId/packet")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getPacket } = await import("../../../server/lib/api");
        const md = await getPacket(params.drillId);
        if (!md) return new Response("not found", { status: 404 });
        return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="circuit-breaker-1930-${params.drillId}.md"` } });
      },
    },
  },
});
