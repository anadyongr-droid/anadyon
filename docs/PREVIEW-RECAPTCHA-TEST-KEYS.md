# Testing the booking form automatically on Preview

Status: **code ready, Vercel variables not yet set.**
Applies to: Preview deployments only. Production is unaffected and must stay so.

## Why this exists

The booking and contact forms are the only unauthenticated write paths on the
site, and reCAPTCHA is what stops them being scripted. That same protection
makes the booking flow impossible to exercise automatically — a real token
needs a person to solve it.

Google publishes a key pair intended for test environments that verifies every
token. On a Preview deployment that is exactly what is wanted. On the live site
it would leave both forms open to anything that can send a POST.

## What the code does

- The site key rendered by both forms comes from `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`,
  falling back to the live key. **An unset variable behaves exactly as before.**
- `verifyRecaptcha` **refuses every submission** if it finds Google's test
  secret while running as the live site, and logs
  `[recaptcha] REFUSING ALL SUBMISSIONS`. It returns before contacting Google,
  so a misconfiguration cannot be masked by Google verifying the token anyway.
- A token from the test key reports `testkey.google.com` rather than a real
  domain. That hostname is accepted **only** when the test secret is in use,
  which by then already proves this is not the live site.

"Live site" means `VERCEL_ENV === "production"`, or `NODE_ENV === "production"`
when not deployed on Vercel.

## Setting it up

Vercel → project → **Settings** → **Environment Variables**. Add both, and set
the environment to **Preview only** — untick Production and Development.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` |
| `RECAPTCHA_SECRET_KEY` | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |

`RECAPTCHA_SECRET_KEY` almost certainly already exists for Production. **Do not
edit that one.** Add a second, Preview-scoped value — Vercel allows the same
name to hold different values per environment.

Redeploy a Preview branch for the variables to take effect.

## Checking it worked

On the Preview URL, the reCAPTCHA widget shows Google's own warning —
*"This reCAPTCHA is for testing purposes only"*. That warning **is** the
confirmation. If you do not see it, the variables have not applied.

Then confirm production is untouched: the widget on `anadyon.gr` must show no
such warning. If it ever does, a Preview variable has leaked into Production —
bookings will already be failing with `REFUSING ALL SUBMISSIONS` in the logs,
which is the guard doing its job. Correct the variable and redeploy.

## What this does and does not enable

Enables submitting the booking and contact forms on Preview without a human
solving a CAPTCHA — so an end-to-end booking, including the price-manipulation
path, can be exercised by a script or by a coding agent.

Does **not** change production behaviour in any way, and does not remove the
CAPTCHA from Preview: the widget still renders and still returns a token. Only
the verification outcome is guaranteed.

## Known wrinkle

`HANDOFF-CODEX-2026-08-23.md` §10.4 records that Preview reCAPTCHA once had
hostname and propagation trouble even after the domain was added. Test a fresh
Preview before relying on this for anything that matters.

## A caution about test data

A Preview deployment uses the **same Supabase project** as production unless
that is separately configured. A booking submitted on Preview therefore creates
a real quote and reservation, and `MAIL_REDIRECT_TO` is what stops the emails
reaching real people. Confirm that variable is set on Preview before submitting
anything, and clean up the rows afterwards — 2R55WT is what happens when a test
booking is left behind.
