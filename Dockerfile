# Multi-stage build for Open Lovable with Firecrawl
FROM node:20-slim AS base

# Enable corepack for pnpm
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install latest pnpm
RUN corepack install -g pnpm@10.14.0

# Copy configuration files
COPY package.json pnpm-lock.yaml* .npmrc ./

# Install dependencies using pnpm and allow build scripts
RUN if [ -f pnpm-lock.yaml ]; then \
  pnpm install --frozen-lockfile --prod=false; \
else \
  pnpm install; \
fi

# Ensure critters is available for production builds
RUN pnpm add critters@^0.0.24

# Install firecrawl-simple submodule dependencies
COPY firecrawl-simple/apps/api/package.json firecrawl-simple/apps/api/pnpm-lock.yaml* ./firecrawl-simple/apps/api/
WORKDIR /app/firecrawl-simple/apps/api
RUN if [ -f pnpm-lock.yaml ]; then \
  pnpm install --frozen-lockfile --prod=false; \
else \
  pnpm install; \
fi
WORKDIR /app

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Enable corepack and install pnpm
RUN corepack enable && corepack install -g pnpm@10.14.0

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/firecrawl-simple/apps/api/node_modules ./firecrawl-simple/apps/api/node_modules
COPY . .

# Rebuild native modules for the current platform
RUN pnpm rebuild

# Set environment variables for production build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application for production
ENV NODE_OPTIONS="--max-old-space-size=32768"
ENV NEXT_DISABLE_TRACE=1
RUN pnpm run build:prod

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