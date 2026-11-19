import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const absolute = path.join(process.cwd(), "src", specifier.slice(2));
    const withExt = absolute.endsWith(".ts") || absolute.endsWith(".js") ? absolute : `${absolute}.ts`;
    return nextResolve(pathToFileURL(withExt).href, context);
  }
  return nextResolve(specifier, context);
}
