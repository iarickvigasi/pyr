# PYR Backup & Restore Procedures

This document outlines backup and restore procedures for the Puppy Yoga Retreat platform.

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Manual Backup](#manual-backup)
3. [Automated Backups](#automated-backups)
4. [Restore Procedures](#restore-procedures)
5. [Testing Backups](#testing-backups)
6. [Backup Retention Policy](#backup-retention-policy)

---

## Backup Strategy

### What to Back Up

1. **PostgreSQL Database** - All application data (guests, bookings, events, messages, etc.)
2. **Redis Data** - Session cache and job queue state
3. **Docker Volumes** - Persistent data from containers
4. **Environment Configuration** - `.env` file and secrets
5. **Caddy Data** - SSL certificates and configuration

### Backup Schedule

| Frequency | Type | Retention | What |
|-----------|------|-----------|------|
| **Daily** | Full DB dump | 7 days | PostgreSQL database |
| **Weekly** | Full system snapshot | 4 weeks | DB + volumes + config |
| **Before deployment** | On-demand | Until next deployment | Everything |
| **Monthly** | Archive | 12 months | Full backup compressed |

### Backup Storage

- **Primary:** Local server (`/opt/backups/pyr/`)
- **Secondary:** Hetzner Cloud Storage Volumes (mounted)
- **Off-site:** S3-compatible object storage (recommended for production)

---

## Manual Backup

### Quick Pre-Deployment Backup

Run this before every deployment:

```bash
#!/bin/bash
# Quick backup script

BACKUP_DIR="/opt/backups/pyr"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$BACKUP_PATH"

# Backup database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U pyr pyr | gzip > "$BACKUP_PATH/db.sql.gz"

# Backup environment and secrets
cp .env "$BACKUP_PATH/env"
cp -r secrets "$BACKUP_PATH/"

# Record deployment info
git rev-parse HEAD > "$BACKUP_PATH/git_commit.txt"
git log -1 --pretty=format:"%h - %s (%ci)" >> "$BACKUP_PATH/git_commit.txt"

echo "Backup created: $BACKUP_PATH"
```

Save this as `/opt/pyr/scripts/backup.sh` and make it executable:

```bash
chmod +x /opt/pyr/scripts/backup.sh
```

### Full Database Backup

#### PostgreSQL Dump

```bash
# Create backup directory
mkdir -p /opt/backups/pyr/db

# Dump database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U pyr -Fc pyr > /opt/backups/pyr/db/pyr_$(date +%Y%m%d_%H%M%S).dump

# Or as plain SQL (larger but human-readable)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U pyr pyr | gzip > /opt/backups/pyr/db/pyr_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### Verify Backup

```bash
# Check file size (should not be 0)
ls -lh /opt/backups/pyr/db/

# List tables in dump (custom format)
pg_restore --list /opt/backups/pyr/db/pyr_20260216_120000.dump | head -20

# Or for SQL dump
zcat /opt/backups/pyr/db/pyr_20260216_120000.sql.gz | head -50
```

### Redis Backup

Redis data is less critical (mostly cache), but you can back it up:

```bash
# Trigger background save
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$(cat secrets/redis_password.txt)" BGSAVE

# Copy dump file
docker cp $(docker compose -f docker-compose.prod.yml ps -q redis):/data/dump.rdb \
  /opt/backups/pyr/redis_$(date +%Y%m%d_%H%M%S).rdb
```

### Docker Volumes Backup

```bash
# List volumes
docker volume ls | grep pyr

# Backup PostgreSQL data volume
docker run --rm \
  -v pyr_postgres_data:/data \
  -v /opt/backups/pyr:/backup \
  alpine tar czf /backup/postgres_volume_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Backup Caddy data (SSL certificates)
docker run --rm \
  -v pyr_caddy_data:/data \
  -v /opt/backups/pyr:/backup \
  alpine tar czf /backup/caddy_volume_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Configuration Backup

```bash
# Backup all configuration files
tar czf /opt/backups/pyr/config_$(date +%Y%m%d_%H%M%S).tar.gz \
  /opt/pyr/.env \
  /opt/pyr/secrets/ \
  /opt/pyr/docker-compose.prod.yml \
  /opt/pyr/docker/caddy/Caddyfile
```

---

## Automated Backups

### Daily Backup Cron Job

Create a comprehensive backup script:

```bash
#!/bin/bash
# /opt/pyr/scripts/backup-daily.sh

set -e

BACKUP_ROOT="/opt/backups/pyr"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_ROOT/daily/$DATE"
LOG_FILE="$BACKUP_ROOT/backup.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting daily backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# 1. Database backup
log "Backing up PostgreSQL database..."
docker compose -f /opt/pyr/docker-compose.prod.yml exec -T postgres \
  pg_dump -U pyr -Fc pyr > "$BACKUP_DIR/pyr.dump"

if [ $? -eq 0 ]; then
    log "Database backup completed: $(du -h "$BACKUP_DIR/pyr.dump" | cut -f1)"
else
    log "ERROR: Database backup failed!"
    exit 1
fi

# 2. Redis backup
log "Backing up Redis..."
docker compose -f /opt/pyr/docker-compose.prod.yml exec -T redis \
  redis-cli -a "$(cat /opt/pyr/secrets/redis_password.txt)" SAVE

docker cp $(docker compose -f /opt/pyr/docker-compose.prod.yml ps -q redis):/data/dump.rdb \
  "$BACKUP_DIR/redis.rdb" 2>/dev/null || log "Redis backup skipped"

# 3. Configuration backup
log "Backing up configuration..."
cp /opt/pyr/.env "$BACKUP_DIR/env"
cp -r /opt/pyr/secrets "$BACKUP_DIR/"
git -C /opt/pyr rev-parse HEAD > "$BACKUP_DIR/git_commit.txt"

# 4. Create archive
log "Creating archive..."
tar czf "$BACKUP_DIR.tar.gz" -C "$BACKUP_ROOT/daily" "$DATE"
rm -rf "$BACKUP_DIR"

# 5. Clean up old backups (keep last 7 days)
log "Cleaning up old backups..."
find "$BACKUP_ROOT/daily" -name "*.tar.gz" -mtime +7 -delete

log "Daily backup completed: $BACKUP_DIR.tar.gz"
log "Backup size: $(du -h "$BACKUP_DIR.tar.gz" | cut -f1)"
```

Make it executable:

```bash
chmod +x /opt/pyr/scripts/backup-daily.sh
```

### Configure Cron

```bash
# Edit crontab for pyr user
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/pyr/scripts/backup-daily.sh

# Add weekly backup at 3 AM on Sundays
0 3 * * 0 /opt/pyr/scripts/backup-weekly.sh
```

### Weekly Full Backup

Create `/opt/pyr/scripts/backup-weekly.sh`:

```bash
#!/bin/bash
# Weekly full backup including volumes

set -e

BACKUP_ROOT="/opt/backups/pyr"
DATE=$(date +%Y%m%d)
BACKUP_DIR="$BACKUP_ROOT/weekly/$DATE"
LOG_FILE="$BACKUP_ROOT/backup.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting weekly full backup..."

mkdir -p "$BACKUP_DIR"

# Database
docker compose -f /opt/pyr/docker-compose.prod.yml exec -T postgres \
  pg_dump -U pyr -Fc pyr > "$BACKUP_DIR/pyr.dump"

# Volumes
docker run --rm \
  -v pyr_postgres_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/postgres_volume.tar.gz -C /data .

docker run --rm \
  -v pyr_caddy_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/caddy_volume.tar.gz -C /data .

# Configuration
cp -r /opt/pyr/.env /opt/pyr/secrets /opt/pyr/docker-compose.prod.yml "$BACKUP_DIR/"

# Archive everything
tar czf "$BACKUP_DIR.tar.gz" -C "$BACKUP_ROOT/weekly" "$DATE"
rm -rf "$BACKUP_DIR"

# Keep last 4 weeks
find "$BACKUP_ROOT/weekly" -name "*.tar.gz" -mtime +28 -delete

log "Weekly backup completed: $BACKUP_DIR.tar.gz"
log "Size: $(du -h "$BACKUP_DIR.tar.gz" | cut -f1)"
```

Make it executable:

```bash
chmod +x /opt/pyr/scripts/backup-weekly.sh
```

---

## Restore Procedures

### Restore Database

#### From pg_dump (custom format)

```bash
# Stop backend to prevent writes
docker compose -f docker-compose.prod.yml stop backend

# Drop existing database (WARNING: destructive!)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U pyr -d postgres -c "DROP DATABASE IF EXISTS pyr;"

# Recreate database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U pyr -d postgres -c "CREATE DATABASE pyr;"

# Restore from dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U pyr -d pyr < /opt/backups/pyr/db/pyr_20260216_120000.dump

# Or if file is on host, copy it first
docker cp /opt/backups/pyr/db/pyr_20260216_120000.dump \
  $(docker compose -f docker-compose.prod.yml ps -q postgres):/tmp/restore.dump

docker compose -f docker-compose.prod.yml exec postgres \
  pg_restore -U pyr -d pyr /tmp/restore.dump

# Restart backend
docker compose -f docker-compose.prod.yml start backend
```

#### From SQL dump

```bash
# Stop backend
docker compose -f docker-compose.prod.yml stop backend

# Drop and recreate
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U pyr -d postgres -c "DROP DATABASE IF EXISTS pyr; CREATE DATABASE pyr;"

# Restore
zcat /opt/backups/pyr/db/pyr_20260216_120000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U pyr -d pyr

# Restart backend
docker compose -f docker-compose.prod.yml start backend
```

### Restore Redis

```bash
# Stop Redis
docker compose -f docker-compose.prod.yml stop redis

# Copy dump file into volume
docker cp /opt/backups/pyr/redis_20260216_120000.rdb \
  $(docker compose -f docker-compose.prod.yml ps -q redis):/data/dump.rdb

# Start Redis (will load dump.rdb automatically)
docker compose -f docker-compose.prod.yml start redis
```

### Restore Docker Volumes

```bash
# Stop services using the volume
docker compose -f docker-compose.prod.yml stop postgres

# Restore PostgreSQL volume
docker run --rm \
  -v pyr_postgres_data:/data \
  -v /opt/backups/pyr:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/postgres_volume_20260216.tar.gz -C /data"

# Restart services
docker compose -f docker-compose.prod.yml start postgres
```

### Full System Restore

For disaster recovery:

```bash
# 1. Clone repository
cd /opt/pyr
git clone https://github.com/YOUR_ORG/PYR.git .

# 2. Extract backup
tar xzf /opt/backups/pyr/weekly/20260216.tar.gz -C /tmp/restore

# 3. Restore configuration
cp /tmp/restore/20260216/env /opt/pyr/.env
cp -r /tmp/restore/20260216/secrets /opt/pyr/

# 4. Start database and Redis
docker compose -f docker-compose.prod.yml up -d postgres redis

# 5. Wait for database to be ready
sleep 10

# 6. Restore database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U pyr -d pyr -c < /tmp/restore/20260216/pyr.dump

# 7. Start all services
docker compose -f docker-compose.prod.yml up -d

# 8. Verify
docker compose -f docker-compose.prod.yml ps
```

---

## Testing Backups

**Critical:** Always test that backups can be restored!

### Monthly Backup Test

```bash
#!/bin/bash
# /opt/pyr/scripts/test-backup.sh

# 1. Get latest backup
LATEST_BACKUP=$(ls -t /opt/backups/pyr/daily/*.tar.gz | head -1)

echo "Testing backup: $LATEST_BACKUP"

# 2. Extract to temp location
TEMP_DIR="/tmp/backup-test-$(date +%s)"
mkdir -p "$TEMP_DIR"
tar xzf "$LATEST_BACKUP" -C "$TEMP_DIR"

# 3. Create test database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U pyr -d postgres -c "DROP DATABASE IF EXISTS pyr_test_restore;"

docker compose -f docker-compose.prod.yml exec postgres \
  psql -U pyr -d postgres -c "CREATE DATABASE pyr_test_restore;"

# 4. Restore to test database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U pyr -d pyr_test_restore < "$TEMP_DIR"/*/pyr.dump

if [ $? -eq 0 ]; then
    echo "✅ Backup restore test PASSED"

    # Verify data
    docker compose -f docker-compose.prod.yml exec postgres \
      psql -U pyr -d pyr_test_restore -c "SELECT COUNT(*) FROM _prisma_migrations;"

    # Cleanup
    docker compose -f docker-compose.prod.yml exec postgres \
      psql -U pyr -d postgres -c "DROP DATABASE pyr_test_restore;"
else
    echo "❌ Backup restore test FAILED"
    exit 1
fi

rm -rf "$TEMP_DIR"
```

Run monthly backup test:

```bash
# Add to crontab
0 4 1 * * /opt/pyr/scripts/test-backup.sh
```

---

## Backup Retention Policy

| Backup Type | Retention Period | Storage Location |
|-------------|------------------|------------------|
| Daily | 7 days | Local disk |
| Weekly | 4 weeks | Local disk + cloud |
| Monthly | 12 months | Cloud storage |
| Pre-deployment | Until next deployment | Local disk |

### Cleanup Old Backups

```bash
#!/bin/bash
# /opt/pyr/scripts/cleanup-backups.sh

BACKUP_ROOT="/opt/backups/pyr"

# Daily: keep 7 days
find "$BACKUP_ROOT/daily" -name "*.tar.gz" -mtime +7 -delete

# Weekly: keep 4 weeks
find "$BACKUP_ROOT/weekly" -name "*.tar.gz" -mtime +28 -delete

# Monthly: keep 12 months
find "$BACKUP_ROOT/monthly" -name "*.tar.gz" -mtime +365 -delete

# Pre-deployment: keep last 5
ls -t "$BACKUP_ROOT/pre-deploy"/*.tar.gz | tail -n +6 | xargs rm -f

echo "Backup cleanup completed"
```

Add to crontab:

```bash
0 5 * * * /opt/pyr/scripts/cleanup-backups.sh
```

---

## Off-Site Backup (Optional but Recommended)

For production, configure off-site backups to S3-compatible storage:

```bash
# Install s3cmd
apt install s3cmd

# Configure s3cmd
s3cmd --configure

# Upload daily backups to S3
s3cmd put /opt/backups/pyr/daily/*.tar.gz s3://pyr-backups/daily/

# Or use rclone for more options
rclone copy /opt/backups/pyr/ remote:pyr-backups/
```

Add to backup scripts:

```bash
# At the end of backup-daily.sh
s3cmd put "$BACKUP_DIR.tar.gz" s3://pyr-backups/daily/
```

---

## Emergency Recovery Contacts

- **Database Administrator:** [Name] - [email@example.com]
- **Hetzner Support:** https://console.hetzner.cloud/
- **Backup Storage:** [S3 provider contact]

---

**Last Updated:** 2026-02-16
**Document Version:** 1.0
