FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Enable corepack and install the latest pnpm
RUN corepack enable
RUN corepack install -g pnpm@10.15.0
RUN corepack use pnpm@10.15.0
RUN pnpm --version

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (generate lockfile if needed)
RUN pnpm install

# Copy source code
COPY . .

# Create sandboxes directory with proper permissions
RUN mkdir -p /app/sandboxes && chmod 755 /app/sandboxes

# Expose port for API
EXPOSE 3004

# Start the sandbox service
CMD ["pnpm", "start"]