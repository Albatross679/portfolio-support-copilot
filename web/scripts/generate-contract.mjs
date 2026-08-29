import { readFile, writeFile } from "node:fs/promises";
const webRoot = new URL("../", import.meta.url);
const contractPath = new URL("api-contract.json", webRoot);
const outputPath = new URL("src/generated/api-contract.ts", webRoot);
const contract = JSON.parse(await readFile(contractPath, "utf8"));

function renderType(schema) {
  if (typeof schema === "string") {
    if (schema === "integer") return "number";
    return schema;
  }
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.ref) return schema.ref;
  if (schema.nullable) return `${renderType(schema.nullable)} | null`;
  if (schema.array) {
    const item = renderType(schema.array);
    return `${item.includes(" | ") ? `(${item})` : item}[]`;
  }
  throw new Error(`Unsupported contract type: ${JSON.stringify(schema)}`);
}

const declarations = Object.entries(contract.types).map(([name, schema]) => {
  if (schema.enum) return `export type ${name} = ${renderType(schema)};`;
  const required = new Set(schema.required);
  const properties = Object.entries(schema.properties).map(([property, type]) =>
    `  ${property}${required.has(property) ? "" : "?"}: ${renderType(type)};`
  );
  return `export interface ${name} {\n${properties.join("\n")}\n}`;
});

const output = `// Generated from api-contract.json by scripts/generate-contract.mjs.\n\n${declarations.join("\n\n")}\n`;
const current = await readFile(outputPath, "utf8").catch(() => "");

if (process.argv.includes("--check")) {
  if (current !== output) {
    process.stderr.write("Generated API contract types are out of date. Run npm run contract:generate.\n");
    process.exitCode = 1;
  }
} else if (current !== output) {
  await writeFile(outputPath, output);
}
