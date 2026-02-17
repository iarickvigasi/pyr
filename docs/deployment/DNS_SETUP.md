# PYR DNS Configuration Guide

This guide explains how to configure DNS records for the Puppy Yoga Retreat platform.

## Table of Contents

1. [Domain Overview](#domain-overview)
2. [Required DNS Records](#required-dns-records)
3. [DNS Provider Setup](#dns-provider-setup)
4. [SSL Certificate Setup](#ssl-certificate-setup)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)

---

## Domain Overview

The PYR platform uses the following subdomains:

| Subdomain | Purpose | Points To |
|-----------|---------|-----------|
| `app.puppyyogaretreat.com` | Admin dashboard (frontend) | Production server IP |
| `api.puppyyogaretreat.com` | Backend REST API | Production server IP |
| `widget.puppyyogaretreat.com` | Public booking widget (Phase 2) | Production server IP |
| `www.puppyyogaretreat.com` | Marketing website (optional) | Separate server or redirect |

**Root domain:** `puppyyogaretreat.com`

---

## Required DNS Records

Configure these DNS records with your DNS provider:

### A Records

```
# Production server
app.puppyyogaretreat.com      A     <PRODUCTION_SERVER_IP>    300
api.puppyyogaretreat.com      A     <PRODUCTION_SERVER_IP>    300
widget.puppyyogaretreat.com   A     <PRODUCTION_SERVER_IP>    300
```

**Replace `<PRODUCTION_SERVER_IP>`** with your Hetzner server's public IP address.

**TTL (300 seconds = 5 minutes):** Short TTL during initial setup allows quick changes. Increase to 3600 (1 hour) or 86400 (24 hours) once stable.

### AAAA Records (IPv6, Optional)

If your server has an IPv6 address:

```
app.puppyyogaretreat.com      AAAA  <PRODUCTION_SERVER_IPv6>  300
api.puppyyogaretreat.com      AAAA  <PRODUCTION_SERVER_IPv6>  300
widget.puppyyogaretreat.com   AAAA  <PRODUCTION_SERVER_IPv6>  300
```

### CNAME for www (Optional)

Redirect `www` to root domain or app subdomain:

```
www.puppyyogaretreat.com      CNAME app.puppyyogaretreat.com  300
```

### CAA Records (Recommended for Security)

Allow only Let's Encrypt to issue certificates:

```
puppyyogaretreat.com          CAA   0 issue "letsencrypt.org"
puppyyogaretreat.com          CAA   0 issuewild "letsencrypt.org"
```

This prevents unauthorized certificate issuance.

---

## DNS Provider Setup

### Example: Cloudflare

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Select your domain `puppyyogaretreat.com`

2. **Add DNS Records**
   - Click "DNS" in the top menu
   - Click "Add record"
   - Add each A record from the table above:
     - **Type:** A
     - **Name:** app (or api, widget)
     - **IPv4 address:** Your server IP
     - **Proxy status:** 🟠 DNS only (important!)
     - **TTL:** Auto or 5 minutes

3. **Disable Cloudflare Proxy (Important!)**
   - Click the orange cloud icon to turn it grey (DNS only)
   - **Why:** Let's Encrypt needs to connect directly to your server for certificate validation
   - **After SSL setup:** You can re-enable proxy if desired

4. **Save Changes**
   - Changes propagate within minutes

### Example: Namecheap

1. **Log in to Namecheap**
   - Go to https://www.namecheap.com/
   - Click "Domain List" → Select your domain

2. **Manage DNS**
   - Click "Manage" → "Advanced DNS"

3. **Add A Records**
   - Click "Add New Record"
   - **Type:** A Record
   - **Host:** app (or api, widget)
   - **Value:** Your server IP
   - **TTL:** 5 min
   - Repeat for each subdomain

4. **Save Changes**

### Example: Google Domains / Google Cloud DNS

1. **Go to Cloud DNS Console**
   - https://console.cloud.google.com/net-services/dns

2. **Select Zone**
   - Select `puppyyogaretreat.com` zone

3. **Add Record Sets**
   - Click "Add Record Set"
   - **DNS Name:** app.puppyyogaretreat.com
   - **Resource Record Type:** A
   - **IPv4 Address:** Your server IP
   - **TTL:** 300
   - Click "Create"
   - Repeat for api, widget

---

## SSL Certificate Setup

Caddy (included in docker-compose.prod.yml) automatically obtains and renews SSL certificates from Let's Encrypt.

### Caddyfile Configuration

The Caddyfile is located at `/opt/pyr/docker/caddy/Caddyfile`:

```caddyfile
# API Backend
api.puppyyogaretreat.com {
    reverse_proxy backend:3001
    encode gzip
    log {
        output file /var/log/caddy/api.log
    }
}

# Admin Dashboard
app.puppyyogaretreat.com {
    reverse_proxy frontend:3000
    encode gzip
    log {
        output file /var/log/caddy/app.log
    }
}

# Booking Widget (Phase 2)
widget.puppyyogaretreat.com {
    reverse_proxy booking-widget:3002
    encode gzip
    log {
        output file /var/log/caddy/widget.log
    }
}
```

### Automatic Certificate Issuance

When Caddy starts, it will automatically:

1. Detect the domain names in the Caddyfile
2. Contact Let's Encrypt ACME server
3. Complete HTTP-01 challenge (requires port 80 accessible)
4. Obtain TLS certificates
5. Configure HTTPS with modern cipher suites
6. Auto-renew certificates before expiration

**Requirements for automatic SSL:**
- DNS records must point to your server
- Port 80 (HTTP) must be open for ACME challenge
- Port 443 (HTTPS) must be open for serving traffic

### Verify Certificate Issuance

```bash
# Check Caddy logs
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate

# Expected output:
# obtaining certificate for app.puppyyogaretreat.com
# certificate obtained successfully

# Test HTTPS
curl -I https://app.puppyyogaretreat.com

# Should return: HTTP/2 200 (not HTTP/1.1 404 or connection refused)
```

### Manual Certificate Troubleshooting

If automatic issuance fails:

```bash
# Check DNS resolves correctly
dig +short app.puppyyogaretreat.com

# Should return your server IP

# Check port 80 is accessible
curl -I http://app.puppyyogaretreat.com

# Check Caddy container logs
docker compose -f docker-compose.prod.yml logs caddy --tail=100

# Restart Caddy to retry
docker compose -f docker-compose.prod.yml restart caddy
```

### Let's Encrypt Rate Limits

Be aware of Let's Encrypt rate limits:

- **50 certificates per registered domain per week**
- **5 duplicate certificates per week**
- Use Let's Encrypt staging environment for testing:

```caddyfile
# Add to Caddyfile for testing
{
    acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

**Remove this before production!**

---

## Verification

### 1. DNS Propagation Check

Wait for DNS to propagate (can take up to 48 hours, usually minutes):

```bash
# Check from different DNS servers
dig @8.8.8.8 app.puppyyogaretreat.com        # Google DNS
dig @1.1.1.1 api.puppyyogaretreat.com        # Cloudflare DNS
dig @208.67.222.222 widget.puppyyogaretreat.com  # OpenDNS

# Online tool
# https://dnschecker.org/
```

### 2. HTTP Connectivity

```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://app.puppyyogaretreat.com

# Expected: HTTP/1.1 308 Permanent Redirect → Location: https://...
```

### 3. HTTPS Connectivity

```bash
# Test HTTPS
curl -I https://app.puppyyogaretreat.com

# Expected: HTTP/2 200
```

### 4. SSL Certificate Validity

```bash
# Check certificate details
echo | openssl s_client -connect app.puppyyogaretreat.com:443 -servername app.puppyyogaretreat.com 2>/dev/null | openssl x509 -noout -dates

# Should show valid dates (not expired)
```

Online SSL checker:
- https://www.ssllabs.com/ssltest/analyze.html?d=app.puppyyogaretreat.com

**Target Grade:** A or A+

### 5. Functional Test

```bash
# Test API health endpoint
curl https://api.puppyyogaretreat.com/health

# Expected: {"status":"ok","timestamp":"...","checks":{"database":"ok","redis":"ok"}}

# Test frontend loads
curl -I https://app.puppyyogaretreat.com

# Expected: HTTP/2 200
```

---

## Troubleshooting

### DNS Not Resolving

**Problem:** `dig app.puppyyogaretreat.com` returns no IP address

**Solutions:**
1. Check DNS records are saved in provider dashboard
2. Wait for propagation (can take up to 48 hours)
3. Flush local DNS cache:
   ```bash
   # Linux
   sudo systemd-resolve --flush-caches

   # macOS
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

   # Windows
   ipconfig /flushdns
   ```

### SSL Certificate Not Issued

**Problem:** `curl https://app.puppyyogaretreat.com` fails with SSL error

**Solutions:**

1. **Check DNS resolves to correct IP:**
   ```bash
   dig +short app.puppyyogaretreat.com
   # Should return your server IP
   ```

2. **Check port 80 is open:**
   ```bash
   # On server
   sudo ufw status
   # Ports 80 and 443 should be allowed

   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. **Check Caddy logs for errors:**
   ```bash
   docker compose -f docker-compose.prod.yml logs caddy | grep -i error
   ```

4. **Verify Caddyfile syntax:**
   ```bash
   docker compose -f docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```

5. **Restart Caddy:**
   ```bash
   docker compose -f docker-compose.prod.yml restart caddy
   ```

### Certificate Shows as Untrusted

**Problem:** Browser shows "Not Secure" or certificate warning

**Causes:**
- Certificate issued by Let's Encrypt Staging (test environment)
- Certificate expired
- Certificate for wrong domain

**Solutions:**
1. Check certificate issuer:
   ```bash
   echo | openssl s_client -connect app.puppyyogaretreat.com:443 2>/dev/null | openssl x509 -noout -issuer

   # Should show: Let's Encrypt Authority
   # NOT: Let's Encrypt Staging
   ```

2. Remove staging configuration from Caddyfile if present

3. Delete staging certificates and restart:
   ```bash
   docker compose -f docker-compose.prod.yml stop caddy
   docker volume rm pyr_caddy_data
   docker compose -f docker-compose.prod.yml up -d caddy
   ```

### Mixed Content Warnings

**Problem:** Frontend loads over HTTPS but makes HTTP API calls

**Solution:**
- Ensure `NEXT_PUBLIC_API_URL` uses `https://`
- Check `.env` file: `NEXT_PUBLIC_API_URL=https://api.puppyyogaretreat.com`
- Rebuild frontend:
  ```bash
  docker compose -f docker-compose.prod.yml build frontend
  docker compose -f docker-compose.prod.yml up -d frontend
  ```

### CORS Errors

**Problem:** API returns CORS errors when accessed from frontend

**Solution:**
- Verify `CORS_ORIGIN` in backend `.env`:
  ```bash
  CORS_ORIGIN=https://app.puppyyogaretreat.com
  ```
- Restart backend:
  ```bash
  docker compose -f docker-compose.prod.yml restart backend
  ```

---

## DNS Record Checklist

Before going live, verify:

- [ ] `app.puppyyogaretreat.com` A record points to server IP
- [ ] `api.puppyyogaretreat.com` A record points to server IP
- [ ] `widget.puppyyogaretreat.com` A record points to server IP (Phase 2)
- [ ] DNS propagated globally (check https://dnschecker.org/)
- [ ] Port 80 open on server (for ACME challenge)
- [ ] Port 443 open on server (for HTTPS)
- [ ] Caddy Caddyfile configured for all subdomains
- [ ] SSL certificates issued successfully
- [ ] HTTPS working for all subdomains
- [ ] HTTP redirects to HTTPS
- [ ] SSL Labs test shows A or A+ grade
- [ ] No mixed content warnings
- [ ] CORS configured correctly

---

## Security Best Practices

1. **Enable CAA Records**
   - Prevents unauthorized certificate issuance

2. **Enable HSTS** (HTTP Strict Transport Security)
   - Add to Caddyfile:
     ```caddyfile
     header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
     ```

3. **Security Headers**
   - Add to Caddyfile:
     ```caddyfile
     header X-Content-Type-Options "nosniff"
     header X-Frame-Options "DENY"
     header X-XSS-Protection "1; mode=block"
     header Referrer-Policy "strict-origin-when-cross-origin"
     ```

4. **Disable Directory Listing**
   - Caddy does this by default

5. **Rate Limiting**
   - Already configured in Fastify backend

---

**Last Updated:** 2026-02-16
**Document Version:** 1.0
