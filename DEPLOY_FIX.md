# Fix: Company portal still shows cancelled orders on production

Local works. Production does not. This is **not a code bug** — production is serving an **old build**.

## Quick test (do this now)

Open: https://oceanlinux.com/api/company/version

| Result | Meaning |
|--------|---------|
| JSON with `"ordersFilter": "confirmed-active-only-v4"` | New build is live |
| **404 page** | Old build still running (your current problem) |

## Fix on EC2 server (SSH required)

```bash
cd /home/ec2-user/oceanlinux   # change if your path differs

git pull origin main

rm -rf .next

bun run build
# must finish without errors

pm2 delete oceanlinux
pm2 start ecosystem.config.cjs
pm2 save
```

Or:

```bash
bash scripts/deploy-rebuild.sh
```

**Do NOT** only run `pm2 restart` — that keeps the old `.next` folder.

**Do NOT** build on Windows and upload `.next` — build on the Linux server.

## Verify after deploy

1. https://oceanlinux.com/api/company/version → must show `confirmed-active-only-v4`
2. Login to `/company/rockybhai` → Network tab → `/api/company/login` response must include `"ordersFilter": "confirmed-active-only-v4"`
3. Hard refresh: `Ctrl+Shift+R`

## If nginx caches responses

Add inside your `server { }` block:

```nginx
location /api/company/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "no-store";
}

location /company/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "no-store";
}
```

Then: `sudo nginx -t && sudo systemctl reload nginx`

## Check PM2 is running from correct folder

```bash
pm2 show oceanlinux
```

`exec cwd` must be your oceanlinux folder where you ran `git pull` and `bun run build`.
