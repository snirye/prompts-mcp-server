/**
 * GitHub repository synchronization using GitHub CLI
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export class GitHubSync {
  constructor(private promptsDir: string) {}

  /**
   * Parse GitHub repository URL and extract repo identifier
   * Supports formats: https://github.com/user/repo, user/repo, github.com/user/repo
   */
  private parseRepoUrl(repoUrl: string): { owner: string; repo: string; fullName: string } {
    // Remove trailing slash
    repoUrl = repoUrl.trim().replace(/\/$/, '');

    // Extract owner/repo from various URL formats
    let match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (match && match[1] && match[2]) {
      return {
        owner: match[1],
        repo: match[2],
        fullName: `${match[1]}/${match[2]}`,
      };
    }

    // Check if it's already in owner/repo format
    match = repoUrl.match(/^([^/]+)\/([^/]+)$/);
    if (match && match[1] && match[2]) {
      return {
        owner: match[1],
        repo: match[2],
        fullName: repoUrl,
      };
    }

    throw new Error(`Invalid GitHub repository URL format: ${repoUrl}`);
  }

  /**
   * Get the expected path where repo should be cloned
   */
  private getRepoPath(repoUrl: string): string {
    const { repo } = this.parseRepoUrl(repoUrl);
    return path.join(this.promptsDir, repo);
  }

  /**
   * Check if GitHub CLI is installed
   */
  private async checkGitHubCLI(): Promise<boolean> {
    try {
      await execAsync('gh --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if GitHub CLI is authenticated
   */
  private async checkGitHubAuth(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('gh auth status');
      return stdout.includes('Logged in');
    } catch {
      return false;
    }
  }

  /**
   * Check if repo folder already exists
   */
  private async repoExists(repoUrl: string): Promise<boolean> {
    const repoPath = this.getRepoPath(repoUrl);
    try {
      const stats = await fs.stat(repoPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Pull latest changes from existing repository
   */
  private async pullRepository(repoUrl: string): Promise<void> {
    const repoPath = this.getRepoPath(repoUrl);
    const branch = process.env.GITHUB_REPO_REF || 'main';
    
    try {
      // Check if it's a valid git repository
      await fs.access(path.join(repoPath, '.git'));
      
      // Try to checkout the specified branch/ref if needed
      try {
        await execAsync(`git checkout ${branch}`, { cwd: repoPath });
      } catch {
        // Branch might not exist or already checked out, continue
      }
      
      await execAsync('git pull', { cwd: repoPath });
      console.error(`Successfully pulled latest changes from ${repoUrl}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to pull repository: ${errorMessage}`);
    }
  }

  /**
   * Clone repository using GitHub CLI
   */
  private async cloneRepository(repoUrl: string): Promise<void> {
    const { fullName } = this.parseRepoUrl(repoUrl);
    const branch = process.env.GITHUB_REPO_REF || 'main';
    
    try {
      // Ensure prompts directory exists
      await fs.mkdir(this.promptsDir, { recursive: true });
      
      // Clone repository
      // gh repo clone creates a subdirectory with the repo name
      const cloneCommand = `gh repo clone ${fullName} ${this.promptsDir} -- --branch ${branch} --depth 1`;
      await execAsync(cloneCommand);
      console.error(`Successfully cloned repository ${repoUrl} into ${this.promptsDir}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to clone repository: ${errorMessage}`);
    }
  }

  /**
   * Main sync method - syncs repository from GitHub
   */
  async syncFromGitHub(): Promise<void> {
    const repoUrl = process.env.GITHUB_REPO_URL;
    
    if (!repoUrl) {
      return; // No GitHub repo configured, skip sync
    }

    try {
      // Check if GitHub CLI is installed
      const cliInstalled = await this.checkGitHubCLI();
      if (!cliInstalled) {
        console.error('Warning: GitHub CLI (gh) is not installed. Skipping GitHub sync.');
        return;
      }

      // Check if GitHub CLI is authenticated
      const cliAuthenticated = await this.checkGitHubAuth();
      if (!cliAuthenticated) {
        console.error('Warning: GitHub CLI is not authenticated. Run "gh auth login" to authenticate. Skipping GitHub sync.');
        return;
      }

      // Check if repo already exists
      const exists = await this.repoExists(repoUrl);
      
      if (exists) {
        // Pull latest changes
        await this.pullRepository(repoUrl);
      } else {
        // Clone repository
        await this.cloneRepository(repoUrl);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error syncing from GitHub: ${errorMessage}`);
      // Don't throw - allow server to continue even if sync fails
    }
  }
}

