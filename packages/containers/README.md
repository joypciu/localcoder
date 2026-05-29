# LocalCoder CI Containers

Prebuilt Docker images for faster GitHub Actions jobs on Linux (`job.container`).

## Images

| Image | Contents |
|-------|----------|
| `base` | Ubuntu 24.04 + common build tools |
| `bun-node` | `base` + Bun + Node.js 24 |
| `rust` | `bun-node` + Rust (stable, minimal) |
| `tauri-linux` | `rust` + Tauri Linux deps |
| `publish` | `bun-node` + Docker CLI + AUR tooling |

## Build

```bash
REGISTRY=ghcr.io/joypciu/localcoder TAG=24.04 bun ./packages/containers/script/build.ts
REGISTRY=ghcr.io/joypciu/localcoder TAG=24.04 bun ./packages/containers/script/build.ts --push
```

## Workflow usage

```yaml
jobs:
  build-cli:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/joypciu/localcoder/build/bun-node:24.04
```

## Notes

- Linux jobs only — macOS/Windows runners cannot use these containers.
- `--push` publishes multi-arch (amd64 + arm64) via Buildx.
- Docker Buildx jobs need host Docker access or privileged `docker-in-docker`.
