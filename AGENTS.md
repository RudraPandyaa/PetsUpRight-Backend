# my-shop Project Instructions

This project was generated with `@vendure/create`.

## Project Layout

- Custom backend code belongs in `src/plugins`
- Runtime configuration is in `src/vendure-config.ts`
- Static assets and email templates live in `static`

## Vendure Development

- Prefer implementing custom functionality as a Vendure plugin.
- Use `npx vendure add` to scaffold plugins, entities, services, API extensions, and job queues.
- Read environment variables in `vendure-config.ts` and pass values into plugins through `Plugin.init()` options.
- Create job queues in `onModuleInit()` or `onApplicationBootstrap()`, then reuse the queue when adding jobs.
- Pass `RequestContext` to Vendure services and `TransactionalConnection` methods when it is available.
- Do not commit `.env` values or generated runtime data.
- Do not use `dbConnectionOptions.synchronize: true` for production data.

## Commands

- Start development: `npm run dev`
- Build: `npm run build`

## Quality Checks

- Run `npm run build` after changing backend code.
- Run targeted tests for the package or feature you changed.
