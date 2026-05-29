import fs from "fs"
import path from "path"
import { envFlag } from "../lib/env"
import { DESKTOP, DESKTOP_EXE, DESKTOP_INSTALLER, EXE, PKG, fileSizeMb, findPortableExe, resolveBun } from "../lib/paths"
import { runCmdInherit } from "../lib/runner"

const BUN = resolveBun()

export async function stepBuildStandalone(): Promise<string> {
  if (envFlag("E2E_SKIP_STANDALONE")) return "skipped (E2E_SKIP_STANDALONE=1)"
  const code = await runCmdInherit(BUN, ["run", "build:win-standalone"], {
    cwd: PKG,
    env: { LOCALCODER_FAST_PACK: "1" },
  })
  if (code !== 0) throw new Error(`build:win-standalone exited ${code}`)
  const portable = findPortableExe()
  if (portable) {
    const p = path.join(DESKTOP, "dist", portable)
    return `portable ${fileSizeMb(p)} MB`
  }
  if (fs.existsSync(DESKTOP_EXE)) return `unpacked ${fileSizeMb(DESKTOP_EXE)} MB`
  throw new Error("no portable exe or win-unpacked/LocalCoder.exe after build")
}

export async function stepDesktopArtifacts(): Promise<string> {
  if (!fs.existsSync(DESKTOP_EXE)) {
    if (envFlag("E2E_BUILD_DESKTOP_IF_MISSING")) {
      for (const script of ["prebuild", "build", "package:win"]) {
        const code = await runCmdInherit(BUN, ["run", script], { cwd: DESKTOP })
        if (code !== 0) throw new Error(`${script} exited ${code}`)
      }
    }
  }
  if (!fs.existsSync(DESKTOP_EXE)) throw new Error(`missing ${DESKTOP_EXE}`)
  const parts = [`LocalCoder.exe ${fileSizeMb(DESKTOP_EXE)} MB`]
  const portable = findPortableExe()
  if (portable) parts.push(`portable ${fileSizeMb(path.join(DESKTOP, "dist", portable))} MB`)
  if (fs.existsSync(DESKTOP_INSTALLER)) parts.push("installer present")
  if (fs.existsSync(EXE)) parts.push(`CLI ${fileSizeMb(EXE)} MB`)
  return parts.join(", ")
}

export async function stepCliBinarySize(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const mb = Number(fileSizeMb(EXE))
  if (mb < 50) throw new Error(`CLI exe suspiciously small: ${mb} MB`)
  return `${fileSizeMb(EXE)} MB`
}
