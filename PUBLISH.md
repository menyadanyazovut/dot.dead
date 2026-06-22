# Publishing dot.dead

The game is the **`dot.dead v2/`** folder. It is fully self-contained — three.js
and the font are vendored under `dot.dead v2/vendor/`, so it has **no external
CDN dependencies** and will load even where Cloudflare / Google are blocked.

## Deploy to GitHub Pages (automated)

A workflow at `.github/workflows/deploy.yml` publishes `dot.dead v2/` to Pages on
every push to `main`. One-time setup:

1. **Create a repository** on GitHub (e.g. `dot-dead`), public.
2. **Push this project's `main` branch:**
   ```bash
   cd "/Users/danya/Claude/Projects/dot.dead"
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source = "GitHub
   Actions"**.
4. The "Deploy dot.dead to GitHub Pages" workflow runs automatically (watch the
   **Actions** tab). After ~1-2 minutes your site is live at:
   `https://<your-username>.github.io/<repo>/`

Every later `git push` to `main` redeploys automatically.

### Optional custom domain (.com or .ru)
Buy a domain, then **Settings → Pages → Custom domain**, enter it, and add the
DNS records GitHub shows (a `CNAME` to `<your-username>.github.io`, or the four
A records for an apex domain). The TLD does not affect who can reach the site —
both `.com` and `.ru` resolve worldwide.

## ⚠️ Russia accessibility note

GitHub access is currently throttled/unreliable inside Russia without a VPN, so
GitHub Pages alone will **not** dependably reach your Russian audience. Because
the build is now self-contained, the same files can be dropped onto Russian
infrastructure to serve RU users reliably, e.g.:

- a Russian shared host (Timeweb / Beget / reg.ru) — upload `dot.dead v2/` via
  the file manager, point a domain at it; or
- Yandex Cloud Object Storage static hosting (free Let's Encrypt HTTPS).

A practical setup: GitHub Pages as the international URL + a Russian mirror at a
`.ru`/`.com` domain for RU users — both serving the identical `dot.dead v2/`
files.
