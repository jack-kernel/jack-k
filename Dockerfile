FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages
COPY tooling ./tooling
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim
RUN corepack enable && useradd --create-home --uid 10001 jack
WORKDIR /app
COPY --from=build --chown=jack:jack /app /app
COPY --chown=jack:jack repos.yaml /app/repos.yaml
USER jack
CMD ["pnpm", "--filter", "@jack-k/gateway", "start"]
