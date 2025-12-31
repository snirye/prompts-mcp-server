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
   * Sanitize filename to be filesystem-safe
   */
  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  }

  /**
   * Ensure prompts directory exists
   */
  private async ensurePromptsDir(): Promise<void> {
    try {
      await fs.access(this.promptsDir);
    } catch {
      await fs.mkdir(this.promptsDir, { recursive: true });
    }
  }

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
    // First try direct path (for backward compatibility with sanitized names)
    const sanitizedName = this.sanitizeFileName(name);
    const targetFileName = sanitizedName + '.md';
    const directPath = path.join(this.promptsDir, targetFileName);
    try {
      await fs.access(directPath);
      return directPath;
    } catch {
      // Not found at root, search recursively
    }
    
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
            
            // Also try matching with sanitized name for backward compatibility
            if (this.sanitizeFileName(pathWithoutExt) === sanitizedName) {
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
   * Save a new prompt or update existing one
   */
  async savePrompt(name: string, content: string): Promise<string> {
    await this.ensurePromptsDir();
    const fileName = this.sanitizeFileName(name) + '.md';
    const filePath = path.join(this.promptsDir, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    return fileName;
  }

  /**
   * Save a new prompt with a custom filename
   */
  async savePromptWithFilename(filename: string, content: string): Promise<string> {
    await this.ensurePromptsDir();
    const sanitizedFileName = this.sanitizeFileName(filename) + '.md';
    const filePath = path.join(this.promptsDir, sanitizedFileName);
    await fs.writeFile(filePath, content, 'utf-8');
    return sanitizedFileName;
  }

  /**
   * Delete a prompt by name
   */
  async deletePrompt(name: string): Promise<boolean> {
    const fileName = this.sanitizeFileName(name) + '.md';
    const filePath = path.join(this.promptsDir, fileName);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      throw new Error(`Prompt "${name}" not found`);
    }
  }

  /**
   * Check if a prompt exists
   */
  async promptExists(name: string): Promise<boolean> {
    const fileName = this.sanitizeFileName(name) + '.md';
    const filePath = path.join(this.promptsDir, fileName);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get prompt info from cache (if available)
   */
  getPromptInfo(name: string): PromptInfo | undefined {
    return this.cache.getPrompt(name);
  }
}