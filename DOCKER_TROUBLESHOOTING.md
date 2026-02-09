# Docker Troubleshooting Guide

## Common Issues and Solutions

### 1. Permission Denied Error

**Error:**
```
permission denied while trying to connect to the Docker daemon socket
```

**Solution:**

```bash
# Option A: Use sudo (quick fix)
sudo docker-compose build
sudo docker-compose up -d

# Option B: Add user to docker group (permanent fix)
sudo usermod -aG docker $USER
# Then logout and login again, or run:
newgrp docker

# Verify it works
docker ps
```

### 2. Network Timeout (Can't Pull Image)

**Error:**
```
dial tcp: i/o timeout
failed to resolve source metadata
```

**Solutions:**

**Option A: Check Internet Connection**
```bash
# Test connectivity
ping registry-1.docker.io
curl -I https://registry-1.docker.io
```

**Option B: Use Docker Mirror/Proxy**
```bash
# Create/edit /etc/docker/daemon.json
sudo nano /etc/docker/daemon.json

# Add mirror configuration
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}

# Restart Docker
sudo systemctl restart docker
```

**Option C: Use Alternative Base Image**
```bash
# Build with slim image instead of alpine
docker build -f Dockerfile.alternative -t usdtpr .
```

**Option D: Pull Image Manually First**
```bash
# Pull image separately
docker pull node:20-alpine

# Then build
docker-compose build
```

### 3. Build Dependencies Missing

**Error:**
```
better-sqlite3: command failed
Python is not set
```

**Solution:** Already fixed in Dockerfile - uses Node 20 with build tools.

### 4. Port Already in Use

**Error:**
```
Bind for 0.0.0.0:3004 failed: port is already allocated
```

**Solution:**
```bash
# Check what's using port 3004
sudo lsof -i :3004
# or
sudo netstat -tulpn | grep 3004

# Stop the process or change port in docker-compose.yml
```

### 5. Container Won't Start

**Check logs:**
```bash
docker-compose logs
docker-compose logs -f usdtpr
```

**Common causes:**
- Missing .env file
- Database directory permissions
- Invalid environment variables

### 6. Database Permission Issues

**Error:**
```
SQLITE_CANTOPEN: unable to open database file
```

**Solution:**
```bash
# Fix data directory permissions
mkdir -p data
chmod 755 data
sudo chown -R $USER:$USER data
```

## Quick Fixes

### Complete Reset

```bash
# Stop and remove everything
docker-compose down -v

# Remove image
docker rmi usdtpr

# Rebuild from scratch
docker-compose build --no-cache

# Start fresh
docker-compose up -d
```

### Check Docker Status

```bash
# Check Docker is running
sudo systemctl status docker

# Start Docker if not running
sudo systemctl start docker

# Enable Docker on boot
sudo systemctl enable docker
```

### Test Docker Setup

```bash
# Test Docker works
docker run hello-world

# Test docker-compose works
docker-compose --version
```

## Alternative: Run Without Docker

If Docker continues to have issues, you can run directly:

```bash
# Install dependencies
npm install

# Start server
npm start
# or
npm run dev
```

The application will run on port 3004 (as configured in .env).
