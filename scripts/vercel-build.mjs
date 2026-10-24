import { execFileSync } from "node:child_process";
// Build first: a compile failure must not change the production database.
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
if (process.env.VERCEL_ENV === "production") {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
}
