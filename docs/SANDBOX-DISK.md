# Running out of disk in an agent sandbox

**Written:** 1 September 2026 · **Measured in:** a Claude Code container on this
repository, `node_modules` installed, no build output present.

Written because Codex hit disk pressure and the first instinct — ask the other
agent to clean up — does not work, for a reason worth knowing.

---

## 1. Each agent has its own disk. Cleaning one does not help the other

Claude and Codex run in separate containers. Neither can see or free the
other's filesystem, and neither is where the repository "lives" in any shared
sense. A tidy-up in one sandbox reclaims nothing in the other.

**What *is* shared is the repository**, and the repository is not the problem —
see §3.

---

## 2. `df` misleads here, and that is the first thing to know

Writable disk is a **fixed per-session allowance**, not the size of the
underlying volume. So:

- `Avail` at 0 with a low `Used` means **the allowance is spent**, not that the
  machine is full;
- the numbers `df` prints may barely move as you delete things, while writes
  start succeeding again.

**Deletes still succeed while writes are failing, and freed space is
immediately writable.** If you are chasing a figure that will not move, that is
why. Judge by whether writes work again, not by `df`.

---

## 3. It is not the repository

Checked rather than assumed, 1 September 2026:

| | Size |
|---|---:|
| `.git` | 17 MB |
| Largest tracked file (`public/og-image.jpg`) | 456 KB |
| Whole working tree excluding `node_modules` | ~7 MB |

`.gitignore` already excludes `/.next/`, `*.tsbuildinfo`, `/coverage`,
`/test-results`, `/playwright-report` and `/playwright/.cache`. The only
ignored things present in a working container are `node_modules/`,
`next-env.d.ts` and `tsconfig.tsbuildinfo`.

**So there is no commit that would shrink anybody's disk.** What fills a sandbox
is environment cache, and that is rebuilt per container.

---

## 4. What actually uses the space, and what is safe to remove

Measured in this container:

| Path | Size | Safe to delete? | How it comes back |
|---|---:|---|---|
| `node_modules` | 1.3 GB | **Yes** | `npm ci` — several minutes |
| `/opt/pw-browsers` | 924 MB | **No — see below** | It may not |
| `~/.npm` | 558 MB | **Yes** | Refetched on the next install, which is slower |
| `~/.cache/uv` | 224 MB | **Yes** | Python package cache; nothing in this repo uses it |
| `.next` | varies, often large | **Yes** | The next `next build` or `next dev` |
| `~/.cache/pip` | ~5 MB | Yes | Not worth the keystrokes |

The first reach should be `.next`, then `~/.cache/uv`, then `~/.npm`. Those
three cost nothing but time to restore.

```sh
rm -rf .next
rm -rf ~/.cache/uv
npm cache clean --force
```

`node_modules` is the largest single win and the most disruptive: everything
stops working until `npm ci` finishes. Keep it for when the three above are not
enough.

### Do not delete `/opt/pw-browsers`

It is the second-largest item and therefore the tempting one. **The environment
pre-installs Chromium there and explicitly forbids `playwright install`**, with
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` set so npm postinstall does not refetch it.

Removing it breaks `npm run test:browser`, `npm run test:frozen-panes` and the
browser stage of `npm run verify`, and there is no supported way to put it back
inside the sandbox. Reclaiming 924 MB by disabling the browser tests is not a
trade this project should make quietly.

---

## 5. Things that quietly grow during a working session

Worth clearing between long tasks rather than only in an emergency:

- **`.next`** — both `next build` and `next dev` write here, and `next dev`
  keeps a Turbopack cache under `.next/cache`. This is the one that grows most
  during ordinary work.
- **`tsconfig.tsbuildinfo`** — under 1 MB, harmless, mentioned only so nobody
  wonders what it is.
- **Playwright traces and reports** under `/test-results` and
  `/playwright-report`, when a browser run has failed and kept its artefacts.

---

## 6. If none of that is enough

The container is disposable. A fresh session starts with a clean allowance, and
**anything not committed and pushed is lost with it** — which is the actual
risk, not the disk. Push before reaching for that.
