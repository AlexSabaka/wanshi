import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { logger } from '../logger';

export interface DirectoryTreeOptions {
  filter?: string;
  maxDepth?: number;
  excludePatterns?: string[];
  includeHidden?: boolean;
}

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * Generate a directory tree structure with filtering support
 */
export class DirectoryTreeGenerator {
  /**
   * Generate a tree structure for a directory
   */
  static async generateTree(
    dirPath: string,
    options: DirectoryTreeOptions = {}
  ): Promise<TreeNode[]> {
    const {
      filter = '**/*',
      maxDepth = 10,
      excludePatterns = [],
      includeHidden = false
    } = options;

    return this.buildTree(dirPath, filter, excludePatterns, includeHidden, 0, maxDepth);
  }

  /**
   * Generate a text representation of the directory tree
   */
  static async generateTextTree(
    dirPath: string,
    options: DirectoryTreeOptions = {}
  ): Promise<string> {
    const tree = await this.generateTree(dirPath, options);
    return this.treeToText(tree, '', true);
  }

  /**
   * Recursively build the tree structure
   */
  private static async buildTree(
    dirPath: string,
    filter: string,
    excludePatterns: string[],
    includeHidden: boolean,
    currentDepth: number,
    maxDepth: number
  ): Promise<TreeNode[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const nodes: TreeNode[] = [];

      for (const entry of entries) {
        // Skip hidden files if not included
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        // Skip excluded patterns
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        if (excludePatterns.some(pattern => minimatch(relativePath, pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          // For directories, check if any child would match the filter
          const children = await this.buildTree(
            fullPath,
            filter,
            excludePatterns,
            includeHidden,
            currentDepth + 1,
            maxDepth
          );

          // Only include directory if it has matching children or matches filter itself
          if (children.length > 0 || minimatch(relativePath, filter)) {
            nodes.push({
              name: entry.name,
              type: 'directory',
              children
            });
          }
        } else if (entry.isFile()) {
          // Check if file matches the filter
          if (minimatch(relativePath, filter) || minimatch(entry.name, filter)) {
            nodes.push({
              name: entry.name,
              type: 'file'
            });
          }
        }
      }

      // Sort: directories first, then files, alphabetically
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    } catch (error) {
      logger.error(`Failed to read directory ${dirPath}: ${error}`);
      return [];
    }
  }

  /**
   * Convert tree structure to text representation
   */
  private static treeToText(
    nodes: TreeNode[],
    prefix: string = '',
    isRoot: boolean = false
  ): string {
    let result = '';

    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';

      if (!isRoot) {
        result += prefix + connector + node.name + '\n';
      } else {
        result += node.name + '\n';
      }

      if (node.children && node.children.length > 0) {
        const childPrefix = isRoot ? '' : prefix + extension;
        result += this.treeToText(node.children, childPrefix, false);
      }
    });

    return result;
  }

  /**
   * Get a filtered list of files (flat, not tree)
   */
  static async getFilteredFiles(
    dirPath: string,
    filter: string,
    excludePatterns: string[] = []
  ): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(dirPath, fullPath);

        // Skip excluded patterns
        if (excludePatterns.some(pattern => minimatch(relativePath, pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          if (minimatch(relativePath, filter) || minimatch(entry.name, filter)) {
            files.push(fullPath);
          }
        }
      }
    }

    await walk(dirPath);
    return files;
  }
}