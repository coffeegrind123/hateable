# Production Deployment Guide

This guide covers deploying Open Hateable in production with optimized performance and security.

## 🚀 Quick Production Deployment

### Method 1: One-Command Deploy
```bash
./build-prod.sh
docker-compose -f docker-compose.prod.yml up -d
```

### Method 2: Manual Steps
```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Build for production
pnpm run build

# 3. Deploy with Docker
docker-compose -f docker-compose.prod.yml up -d
```

## 📋 Production Checklist

### Prerequisites
- [x] **Node.js 20.18.0+** - Use `.nvmrc` for version management
- [x] **pnpm 10.14.0+** - Package manager with workspace support
- [x] **Docker & Docker Compose** - Container orchestration
- [x] **4GB+ RAM** - Recommended for optimal performance
- [x] **2+ CPU cores** - For concurrent request handling

### Build Script Configuration
The project is configured to allow build scripts for essential dependencies:
- **@tailwindcss/oxide** - CSS optimization
- **sharp** - Image processing
- **unrs-resolver** - Module resolution
- **lightningcss** - CSS processing
- **critters** - CSS inlining

This is handled automatically via `.npmrc` configuration.

### Environment Setup
1. **Copy environment file:**
   ```bash
   cp .env.example .env.production
   ```

2. **Configure production variables:**
   ```env
   NODE_ENV=production
   NEXT_TELEMETRY_DISABLED=1
   NODE_OPTIONS="--max-old-space-size=4096"
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   ```

## 🏗️ Production Build Features

### Performance Optimizations
- **Standalone Output**: Optimized Docker builds with minimal image size
- **Bundle Optimization**: Tree shaking, dead code elimination, compression
- **Image Optimization**: AVIF/WebP formats with optimized caching
- **Static Asset Caching**: 1-year cache for static resources
- **Webpack Optimizations**: Production-specific bundling optimizations

### Security Headers
- **Content Security**: X-Content-Type-Options, X-Frame-Options
- **XSS Protection**: X-XSS-Protection headers
- **Referrer Policy**: Controlled referrer information
- **Cache Control**: Secure API endpoint caching

### Resource Management
- **Memory Limits**: 4GB maximum, 2GB reservation
- **CPU Limits**: 2.0 cores maximum, 1.0 core reservation
- **Health Checks**: Automatic service recovery
- **Log Rotation**: 10MB max log files, 3 file retention

## 🐳 Docker Configuration

### Production Dockerfile Features
- **Multi-stage builds** for minimal image size
- **pnpm 10.14.0** with corepack integration
- **Security**: Non-root user execution
- **Optimization**: Frozen lockfiles, production dependencies only
- **Native modules**: Proper rebuilding for target platform

### Docker Compose Services
```yaml
services:
  app:              # Main Open Hateable application
  firecrawl-api:    # Web scraping API
  pydoll-service:   # Python service for advanced scraping  
  puppeteer-service: # Browser automation service
```

## 📊 Monitoring & Health Checks

### Service Health Endpoints
- **Main App**: `GET /api/test-endpoint`
- **Firecrawl API**: `GET /v1/health`
- **Services**: `GET /health`

### Resource Monitoring
```bash
# View service status
docker-compose -f docker-compose.prod.yml ps

# Check resource usage
docker stats

# View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

## 🔧 Performance Tuning

### Bundle Analysis
```bash
pnpm run build:analyze
```
Opens webpack bundle analyzer to identify optimization opportunities.

### Memory Optimization
- **Node.js heap**: 4GB allocation via NODE_OPTIONS
- **Docker limits**: Configured per service based on usage
- **Next.js optimization**: Standalone output reduces memory footprint

### Caching Strategy
- **Static Assets**: 1 year cache with immutable headers
- **API Routes**: No-cache for dynamic content
- **Images**: 30-day minimum cache with optimal formats

## 🔐 Security Considerations

### Production Security
- **Environment Secrets**: Use Docker secrets or external secret management
- **Network Isolation**: Services communicate via internal Docker network
- **User Permissions**: Non-root container execution
- **Resource Limits**: Prevent resource exhaustion attacks

### Recommended Additional Security
```yaml
# Add to docker-compose.prod.yml
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp
  - /var/cache
```

## 🚀 Deployment Scenarios

### Single Server Deployment
```bash
# Standard deployment
docker-compose -f docker-compose.prod.yml up -d
```

### Load Balanced Deployment
```bash
# Scale main application
docker-compose -f docker-compose.prod.yml up -d --scale app=3
```

### External Database
```yaml
# Add external services
external_links:
  - postgres:database
  - redis:cache
```

## 🛠️ Maintenance

### Updates
```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Backup
```bash
# Backup data volumes
docker cp $(docker-compose ps -q app):/app/sandboxes ./backup/sandboxes
docker cp $(docker-compose ps -q app):/app/data ./backup/data
```

### Troubleshooting
```bash
# View application logs
docker-compose -f docker-compose.prod.yml logs app

# Enter container for debugging
docker-compose -f docker-compose.prod.yml exec app sh

# Check health status
curl http://localhost:3000/api/test-endpoint
```

## 📈 Scaling

### Horizontal Scaling
- Use load balancer (nginx, HAProxy)
- Scale app service with `--scale app=N`
- Configure session affinity for sandboxes

### Vertical Scaling
- Increase Docker resource limits
- Adjust NODE_OPTIONS memory allocation
- Monitor with `docker stats`

## 🎯 Production Tips

1. **Monitor Resource Usage**: Set up alerts for memory/CPU usage
2. **Log Aggregation**: Consider ELK stack or similar for centralized logging
3. **SSL/TLS**: Use reverse proxy (nginx) for HTTPS termination
4. **Backup Strategy**: Regular backups of sandbox and data volumes
5. **Update Schedule**: Plan regular updates for security patches

This production setup provides a robust, scalable, and secure deployment of Open Hateable with comprehensive monitoring and optimization features.