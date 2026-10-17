# ledgr — build the whole monorepo and run the dashboard for a mounted project.
#   docker build -t ledgr .
#   docker run -p 4848:4848 -v "$PWD/.ledgr:/project/.ledgr" ledgr
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++ && corepack enable
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
RUN corepack enable
WORKDIR /src
COPY --from=build /src ./
RUN pnpm prune --prod || true
ENV NODE_ENV=production
WORKDIR /project
EXPOSE 4848
ENTRYPOINT ["node", "/src/packages/cli/dist/index.js"]
CMD ["start", "--host", "0.0.0.0", "--port", "4848"]
