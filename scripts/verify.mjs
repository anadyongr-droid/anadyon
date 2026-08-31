import { spawnSync } from "node:child_process";

const fast = process.argv.includes("--fast");
const root = new URL("../", import.meta.url);

// Verification must not inherit usable production credentials. These values
// are syntactically valid and sufficient for compile/browser checks, while any
// accidental external request fails against an inert host or placeholder key.
const safeEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  RESEND_API_KEY: "placeholder",
  RECAPTCHA_SECRET_KEY: "placeholder",
  SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  SENTRY_ORG: "",
  SENTRY_PROJECT: "",
};

const checks = [
  ["TypeScript", "npm", ["run", "typecheck"]],
  ["ESLint", "npm", ["run", "lint"]],
  ["Unit tests", "npm", ["test"]],
];

if (!fast) {
  checks.push(
    ["Migration replay", "npm", ["run", "check:migration-replay"]],
    ["Production build (local webpack)", "npm", ["run", "build:verify"]],
    ["Translation", "npm", ["run", "check:translation"]],
    ["Static accessibility", "npm", ["run", "check:a11y"]],
    ["SEO", "npm", ["run", "test:seo"]],
    ["Browser tests", "npm", ["run", "test:browser"]],
  );
}

for (const [label, command, args] of checks) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: safeEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`${label} could not start:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status}`;
    console.error(`${label} failed with ${outcome}.`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`\nVerification passed (${fast ? "fast" : "full"}).\n`);
