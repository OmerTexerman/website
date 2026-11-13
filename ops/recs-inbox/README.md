# Recommendations inbox

Visitors feed the slop guy recommendations (books, films, shows, videos,
anything) from the site's `/slop` form. Each one becomes an issue in the
**private** repo `OmerTexerman/recs-inbox`. Nothing reaches the site until
it is accepted there.

```
form (/slop) ──► /api/recommend ──► issue in recs-inbox (label: rec)
                 Turnstile + honeypot        │
                                             ▼ add label `accepted`
               book? ── yes ─► workflow commits src/content/books/<slug>.yaml
                 │              (status: want-to-read, recommendedBy; Vercel redeploys)
                 └─ no ──► noted and closed
```

- **Accept:** add the `accepted` label. To fix a typo first, edit the JSON
  block in the issue.
- **Pass:** close the issue.
- **After accepting a book:** it is an ordinary entry, so it can be edited in
  Sveltia like any other (move it to Reading or Finished, change the spine).

This folder is the source for that repo's workflow. Copy changes over with:

```sh
cp -R ops/recs-inbox/.github <path-to>/recs-inbox/
```

## Setup

| Where | Name | Value |
| --- | --- | --- |
| Cloudflare → Turnstile | widget | Hostname `omer.texerman.com`, mode Managed |
| Vercel env (Production) | `PUBLIC_TURNSTILE_SITE_KEY` | the widget's site key |
| Vercel env (Production) | `TURNSTILE_SECRET_KEY` | the widget's secret key |
| Vercel env (Production) | `RECS_GITHUB_TOKEN` | fine-grained token: repo `recs-inbox` only, **Issues: read and write** |
| recs-inbox → Actions secrets | `WEBSITE_TOKEN` | fine-grained token: repo `website` only, **Contents: read and write** |

The inbox repo needs the labels `rec` and `accepted`.

`astro dev` uses Cloudflare's always-pass test keys, so the form can be tried
locally. Without `RECS_GITHUB_TOKEN`, it stops at "Recommendations aren't set
up yet."
