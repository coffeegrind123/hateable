# Docker image for self-hosted code execution
FROM node:20-alpine

# Install Python for script execution compatibility
RUN apk add --no-cache python3 py3-pip

# Set working directory
WORKDIR /workspace

# Create user for security
RUN addgroup -g 1001 -S sandbox && \
    adduser -S sandbox -u 1001 -G sandbox

# Install global packages
RUN npm install -g vite@latest @vitejs/plugin-react

# Create directories
RUN mkdir -p /workspace/app && \
    chown -R sandbox:sandbox /workspace

# Switch to sandbox user
USER sandbox

# Expose port for Vite dev server
EXPOSE 5173

# Keep container running
CMD ["tail", "-f", "/dev/null"]