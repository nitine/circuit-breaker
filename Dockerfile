# Circuit Breaker — TanStack Start app on Nitro (node-server preset)
FROM node:22-alpine AS build
WORKDIR /repo
COPY corpus ./corpus
COPY app/package.json app/package-lock.json* ./app/
WORKDIR /repo/app
RUN npm ci --no-audit --no-fund
COPY app ./
RUN npx vite build

FROM node:22-alpine AS run
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /repo/app
COPY --from=build /repo/app/.output ./.output
# The page and document templates are read from disk at runtime (corpus/ui/*.html); the playbooks are bundled.
COPY --from=build /repo/corpus /repo/corpus
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
