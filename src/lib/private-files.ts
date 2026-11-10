import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import { StoreError } from "@/lib/errors";

const root = path.join(process.cwd(), "data", "private-docs");

export async function writePrivateFile(relativePath: string, bytes: Buffer): Promise<void> {
  const full = resolveInside(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

export async function readPrivateFile(relativePath: string): Promise<Buffer> {
  const full = resolveInside(relativePath);
  try {
    return await readFile(full);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new StoreError("That document could not be found.", 404);
    }
    throw new StoreError("That document could not be read.", 500);
  }
}

export async function removePrivateFile(relativePath: string): Promise<void> {
  const full = resolveInside(relativePath);
  await rm(full, { force: true });
}

function resolveInside(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new StoreError("That document could not be found.", 404);
  }
  const full = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new StoreError("That document could not be found.", 404);
  }
  return full;
}
