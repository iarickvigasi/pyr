# PYR DNS Configuration Guide

## Current Production Endpoints

| Hostname | Purpose | Required now |
|----------|---------|--------------|
| `app.puppyyogaretreat.com` | Admin dashboard | yes |
| `api.puppyyogaretreat.com` | Backend REST API | yes |
| `widget.puppyyogaretreat.com` | Public booking widget | not in the current production stack |

Point `app` and `api` to the same production server IP.

## Required DNS Records

```text
app.puppyyogaretreat.com    A     <PRODUCTION_SERVER_IP>
api.puppyyogaretreat.com    A     <PRODUCTION_SERVER_IP>
```

Optional IPv6:

```text
app.puppyyogaretreat.com    AAAA  <PRODUCTION_SERVER_IPV6>
api.puppyyogaretreat.com    AAAA  <PRODUCTION_SERVER_IPV6>
```

## TLS / Reverse Proxy

Caddy in `docker-compose.prod.yml` terminates TLS for:

- `app.puppyyogaretreat.com`
- `api.puppyyogaretreat.com`

Current committed Caddy configuration:

- `docker/caddy/Caddyfile`

## Verification

```bash
dig +short app.puppyyogaretreat.com
dig +short api.puppyyogaretreat.com
curl -I https://app.puppyyogaretreat.com
curl -I https://api.puppyyogaretreat.com/health
```

## Notes

1. Keep Cloudflare proxying disabled until certificates are issued cleanly.
2. Port `80` must be reachable for first-time ACME validation.
3. The booking widget host can stay unconfigured until that package is revived and added to the production stack.
