# Docker Setup and Troubleshooting Guide for Open Lovable

## Quick Start

1. **Make the setup script executable and run full setup:**
   ```bash
   chmod +x docker-setup.sh
   ./docker-setup.sh full
   ```

2. **Access the application:**
   - Open Lovable: http://localhost:3001
   - Firecrawl API: http://localhost:3002
   - Vite Dev Server: http://localhost:5173

## Docker Environment Setup

### Prerequisites

1. **Docker Installation**
   - **Linux/WSL2:** Follow [Docker Engine installation](https://docs.docker.com/engine/install/)
   - **Windows/Mac:** Install [Docker Desktop](https://docs.docker.com/desktop/)

2. **WSL2 Specific Setup**
   ```bash
   # Ensure Docker Desktop WSL2 integration is enabled
   # In Docker Desktop: Settings > Resources > WSL Integration
   ```

3. **Permission Issues (Linux)**
   ```bash
   # Add user to docker group
   sudo usermod -aG docker $USER
   newgrp docker
   ```

## Common Issues and Solutions

### 1. "Docker daemon not accessible"

**Problem:** `permission denied while trying to connect to the Docker daemon socket`

**Solutions:**
- **WSL2:** Start Docker Desktop on Windows
- **Linux:** Start Docker daemon: `sudo systemctl start docker`
- **Permission:** Add user to docker group (see above)

### 2. "Command not found: docker-compose"

**Problem:** Using old `docker-compose` vs new `docker compose`

**Solution:**
```bash
# Use the modern syntax (included in Docker Desktop and recent Docker installations)
docker compose up -d

# If you have the standalone docker-compose installed:
docker-compose up -d
```

### 3. Build Failures

**Problem:** Services fail to build

**Common causes and solutions:**

#### Node.js Build Issues
```bash
# Clear npm cache and rebuild
docker compose build --no-cache app

# Check Node.js version in Dockerfile (should be compatible)
# Current Dockerfile uses node:20-slim
```

#### Python/Pydoll Service Issues
```bash
# Check Python dependencies
docker compose build --no-cache pydoll-service

# View build logs
docker compose build --progress=plain pydoll-service
```

#### Missing Dependencies
```bash
# Ensure all required files are present
ls -la firecrawl-simple/apps/api/
ls -la firecrawl-simple/apps/pydoll-service/
```

### 4. Services Not Starting

**Problem:** `docker compose up` fails or services crash

**Debugging steps:**

```bash
# Check service status
./docker-setup.sh status

# View logs for specific service
./docker-setup.sh logs app
./docker-setup.sh logs firecrawl-api
./docker-setup.sh logs pydoll-service

# Check container exit codes
docker compose ps -a
```

**Common fixes:**

#### Port Conflicts
```bash
# Check if ports are already in use
sudo netstat -tulpn | grep :3001
sudo netstat -tulpn | grep :3002

# Change ports in docker-compose.yml if needed
```

#### Memory Issues
```bash
# Check available memory
free -h

# Reduce worker count in .env
NUM_WORKERS_PER_QUEUE=4
MAX_CONCURRENCY=5
```

#### Environment Variables
```bash
# Ensure .env file exists and is properly configured
cat .env

# Required variables should be set (script creates defaults)
```

### 5. Service Health Check Failures

**Problem:** Services start but don't respond to health checks

**Debugging:**

```bash
# Manual health checks
curl -v http://localhost:3001
curl -v http://localhost:3002/v1/health

# Check Redis
docker compose exec firecrawl-redis redis-cli ping

# Check service logs
./docker-setup.sh logs app
```

**Common issues:**
- Services taking longer than expected to start (increase timeout in script)
- Missing environment variables
- Database connection issues
- Network connectivity problems

### 6. Network Issues

**Problem:** Services can't communicate with each other

**Solutions:**
```bash
# Recreate networks
docker compose down
docker network prune -f
docker compose up -d

# Check network configuration
docker network ls
docker network inspect open-lovable_lovable-network
```

### 7. Volume/Data Persistence Issues

**Problem:** Data not persisting between container restarts

**Check volume mounts:**
```bash
# Verify volume mounts
docker compose config

# Check local directories
ls -la ./sandboxes/
ls -la ./data/
ls -la ./firecrawl-simple/
```

## Monitoring and Maintenance

### Real-time Monitoring
```bash
# Monitor all services
./docker-setup.sh logs

# Monitor specific service
./docker-setup.sh logs firecrawl-api

# Check resource usage
docker stats

# Service status
./docker-setup.sh status
```

### Performance Tuning

1. **Memory Optimization**
   ```env
   # In .env file
   MAX_RAM=0.8
   MAX_CPU=0.8
   NUM_WORKERS_PER_QUEUE=6
   MAX_CONCURRENCY=8
   ```

2. **Docker Resource Limits**
   ```yaml
   # Add to docker-compose.yml services
   deploy:
     resources:
       limits:
         memory: 1G
         cpus: '0.5'
   ```

### Cleanup and Maintenance
```bash
# Stop and clean up everything
./docker-setup.sh cleanup

# Remove unused Docker resources
docker system prune -a

# Clean up volumes (WARNING: removes data)
docker volume prune
```

## Development Workflow

### Making Changes
```bash
# Rebuild specific service after code changes
docker compose build app
docker compose up -d app

# View logs during development
./docker-setup.sh logs app
```

### Debugging Inside Containers
```bash
# Access running container shell
docker compose exec app bash
docker compose exec firecrawl-api bash

# Check container environment
docker compose exec app env
```

## Production Considerations

### Security
1. Change default passwords in `.env`
2. Use proper secrets management
3. Enable firewall rules for exposed ports
4. Regular security updates

### Backup
```bash
# Backup persistent data
tar -czf backup-$(date +%Y%m%d).tar.gz ./data ./sandboxes

# Backup configuration
cp .env .env.backup
cp docker-compose.yml docker-compose.yml.backup
```

### Logging
```bash
# Configure log rotation
# Add to docker-compose.yml services:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Emergency Recovery

### Complete Reset
```bash
# Stop everything
docker compose down -v

# Remove all containers and images
docker system prune -a

# Rebuild from scratch
./docker-setup.sh full
```

### Service-specific Recovery
```bash
# Reset specific service
docker compose stop firecrawl-api
docker compose rm -f firecrawl-api
docker compose build --no-cache firecrawl-api
docker compose up -d firecrawl-api
```

## Getting Help

1. **Check service logs first:**
   ```bash
   ./docker-setup.sh logs
   ```

2. **Verify service health:**
   ```bash
   ./docker-setup.sh health
   ```

3. **Check system resources:**
   ```bash
   docker stats
   df -h
   free -h
   ```

4. **Common log locations inside containers:**
   - App logs: `/app/.next/`
   - API logs: `/app/logs/`
   - System logs: `/var/log/`

## Script Commands Reference

- `./docker-setup.sh setup` - Initial setup only
- `./docker-setup.sh build` - Build services only  
- `./docker-setup.sh start` - Start services only
- `./docker-setup.sh stop` - Stop services
- `./docker-setup.sh restart` - Restart services
- `./docker-setup.sh status` - Show service status
- `./docker-setup.sh logs [service]` - Show logs
- `./docker-setup.sh health` - Health check
- `./docker-setup.sh cleanup` - Full cleanup
- `./docker-setup.sh full` - Complete setup and start