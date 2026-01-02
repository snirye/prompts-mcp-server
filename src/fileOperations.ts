/**
 * File operations for prompt management (CRUD operations)
 */

import fs from 'fs/promises';
import path from 'path';
import { PromptInfo } from './types.js';
import { PromptCache } from './cache.js';

export class PromptFileOperations {
  constructor(
    private promptsDir: string,
    private cache: PromptCache
  ) {}

  /**
   * List all prompts (uses cache for performance)
   */
  async listPrompts(): Promise<PromptInfo[]> {
    // Initialize cache and file watcher if not already done
    if (this.cache.isEmpty()) {
      await this.cache.initializeCache();
      this.cache.initializeFileWatcher();
    }
    
    return this.cache.getAllPrompts();
  }

  /**
   * Recursively search for a markdown file matching the name
   * Handles names with slashes that represent subdirectory paths (e.g., "repo-name/prompt" -> "repo-name/prompt.md")
   */
  private async findPromptFile(name: string): Promise<string | null> {
    // Recursively search for the file
    const searchDir = async (dir: string, baseDir: string = this.promptsDir): Promise<string | null> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip hidden files and directories
          if (entry.name.startsWith('.')) {
            continue;
          }
          
          if (entry.isDirectory()) {
            const found = await searchDir(fullPath, baseDir);
            if (found) return found;
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            // Check if this file matches the requested name
            // Compare the relative path directly with the name
            const relativePath = path.relative(baseDir, fullPath);
            const pathWithoutExt = relativePath.replace(/\.md$/, '');
            
            // Try exact match with the name (supports '/' in names)
            if (pathWithoutExt === name) {
              return fullPath;
            }
          }
        }
      } catch {
        // Ignore errors (permissions, etc.)
      }
      
      return null;
    };
    
    return await searchDir(this.promptsDir);
  }

  /**
   * Read a specific prompt by name (searches recursively)
   */
  async readPrompt(name: string): Promise<string> {
    const filePath = await this.findPromptFile(name);
    
    if (!filePath) {
      throw new Error(`Prompt "${name}" not found`);
    }
    
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Prompt "${name}" not found`);
    }
  }

  /**
   * Get prompt info from cache (if available)
   */
  getPromptInfo(name: string): PromptInfo | undefined {
    return this.cache.getPrompt(name);
  }
}