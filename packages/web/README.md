# LocalCoder Web

Marketing and landing site for [localcoder.ai](https://localcoder.ai), built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

## Development

```bash
bun run --cwd packages/web dev
bun run --cwd packages/web build
bun run --cwd packages/web preview
```

Dev server: http://localhost:4321

## Structure

```
src/
├── assets/
├── content/docs/     # MDX documentation pages
└── content.config.ts
```

Static assets (favicons, OG images) live in `public/`.
