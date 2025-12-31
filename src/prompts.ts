/**
 * MCP prompts handler - exposes prompts from the prompts folder as MCP prompts
 */

import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsResult,
  GetPromptResult,
  Prompt,
  PromptMessage,
} from '@modelcontextprotocol/sdk/types.js';
import { PromptFileOperations } from './fileOperations.js';
import { PromptInfo } from './types.js';
import matter from 'gray-matter';

export class PromptHandlers {
  constructor(private fileOps: PromptFileOperations) {}

  /**
   * Convert PromptInfo to MCP Prompt format
   */
  private promptInfoToMCPPrompt(promptInfo: PromptInfo): Prompt {
    return {
      name: promptInfo.name,
      title: promptInfo.metadata.title || promptInfo.name,
      description: promptInfo.metadata.description || promptInfo.preview,
    };
  }

  /**
   * Handle prompts/list request
   */
  async handleListPrompts(): Promise<ListPromptsResult> {
    const prompts = await this.fileOps.listPrompts();
    
    const mcpPrompts: Prompt[] = prompts.map((prompt) =>
      this.promptInfoToMCPPrompt(prompt)
    );

    return {
      prompts: mcpPrompts,
    };
  }

  /**
   * Handle prompts/get request
   */
  async handleGetPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    try {
      const content = await this.fileOps.readPrompt(name);
      const parsed = matter(content);
      
      // Get prompt info for metadata
      const promptInfo = this.fileOps.getPromptInfo(name);
      
      // Replace arguments in the prompt content if provided
      let promptText = parsed.content;
      if (args) {
        for (const [key, value] of Object.entries(args)) {
          // Replace {{key}} or {key} patterns
          promptText = promptText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
          promptText = promptText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }
      }

      // Create a user message with the prompt content
      const message: PromptMessage = {
        role: 'user',
        content: {
          type: 'text',
          text: promptText,
        },
      };

      return {
        description: promptInfo?.metadata.description,
        messages: [message],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Prompt "${name}" not found: ${errorMessage}`);
    }
  }
}

