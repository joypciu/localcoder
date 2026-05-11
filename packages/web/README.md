# localcoder web

The [localcoder.ai](https://localcoder.ai) marketing and landing page, built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build).

## Development

```bash
bun run --cwd packages/web dev      # dev server at http://localhost:4321
bun run --cwd packages/web build    # production build → dist/
bun run --cwd packages/web preview  # preview the production build locally
```

## Structure

```
src/
├── assets/       images, screenshots, icons
├── content/
│   └── docs/     Markdown / MDX documentation pages (route = filename)
└── content.config.ts
```

Static assets (favicons, og images) go in `public/`.
