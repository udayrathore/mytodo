import { execFileSync } from "node:child_process";
// Release migrations run inside Vercel; production credentials stay on the platform.
// The safe runner retires the historical reset without executing its SQL.
execFileSync(process.execPath, ["scripts/safe-migrate.mjs"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
