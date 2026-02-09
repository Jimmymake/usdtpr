# Docker Setup Guide

This guide explains how to run the USDT Payment Processor using Docker.

## Prerequisites

- Docker installed
- Docker Compose installed
- `.env` file configured (see `.env.example`)

## Quick Start

### 1. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your configuration
```

**Important:** Make sure `PORT=3004` in your `.env` file.

### 2. Build and Run

```bash
# Build and start container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

### 3. Access the API

The API will be available at:
- **Local:** http://localhost:3004
- **Health Check:** http://localhost:3004/health

## Docker Commands

### Build Image

```bash
docker-compose build
```

### Start Container

```bash
docker-compose up -d
```

### Stop Container

```bash
docker-compose down
```

### View Logs

```bash
# All logs
docker-compose logs

# Follow logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail=100
```

### Restart Container

```bash
docker-compose restart
```

### Execute Commands in Container

```bash
# Open shell in container
docker-compose exec usdtpr sh

# Run scripts
docker-compose exec usdtpr npm run verify-address -- --user-id 1
docker-compose exec usdtpr npm run check-balance -- --user-id 1
```

## Configuration

### Port Configuration

The application runs on port **3004** by default. To change:

1. Update `PORT` in `.env`:
   ```env
   PORT=3004
   ```

2. Update `docker-compose.yml`:
   ```yaml
   ports:
     - "3004:3004"  # Change both ports if needed
   ```

### Volume Mounts

The Docker setup mounts:
- `./data` - SQLite database directory (persists data)
- `./.env` - Environment variables (read-only)

### Environment Variables

All environment variables are loaded from `.env` file. See `.env.example` for required variables.

## Health Check

The container includes a health check that monitors the `/health` endpoint:

```bash
# Check container health
docker-compose ps
```

## Data Persistence

The SQLite database is stored in `./data` directory and persists between container restarts.

**Backup database:**
```bash
# Copy database file
cp data/usdtpr.db data/usdtpr.db.backup
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs

# Check if port is already in use
lsof -i :3004
```

### Database errors

```bash
# Ensure data directory exists and is writable
mkdir -p data
chmod 755 data
```

### Environment variables not loading

```bash
# Verify .env file exists
ls -la .env

# Check if variables are set
docker-compose exec usdtpr env | grep PORT
```

### Permission issues

```bash
# Fix data directory permissions
sudo chown -R $USER:$USER data
chmod -R 755 data
```

## Production Deployment

### Security Checklist

1. ✅ Change `JWT_SECRET` to a strong random value
2. ✅ Use strong `HD_MASTER_MNEMONIC` (backup securely)
3. ✅ Secure `MASTER_WALLET_PRIVATE_KEY` (never commit)
4. ✅ Use HTTPS in production (add reverse proxy)
5. ✅ Set proper file permissions
6. ✅ Use Docker secrets for sensitive data

### Using Docker Secrets (Production)

```yaml
services:
  usdtpr:
    secrets:
      - jwt_secret
      - master_wallet_key
      - hd_mnemonic

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  master_wallet_key:
    file: ./secrets/master_wallet_key.txt
  hd_mnemonic:
    file: ./secrets/hd_mnemonic.txt
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development with Docker

### Hot Reload (Development)

For development with auto-reload, modify `docker-compose.yml`:

```yaml
services:
  usdtpr:
    command: npm run dev
    volumes:
      - .:/app  # Mount source code
      - /app/node_modules  # Exclude node_modules
```

## Building Custom Image

```bash
# Build image
docker build -t usdtpr:latest .

# Run container
docker run -d \
  --name usdtpr \
  -p 3004:3004 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  usdtpr:latest
```

## Monitoring

### Check Container Status

```bash
docker-compose ps
```

### View Resource Usage

```bash
docker stats usdtpr
```

### Check Health Endpoint

```bash
curl http://localhost:3004/health
```

## Backup and Restore

### Backup

```bash
# Backup database
docker-compose exec usdtpr cp /app/data/usdtpr.db /app/data/usdtpr.db.backup

# Copy backup to host
docker cp usdtpr:/app/data/usdtpr.db.backup ./backups/
```

### Restore

```bash
# Copy backup to container
docker cp ./backups/usdtpr.db.backup usdtpr:/app/data/usdtpr.db

# Restart container
docker-compose restart
```

## Cleanup

### Remove Container and Volumes

```bash
# Stop and remove container
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Remove Image

```bash
docker rmi usdtpr
```
