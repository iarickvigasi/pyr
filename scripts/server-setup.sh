#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Hetzner VPS Provisioning Script — Puppy Yoga Retreat
# Run as root on a fresh Ubuntu 24.04 LTS server
# ──────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_USER="deploy"
PROJECT_DIR="/opt/pyr"

echo "=== System update ==="
apt-get update && apt-get upgrade -y

echo "=== Create deploy user ==="
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  mkdir -p /home/$DEPLOY_USER/.ssh
  cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
  chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
  chmod 700 /home/$DEPLOY_USER/.ssh
  chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$DEPLOY_USER
fi

echo "=== Harden SSH ==="
sed -i 's/#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

echo "=== Configure UFW firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== Install Docker ==="
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker $DEPLOY_USER

echo "=== Install fail2ban ==="
apt-get install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

echo "=== Create project directory ==="
mkdir -p $PROJECT_DIR
chown $DEPLOY_USER:$DEPLOY_USER $PROJECT_DIR

echo "=== Configure unattended upgrades ==="
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "=== Setup daily database backups ==="
mkdir -p /opt/backups
cat > /etc/cron.daily/pyr-backup << 'BACKUP'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cd /opt/pyr
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U pyr pyr | gzip > "$BACKUP_DIR/pyr_$TIMESTAMP.sql.gz"
# Keep only last 14 days
find "$BACKUP_DIR" -name "pyr_*.sql.gz" -mtime +14 -delete
BACKUP
chmod +x /etc/cron.daily/pyr-backup

echo "=== Done! ==="
echo "Server provisioning complete. Next steps:"
echo "1. Clone the repo: cd $PROJECT_DIR && git clone <repo-url> ."
echo "2. Copy .env.example to .env and configure"
echo "3. Create secrets/db_password.txt"
echo "4. Run: docker compose -f docker-compose.prod.yml up -d"
