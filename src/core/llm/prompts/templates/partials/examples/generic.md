### Example 1: TypeScript CLI entry point (no prior context)

Input:

## File information

Path: `src/index.ts`

## Content to analyze
```
#!/usr/bin/env node
import { Command } from "commander";
import { processFiles } from "./processor";

const program = new Command();
program
  .name("file-converter")
  .description("Converts files between different formats")
  .version("1.0.0")
  .option("-i, --input <path>", "input directory path")
  .option("-o, --output <path>", "output directory path")
  .option("-f, --format <type>", "output format (json|xml|csv)", "json")
  .action(async (options) => {
    await processFiles(options.input, options.output, options.format);
  });
program.parse();
```

Output:

```json
{
  "entities": [
    {
      "name": "file-converter",
      "entityType": "product",
      "observations": [
        "Node.js command-line tool that converts files between formats",
        "Version 1.0.0",
        "Supports json, xml, and csv output; defaults to json"
      ]
    },
    {
      "name": "processFiles",
      "entityType": "function",
      "observations": [
        "Performs the conversion given input dir, output dir, and format",
        "Invoked from the CLI action handler"
      ]
    },
    {
      "name": "commander",
      "entityType": "dependency",
      "observations": ["CLI argument-parsing library"]
    }
  ],
  "relations": [
    { "from": "file-converter", "to": "commander",   "relationType": ["depends_on"] },
    { "from": "file-converter", "to": "processFiles", "relationType": ["calls"] }
  ]
}
```

Note: the `--format` option is not its own entity — a configuration value lives as
an observation on the tool it configures. The `fs`/`path` usage in the next file
likewise stays in observations rather than becoming a `file_system` node.

---

### Example 2: Related module (with prior context — extend, don't duplicate)

Input:

## File information

Path: `src/processor.ts`

## Already extracted (do not re-emit)

- **file-converter** (product): Node.js command-line tool that converts files between formats; Version 1.0.0
- **processFiles** (function): Performs the conversion given input dir, output dir, and format

## Content to analyze
```
import * as fs from 'fs';
import * as path from 'path';

export async function processFiles(inputPath: string, outputPath: string, format: string) {
  const files = await fs.promises.readdir(inputPath);
  for (const file of files) {
    const content = await fs.promises.readFile(path.join(inputPath, file), 'utf8');
    const converted = convertToFormat(content, format);
    await fs.promises.writeFile(path.join(outputPath, file), converted);
  }
}

function convertToFormat(content: string, format: string): string {
  switch (format) {
    case 'json': return JSON.stringify({ content });
    case 'xml':  return `<content>${content}</content>`;
    case 'csv':  return `"content"\n"${content.replace(/"/g, '""')}"`;
    default:     return content;
  }
}
```

Output:

```json
{
  "entities": [
    {
      "name": "processFiles",
      "entityType": "function",
      "observations": [
        "Reads every file in the input directory, converts it, and writes it to the output directory",
        "Uses the Node.js fs module for async file I/O"
      ]
    },
    {
      "name": "convertToFormat",
      "entityType": "function",
      "observations": [
        "Serializes content to json, xml, or csv",
        "Escapes embedded quotes for csv output"
      ]
    }
  ],
  "relations": [
    { "from": "processFiles", "to": "convertToFormat", "relationType": ["calls"] }
  ]
}
```

Note: `processFiles` is re-emitted under its exact existing name carrying a *new*
observation (the fs detail), which extends the existing node on merge. `file-converter`
is not re-emitted — it gained nothing here. No `["calls", "uses"]` synonym stacking:
one predicate per edge.

---

### Example 3: Unextractable content → empty graph

Input:

## File information

Path: `build/output.bin`
Chunk 4 of 9

## Content to analyze
```
X H qrewf __TEXT __text eeee 0 n 0 __stubs __TEXT 22e4e __cstring afdsaa __unwind_info
__DATA_CONST __got adsf __la_symbol_ptr __data H __LINKEDIT 0 8 X usr lib dyld
```

Output:

```json
{ "entities": [], "relations": [] }
```
