/**
 * Caching and file watching functionality for prompt metadata
 */

import fs from 'fs/promises';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import matter from 'gray-matter';
import { PromptInfo, PromptMetadata } from './types.js';

export class PromptCache {
  private cache = new Map<string, PromptInfo>();
  private watcher: FSWatcher | null = null;
  private isWatcherInitialized = false;

  constructor(private promptsDir: string) {}

  /**
   * Get all cached prompts
   */
  getAllPrompts(): PromptInfo[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get a specific prompt from cache
   */
  getPrompt(name: string): PromptInfo | undefined {
    return this.cache.get(name);
  }

  /**
   * Check if cache is empty
   */
  isEmpty(): boolean {
    return this.cache.size === 0;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Recursively find all markdown files in a directory
   */
  private async findMarkdownFiles(dir: string, baseDir: string = dir): Promise<string[]> {
    const mdFiles: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        // Skip hidden files and directories (like .git)
        if (entry.name.startsWith('.')) {
          continue;
        }
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findMarkdownFiles(fullPath, baseDir);
          mdFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          mdFiles.push(relativePath);
        }
      }
    } catch (error) {
      // Ignore errors reading directories (permissions, etc.)
    }
    
    return mdFiles;
  }

  /**
   * Load prompt metadata from a file
   * fileName can be a relative path from promptsDir (e.g., "repo-name/prompt.md" or "prompt.md")
   */
  private async loadPromptMetadata(fileName: string): Promise<PromptInfo | null> {
    const filePath = path.join(this.promptsDir, fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);
      
      // Use the file name (without extension) as the prompt name
      // For nested files, use the full relative path without .md extension
      const name = fileName.replace(/\.md$/, '').replace(/\//g, '_');
      
      return {
        name,
        metadata: parsed.data as PromptMetadata,
        preview: parsed.content.substring(0, 100).replace(/\n/g, ' ').trim() + '...'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load prompt metadata for ${fileName}:`, errorMessage);
      return null;
    }
  }

  /**
   * Update cache for a specific file
   * filePath can be an absolute path or relative path from promptsDir
   */
  private async updateCacheForFile(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;
    
    // Convert absolute path to relative path if needed
    let relativePath: string;
    if (path.isAbsolute(filePath)) {
      relativePath = path.relative(this.promptsDir, filePath);
    } else {
      relativePath = filePath;
    }
    
    const metadata = await this.loadPromptMetadata(relativePath);
    if (metadata) {
      this.cache.set(metadata.name, metadata);
    }
  }

  /**
   * Remove a file from cache
   * filePath can be an absolute path or relative path from promptsDir
   */
  private async removeFromCache(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return;
    
    // Convert absolute path to relative path if needed
    let relativePath: string;
    if (path.isAbsolute(filePath)) {
      relativePath = path.relative(this.promptsDir, filePath);
    } else {
      relativePath = filePath;
    }
    
    const name = relativePath.replace(/\.md$/, '').replace(/\//g, '_');
    this.cache.delete(name);
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
   * Initialize cache by loading all prompt files recursively
   */
  async initializeCache(): Promise<void> {
    await this.ensurePromptsDir();
    
    try {
      // Recursively find all markdown files
      const mdFiles = await this.findMarkdownFiles(this.promptsDir);
      
      // Clear existing cache
      this.cache.clear();
      
      // Load all prompt metadata
      await Promise.all(
        mdFiles.map(async (file) => {
          await this.updateCacheForFile(file);
        })
      );
      
      console.error(`Loaded ${this.cache.size} prompts into cache`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to initialize cache:', errorMessage);
    }
  }

  /**
   * Initialize file watcher to monitor changes recursively
   */
  initializeFileWatcher(): void {
    if (this.isWatcherInitialized) return;
    
    // Watch all .md files recursively
    this.watcher = chokidar.watch(path.join(this.promptsDir, '**/*.md'), {
      ignored: /^\./, // ignore dotfiles
      persistent: true,
      ignoreInitial: true // don't fire events for initial scan
    });

    this.watcher
      .on('add', async (filePath: string) => {
        const relativePath = path.relative(this.promptsDir, filePath);
        console.error(`Prompt added: ${relativePath}`);
        await this.updateCacheForFile(filePath);
      })
      .on('change', async (filePath: string) => {
        const relativePath = path.relative(this.promptsDir, filePath);
        console.error(`Prompt updated: ${relativePath}`);
        await this.updateCacheForFile(filePath);
      })
      .on('unlink', async (filePath: string) => {
        const relativePath = path.relative(this.promptsDir, filePath);
        console.error(`Prompt deleted: ${relativePath}`);
        await this.removeFromCache(filePath);
      })
      .on('error', (error: Error) => {
        console.error('File watcher error:', error);
      });

    this.isWatcherInitialized = true;
    console.error('File watcher initialized for prompts directory (recursive)');
  }

  /**
   * Stop file watcher and cleanup
   */
  async cleanup(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatcherInitialized = false;
    }
  }
}