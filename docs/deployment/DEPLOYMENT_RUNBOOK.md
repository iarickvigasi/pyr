# PYR Production Deployment Runbook

This runbook provides step-by-step instructions for deploying the Puppy Yoga Retreat platform to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First-Time Deployment](#first-time-deployment)
3. [Regular Deployments](#regular-deployments)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting](#troubleshooting)
6. [Post-Deployment Verification](#post-deployment-verification)

---

## Prerequisites

### Required Access

- SSH access to Hetzner production server
- `sudo` privileges on the server
- Git repository access (GitHub)
- Access to production secrets (password manager)

### Required Tools (Local Machine)

```bash
# Verify you have these installed
git --version          # Git 2.30+
docker --version       # Docker 24.0+
ssh -V                 # OpenSSH 8.0+
```

### Required Tools (Production Server)

```bash
# Should be pre-installed during initial setup
docker --version
docker compose version
git --version
```

---

## First-Time Deployment

This is for deploying to a fresh server for the very first time.

### Step 1: Server Setup

```bash
# SSH into the production server
ssh root@YOUR_SERVER_IP

# Update system packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify installations
docker --version
docker compose version

# Create application user
adduser --system --group pyr
usermod -aG docker pyr

# Create application directory
mkdir -p /opt/pyr
chown pyr:pyr /opt/pyr
```

### Step 2: Clone Repository

```bash
# Switch to application user
su - pyr

# Clone repository
cd /opt/pyr
git clone https://github.com/YOUR_ORG/PYR.git .

# Checkout main branch
git checkout main
```

### Step 3: Configure Secrets

```bash
# Create secrets directory
mkdir -p /opt/pyr/secrets

# Generate database password
openssl rand -base64 32 | tr -d '\n' > /opt/pyr/secrets/db_password.txt

# Generate Redis password
openssl rand -base64 32 | tr -d '\n' > /opt/pyr/secrets/redis_password.txt

# Secure the files
chmod 600 /opt/pyr/secrets/*.txt

# Verify secrets were created
ls -la /opt/pyr/secrets/
```

### Step 4: Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit environment variables
nano .env
```

**Critical variables to configure:**

```bash
# ── App ──────────────────────────────────────────────────────
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=https://app.puppyyogaretreat.com
LOG_LEVEL=info

# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://pyr:$(cat /opt/pyr/secrets/db_password.txt)@postgres:5432/pyr
REDIS_URL=redis://:$(cat /opt/pyr/secrets/redis_password.txt)@redis:6379

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET=<GENERATE_64_CHAR_SECRET>
API_KEY=<GENERATE_32_CHAR_SECRET>

# ── Email (GMX) ─────────────────────────────────────────────
EMAIL_USER=puppyyogaretreat@gmx.de
EMAIL_PASS=<GMX_PASSWORD>

# ── AI ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY=<ANTHROPIC_KEY>
OPENAI_API_KEY=<OPENAI_KEY>

# ── Apple Calendar (CalDAV) ──────────────────────────────────
CALDAV_URL=<ICLOUD_CALDAV_URL>
CALDAV_USER=<APPLE_ID>
CALDAV_PASS=<APP_SPECIFIC_PASSWORD>

# ── Telegram (AI Assistant) ─────────────────────────────────
TELEGRAM_BOT_TOKEN=<BOT_TOKEN>
TELEGRAM_ALLOWED_USER_ID=<INES_TELEGRAM_ID>

# ── Frontend ───────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.puppyyogaretreat.com
```

**Generate secrets:**

```bash
# JWT_SECRET (64 characters)
openssl rand -base64 48

# API_KEY (32 characters)
openssl rand -base64 24
```

### Step 5: Initialize Database

```bash
# Start database and Redis only
docker compose -f docker-compose.prod.yml up -d postgres redis

# Wait for database to be ready (check health)
docker compose -f docker-compose.prod.yml ps

# Run initial migration
docker compose -f docker-compose.prod.yml run --rm backend sh -c "npx prisma migrate deploy"

# Create admin user (optional seed script)
# docker compose -f docker-compose.prod.yml run --rm backend node scripts/seed-admin.js
```

### Step 6: Build and Start Services

```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check service status
docker compose -f docker-compose.prod.yml ps

# Follow logs
docker compose -f docker-compose.prod.yml logs -f
```

### Step 7: Configure Reverse Proxy (Caddy)

Caddy is included in the Docker Compose stack and handles:
- HTTPS termination (automatic Let's Encrypt certificates)
- Reverse proxy to backend and frontend
- HTTP → HTTPS redirect

**Caddyfile location:** `/opt/pyr/docker/caddy/Caddyfile`

**Verify Caddy configuration:**

```bash
# Check if Caddy is running
docker compose -f docker-compose.prod.yml ps caddy

# View Caddy logs
docker compose -f docker-compose.prod.yml logs caddy

# Test SSL certificate
curl -I https://api.puppyyogaretreat.com
curl -I https://app.puppyyogaretreat.com
```

### Step 8: Post-Deployment Verification

See [Post-Deployment Verification](#post-deployment-verification) section below.

---

## Regular Deployments

For deploying updates after the initial setup.

### Pre-Deployment Checklist

- [ ] Code reviewed and merged to `main` branch
- [ ] All tests passing in CI/CD
- [ ] Database migrations reviewed (if any)
- [ ] Breaking changes documented
- [ ] Backup created (see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md))

### Deployment Steps

#### Option A: Using Deploy Script (Recommended)

```bash
# SSH into production server
ssh pyr@YOUR_SERVER_IP

# Navigate to application directory
cd /opt/pyr

# Pull latest changes
git fetch origin
git checkout main
git pull origin main

# Run deploy script
./scripts/deploy.sh deploy

# The script will:
# 1. Save rollback point
# 2. Build new images with git SHA tag
# 3. Stop application services
# 4. Start services with new images
# 5. Run health checks
# 6. Rollback automatically if health checks fail
```

#### Option B: Manual Deployment

```bash
# SSH into production server
ssh pyr@YOUR_SERVER_IP
cd /opt/pyr

# Pull latest changes
git pull origin main

# Rebuild images
docker compose -f docker-compose.prod.yml build

# Stop services (keep DB and Redis running)
docker compose -f docker-compose.prod.yml stop backend frontend assistant

# Start services with new images
docker compose -f docker-compose.prod.yml up -d

# Check service health
docker compose -f docker-compose.prod.yml ps

# Monitor logs for errors
docker compose -f docker-compose.prod.yml logs -f backend
```

### Database Migrations

If the deployment includes database migrations:

```bash
# Migrations are run automatically by the backend entrypoint script
# when the container starts. Check logs:
docker compose -f docker-compose.prod.yml logs backend | grep -i migration

# To run migrations manually (not recommended):
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

---

## Rollback Procedures

### Automatic Rollback

If using the deploy script, rollback happens automatically if health checks fail.

### Manual Rollback

If you need to manually rollback to a previous version:

```bash
# Check available image tags
docker images | grep pyr

# Rollback using deploy script
./scripts/deploy.sh rollback

# OR manually specify a previous git commit
git log --oneline -10  # Find the commit hash
git checkout <PREVIOUS_COMMIT_HASH>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Database Rollback

**WARNING:** Database rollbacks are complex and should be avoided if possible.

```bash
# Restore from backup (see BACKUP_RESTORE.md)
# This will restore both data and schema

# If you need to rollback a specific migration:
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate resolve --rolled-back <MIGRATION_NAME>
```

---

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker compose -f docker-compose.prod.yml ps

# Check logs for specific service
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend
docker compose -f docker-compose.prod.yml logs postgres

# Restart a specific service
docker compose -f docker-compose.prod.yml restart backend
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose -f docker-compose.prod.yml ps postgres

# Check database health
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U pyr

# Verify DATABASE_URL is correct
docker compose -f docker-compose.prod.yml exec backend env | grep DATABASE_URL

# Test connection from backend
docker compose -f docker-compose.prod.yml exec backend npx prisma db execute --stdin <<< "SELECT 1"
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker compose -f docker-compose.prod.yml ps redis

# Test Redis connection
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$(cat /opt/pyr/secrets/redis_password.txt)" ping

# Should return: PONG
```

### Frontend Not Accessible

```bash
# Check Caddy logs
docker compose -f docker-compose.prod.yml logs caddy

# Verify DNS records (see DNS_SETUP.md)
dig app.puppyyogaretreat.com
dig api.puppyyogaretreat.com

# Test frontend health
curl -I http://localhost:3000

# Check if Caddy is forwarding requests
curl -I https://app.puppyyogaretreat.com
```

### SSL Certificate Issues

```bash
# Check Caddy logs for Let's Encrypt errors
docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate"

# Verify domain resolves to server
dig +short app.puppyyogaretreat.com

# Force certificate renewal (if needed)
docker compose -f docker-compose.prod.yml restart caddy
```

### High Memory Usage

```bash
# Check resource usage
docker stats

# Check service limits in docker-compose.prod.yml
# Services have memory limits configured

# Restart specific service to clear memory
docker compose -f docker-compose.prod.yml restart backend
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean up old Docker images
docker system prune -a

# Clean up old logs
docker compose -f docker-compose.prod.yml logs --tail=0 -f > /dev/null

# Check log file sizes
du -sh /var/lib/docker/containers/*/
```

---

## Post-Deployment Verification

After every deployment, verify the following:

### 1. Health Checks

```bash
# Check all services are healthy
docker compose -f docker-compose.prod.yml ps

# All services should show "Up" and "(healthy)"
```

### 2. API Endpoints

```bash
# Test health endpoint
curl https://api.puppyyogaretreat.com/health

# Expected response:
# {"status":"ok","timestamp":"...","checks":{"database":"ok","redis":"ok"}}

# Test authentication
curl -X POST https://api.puppyyogaretreat.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pyr.cy","password":"..."}'
```

### 3. Frontend

```bash
# Test frontend loads
curl -I https://app.puppyyogaretreat.com

# Should return: HTTP/2 200

# Test login page
open https://app.puppyyogaretreat.com/login
```

### 4. Database

```bash
# Check database migrations are up-to-date
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate status

# Should show: "Database schema is up to date!"
```

### 5. Monitoring

```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs backend | grep -i error
docker compose -f docker-compose.prod.yml logs frontend | grep -i error

# No critical errors should be present
```

### 6. Functional Testing

Manually test critical user flows:

- [ ] Login to admin dashboard
- [ ] View bookings list
- [ ] Create a new booking
- [ ] View events calendar
- [ ] Update settings

---

## Maintenance Windows

For deployments that require downtime:

1. **Schedule maintenance window** - Notify users via email/social media
2. **Enable maintenance mode** - Show maintenance page on frontend
3. **Perform deployment** - Follow regular deployment steps
4. **Extended testing** - Verify all functionality before going live
5. **Disable maintenance mode** - Restore normal operation

**Maintenance mode (if needed):**

```bash
# Create a simple maintenance page
docker compose -f docker-compose.prod.yml stop frontend
# Deploy static maintenance.html via Caddy
```

---

## Emergency Contacts

- **System Administrator:** [Your Name] - [email@example.com]
- **Hetzner Support:** https://console.hetzner.cloud/
- **On-Call Developer:** [Phone number]

---

## Change Log

| Date | Deployed By | Version/Commit | Notes |
|------|-------------|----------------|-------|
| 2026-02-16 | AVA Studio | Initial | First production deployment |
| | | | |

---

**Last Updated:** 2026-02-16
**Document Version:** 1.0
