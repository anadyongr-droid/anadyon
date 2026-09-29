#!/usr/bin/env node
import { deploymentBoundaryViolations } from "./deployment-boundary-lib.mjs";

const violations = deploymentBoundaryViolations(process.env);
if (violations.length) {
  console.error("Deployment credential boundary failed:");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

if (process.env.VERCEL_ENV === "preview") {
  console.log("Deployment credential boundary passed for Preview.");
}
