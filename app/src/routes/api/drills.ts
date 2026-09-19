import { createFileRoute } from "@tanstack/react-router";
import type { CreateDrillBody } from "~/shared/types";

export const Route = createFileRoute("/api/drills")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { createDrill } = await import("../../../server/lib/api");
        try {
          const body = (await request.json()) as CreateDrillBody;
          const drill = await createDrill(body);
          return Response.json(drill);
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
