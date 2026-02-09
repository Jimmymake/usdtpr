#!/bin/bash
# Script to ensure Docker and containers start on boot

# Enable Docker to start on boot
sudo systemctl enable docker

# Start Docker if not running
sudo systemctl start docker

# Start containers
cd "$(dirname "$0")"
docker-compose up -d

echo "✅ Docker containers started and configured to auto-start on boot"
