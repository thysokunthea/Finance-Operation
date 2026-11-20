<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Required release workflow

The user authorizes publishing completed fixes to GitHub and Vercel as part of each coding task. Continue through release without asking for deployment confirmation again.

1. Finish the requested change and run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build` on Windows (use `npm` on other platforms). Resolve failures before publishing.
2. Review the diff and stage only the changes belonging to the task. Keep `.env`, credentials, generated build output, and local Vercel files out of Git. Preserve unrelated work.
3. Commit with a clear description and push to the `github` remote: `https://github.com/thysokunthea/Finance-Operation.git`. Never force-push or replace another contributor's work. The production branch is `vercel-deployment`.
4. Vercel's Git integration automatically builds pushes to `vercel-deployment` for project `ledgerflow-finance-operations` (`prj_KlA1mlsp6BDywUA9wo4ti98HN4kX`), team `team_kbvaDDILZizHTxhJT61FwdoH`. Other branches receive previews. The versioned Vercel build command runs the workflow tests before building. Do not also run a CLI deployment for the same push while its Git deployment is running.
5. Wait for the deployment matching the pushed commit to reach READY. Check the live `/api/health` response, `/sign-in`, and relevant changed routes. Financial APIs must still reject signed-out requests. Never claim a signed-in workflow was tested without doing so.
6. Report the GitHub commit, deployment result, and live URL: https://ledgerflow-finance-operations.vercel.app. If authentication, GitHub, or Vercel blocks a release, report the precise blocker and continue all unaffected work.

Do not install Git hooks that automatically commit or publish unfinished edits. The release starts after the requested fix is complete and validated.
