/**
 * Instala Chromium do Playwright apenas em ambientes que não sejam Vercel.
 * Na Vercel (frontend) o Playwright não é necessário; no Easypanel (backend) sim.
 */
if (process.env.VERCEL !== "1") {
    const { execSync } = require("child_process");
    execSync("npx playwright install chromium --with-deps", { stdio: "inherit" });
}
