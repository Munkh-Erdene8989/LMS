# API (apps/api) — Railway. Repo root-оос build хийнэ: `railway.json` → build.dockerfilePath.
# Нэг шатлал: `prisma migrate deploy` (pre-deploy) Prisma CLI (devDependency) шаарддаг тул dev deps-ийг үлдээнэ.
FROM node:22-bookworm-slim

# Prisma engine openssl шаарддаг
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY . .

# Зөвхөн API болон түүний хамаарлууд (web-ийн next, sentry-г суулгахгүй)
RUN pnpm install --frozen-lockfile --filter "@lms/api..."
# shared → db (prisma generate) → api (tsc → apps/api/dist)
RUN pnpm --filter "@lms/api..." run build

ENV NODE_ENV=production
# apps/api/assets (сертификатын фонт) нь dist/../assets замаар уншигддаг — хамт хуулагдсан.
WORKDIR /app/apps/api
# Railway PORT-г өгнө (env.ts уншина)
CMD ["node", "dist/main.js"]
