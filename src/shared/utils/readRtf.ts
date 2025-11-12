import * as fs from "fs";

/**
 * Extract plain text content from parsed RTF document
 * RTF documents have a complex structure with formatting commands,
 * we need to traverse the content and extract just the text
 */
function extractPlainText(document: any): string {
  if (!document || !document.content) {
    return "";
  }

  let plainText = "";

  const extractTextFromContent = (content: any[]): string => {
    let text = "";

    for (const item of content) {
      if (typeof item === "string") {
        text += item;
      } else if (item && typeof item === "object") {
        // Handle different RTF content types
        if (item.type === "text" && item.value) {
          text += item.value;
        } else if (item.type === "paragraph") {
          if (item.content) {
            text += extractTextFromContent(item.content);
          }
          text += "\n"; // Add paragraph break
        } else if (item.type === "span") {
          if (item.content) {
            text += extractTextFromContent(item.content);
          }
          text += "\n"; // Add paragraph break
        } else if (item.content && Array.isArray(item.content)) {
          // Recursively extract from nested content
          text += extractTextFromContent(item.content);
          text += "\n"; // Add paragraph break
        } else if (typeof item.value === "string") {
          text += item.value;
        }
      }
    }

    return text;
  };

  if (Array.isArray(document.content)) {
    plainText = extractTextFromContent(document.content);
  } else if (typeof document.content === "string") {
    plainText = document.content;
  } else {
    // Fallback: try to extract any text-like properties
    const stringifyAndExtract = (obj: any): string => {
      if (typeof obj === "string") return obj;
      if (Array.isArray(obj)) {
        return obj.map(stringifyAndExtract).join("");
      }
      if (obj && typeof obj === "object") {
        let result = "";
        if (obj.value && typeof obj.value === "string") {
          result += obj.value;
        }
        if (obj.content) {
          result += stringifyAndExtract(obj.content);
        }
        return result;
      }
      return "";
    };

    plainText = stringifyAndExtract(document.content);
  }

  // Clean up the extracted text
  return cleanExtractedText(plainText);
}

/**
 * Clean up extracted text by removing excessive whitespace and control characters
 */
function cleanExtractedText(text: string): string {
  return (
    text
      // Remove control characters but keep newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove excessive whitespace but preserve paragraph structure
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      // Trim leading/trailing whitespace
      .trim()
  );
}

/**
 * Extract document information from parsed RTF document
 */
function extractDocumentInfo(document: any): Record<string, any> {
  const info: Record<string, any> = {};

  // Extract document metadata if available
  if (document.metadata) {
    info.metadata = document.metadata;
  }

  // Extract document properties if available
  if (document.props) {
    info.properties = document.props;
  }

  // Extract font table information
  if (document.fonts && Object.keys(document.fonts).length > 0) {
    info.fontCount = Object.keys(document.fonts).length;
    info.fonts = Object.keys(document.fonts).slice(0, 5); // Limit to first 5 fonts
  }

  // Extract color table information
  if (
    document.colors &&
    Array.isArray(document.colors) &&
    document.colors.length > 0
  ) {
    info.colorCount = document.colors.length;
  }

  // Extract style information
  if (document.styles && Object.keys(document.styles).length > 0) {
    info.styleCount = Object.keys(document.styles).length;
  }

  // Extract any document-level properties
  const docProps = [
    "title",
    "subject",
    "author",
    "manager",
    "company",
    "operator",
    "category",
    "keywords",
    "comment",
  ];
  for (const prop of docProps) {
    if (document[prop]) {
      info[prop] = document[prop];
    }
  }

  return info;
}

/**
 * Custom error for RTF reading failures
 */
export class RtfReadError extends Error {
  constructor(message: string, options?: any) {
    super(message);
    this.name = "RtfReadError";
  }
}

export interface RtfDocument {
  text: string;
  info: Record<string, any>;
}

export async function readRtf(path: string): Promise<RtfDocument> {
  // @ts-ignore
  const rtfParser = await import("rtf-parser");
  const rtf = await fs.promises.readFile(path, "utf8");
  return new Promise((resolve, reject) => {
    rtfParser.string(rtf, (err: any, doc: any) => {
      if (err) {
        reject(new RtfReadError(err));
      } else {
        const text = extractPlainText(doc);
        const info = extractDocumentInfo(doc);
        resolve({ text, info });
      }
    });
  });
}
