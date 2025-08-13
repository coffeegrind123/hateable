# Multi-stage build for Open Lovable with Firecrawl
FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies based on the preferred package manager
# Remove pnpm lockfile to avoid conflicts with npm
COPY package.json package-lock.json* ./
RUN rm -f pnpm-lock.yaml
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Install firecrawl-simple submodule dependencies
COPY firecrawl-simple/apps/api/package.json ./firecrawl-simple/apps/api/
WORKDIR /app/firecrawl-simple/apps/api
RUN npm install
WORKDIR /app

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/firecrawl-simple/apps/api/node_modules ./firecrawl-simple/apps/api/node_modules
COPY . .
# Remove pnpm lockfile to avoid conflicts with npm
RUN rm -f pnpm-lock.yaml
# Rebuild native modules for the current platform
RUN npm rebuild
# Explicitly reinstall native dependencies to ensure native binaries are present
RUN npm install lightningcss @tailwindcss/oxide --force

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

# Copy the public folder
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create sandboxes directory
RUN mkdir -p /app/sandboxes && chown nextjs:nodejs /app/sandboxes
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
EXPOSE 5173

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]