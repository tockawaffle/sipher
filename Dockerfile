FROM node:22

WORKDIR /app

# ---- Bun ----
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# ---- dependencies ----
# Copy lockfile first so this layer is only rebuilt when deps change.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Some packages ship pre-built native binaries via a post-install download script.
# Run it here so the layer is cached and not re-downloaded on every code change.
RUN bun run build:matrix || true

# ---- source ----
COPY . .

# Never bake secrets into the image; env vars come from Docker Compose or the host.
RUN rm -f .env.local

EXPOSE 3000

# Bun runs TypeScript natively — no separate tsx invocation needed.
CMD ["bun", "run", "src/server.ts"]
