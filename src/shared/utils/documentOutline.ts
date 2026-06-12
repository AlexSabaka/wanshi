import { default as DocumentOutline } from "document-outline-gen"

/** Subset of document-outline-gen's GeneratorOptions we expose via config. */
export interface OutlineGeneratorOptions {
  maxDepth?: number;
  includeLineNumbers?: boolean;
  includePrivate?: boolean;
  includeComments?: boolean;
}

export class DocumentOutlineGenerator {
  static async generateOutlineFromContent(
    content: string,
    extension: string,
    options?: OutlineGeneratorOptions
  ) {
    const generator = new DocumentOutline();
    // Skip extensions the generator can't handle (e.g. .txt, and languages the
    // installed build doesn't cover yet) instead of letting generateFromContent
    // throw a "No generator found" per chunk — that warning was pure noise on a
    // heterogeneous corpus (KG-17). This is the kg-gen-side stand-in for the
    // upstream `generateFromContentSafe` (see docs/inbox outline-gen wiring note,
    // task #1); swap to that once the rebuilt document-outline-gen is merged.
    if (!generator.isSupported(extension)) return "";
    const outline = await generator.generateFromContent(content, extension, options);
    return DocumentOutlineGenerator.formatAsTree(outline);
  }

  private static formatMetadata(metadata: Record<string, any>): string {
    const parts: string[] = [];

    if (metadata.visibility && metadata.visibility !== "public") {
      parts.push(metadata.visibility);
    }

    if (metadata.isStatic) {
      parts.push("static");
    }

    if (metadata.isAbstract) {
      parts.push("abstract");
    }

    if (metadata.parameters && metadata.parameters.length > 0) {
      const params = metadata.parameters.map((p: any) => p.name).join(", ");
      parts.push(`params: ${params}`);
    }

    if (metadata.dataType) {
      parts.push(`type: ${metadata.dataType}`);
    }

    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
  }

  private static formatAsTree(nodes: any[], depth: number = 0): string {
    let result = "";
    const indent = "  ".repeat(depth);

    for (const node of nodes) {
      const line = node.line ? ` (line ${node.line})` : "";
      const metadata = node.metadata
        ? DocumentOutlineGenerator.formatMetadata(node.metadata)
        : "";
      result += `${indent}├─ ${node.title} [${node.type}]${line}${metadata}\n`;

      if (node.children && node.children.length > 0) {
        result += DocumentOutlineGenerator.formatAsTree(
          node.children,
          depth + 1
        );
      }
    }

    return result;
  }
}
