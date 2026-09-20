import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/catalog")({
  server: {
    handlers: {
      GET: async () => {
        const { catalog } = await import("../../../server/lib/api");
        const { cfg, features } = await import("../../../server/lib/config");
        const { piperAvailable } = await import("../../../server/lib/tts");
        const { sttMode } = await import("../../../server/lib/listener");
        const { provider } = await import("../../../server/lib/llm");
        return Response.json({ ...catalog(), mode: cfg.mode, features: { ...features(), piper: piperAvailable(), stt: sttMode(), llm: await provider() } });
      },
    },
  },
});
