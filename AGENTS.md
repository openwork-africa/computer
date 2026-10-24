# For agents

To use Computer (drive the person's signed-in Firefox), read [skills/computer/SKILL.md](skills/computer/SKILL.md).

To work on this repo: `bun install`, `bun test`, `bun run typecheck`. The layout is in the README under
[Develop](README.md#develop). `src/sdk.ts` is the one API that the CLI and the server both use: add behaviour there,
then a line in the command table of `src/cli.ts` and, if the page needs it, `src/server.ts`.
