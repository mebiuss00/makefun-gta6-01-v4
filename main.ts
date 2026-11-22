// Palmera Heat: Vice Empire — handover program for the make.fun gta6-01 entry.
//
// Running this file on Node 22 stages the finished game for grading: the
// static files under game/ and the captures under screenshots/ are mirrored
// into the destination folder, and a dossier describing that exact staging
// is generated with the vendored library and stored beside them as
// dossier.json. The grader supplies /output as the destination; anywhere
// else the MAKEFUN_OUTPUT_DIR environment variable names it instead.
//
// The staging is deliberately boring and reproducible. Folder entries are
// visited in sorted name order, files are copied one by one, and nothing is
// fetched, timed or randomised, so two runs over the same repository leave
// byte-identical results.

import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The limits handed to buildDossier, taken from the vendored library's
// header: how much source text the dossier may carry, how many screenshots
// it may hold and how large each may be, and the size ceiling for game/.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

// The two payload folders this program publishes, in publishing order.
const PAYLOAD_FOLDERS = ['game', 'screenshots'] as const;

// The repository root is wherever this file sits, so the program works no
// matter which directory it happens to be launched from.
const repoRoot = dirname(fileURLToPath(import.meta.url));

// Resolve the destination once, up front: the grader's /output by default,
// or the stand-in named by the environment when one is provided.
const stagingDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** Code-unit comparison of two entry names, so sorting never depends on locale. */
function byEntryName(left: { name: string }, right: { name: string }): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

/**
 * Mirror one directory tree into another, creating folders as needed.
 * Entries are handled in sorted order so the walk is deterministic, and
 * anything that is neither a plain file nor a folder aborts the run rather
 * than being silently skipped or followed.
 */
function mirrorTree(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });

  const entries = readdirSync(sourceDir, { withFileTypes: true });
  entries.sort(byEntryName);

  for (const entry of entries) {
    const fromPath = join(sourceDir, entry.name);
    const toPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      mirrorTree(fromPath, toPath);
    } else if (entry.isFile()) {
      copyFileSync(fromPath, toPath);
    } else {
      throw new Error(`refusing to stage non-file entry: ${fromPath}`);
    }
  }
}

// Stage each payload folder from the repository into the destination.
for (const folder of PAYLOAD_FOLDERS) {
  mirrorTree(join(repoRoot, folder), join(stagingDir, folder));
}

// Build the dossier from the staged copy itself — the grader rebuilds it
// from the same files and expects the bytes to match — then save the exact
// bytes the library returns as dossier.json.
const dossierBytes = buildDossier(stagingDir, DOSSIER_LIMITS);
writeFileSync(join(stagingDir, 'dossier.json'), dossierBytes);
