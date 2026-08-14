import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
const expoDirectory = path.dirname(
  requireFromProject.resolve("expo/package.json")
);
const generator = requireFromProject(
  path.join(
    expoDirectory,
    "../@expo/cli/build/src/start/server/type-generation/startTypescriptTypeGeneration"
  )
);

await generator.startTypescriptTypeGenerationAsync({ projectRoot });
