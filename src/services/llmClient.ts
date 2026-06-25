import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * LLMClient — wrapper for DeepSeek/OpenAI compatible API.
 * Uses the `openai` npm package with a custom baseURL to support DeepSeek.
 */
export class LLMClient {
  private client: OpenAI | null = null;

  /**
   * Initialize the OpenAI client with DeepSeek base URL.
   */
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: config.llm.apiKey || 'dummy-key',
        baseURL: config.llm.baseUrl,
      });
    }
    return this.client;
  }

  /**
   * Send a chat completion request and return the response text.
   * @param messages - Array of { role, content } messages
   * @param options - Optional parameters (temperature, maxTokens)
   * @returns The assistant's response text
   */
  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    try {
      const client = this.getClient();
      const response = await client.chat.completions.create({
        model: config.llm.model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 1000,
      });

      const content = response.choices[0]?.message?.content || '';
      logger.debug(`LLM response: ${content.substring(0, 100)}...`);
      return content;
    } catch (error) {
      logger.error(`LLM chat failed: ${(error as Error).message}`);
      throw new Error('AI 服务暂时不可用');
    }
  }

  /**
   * Classify text into one of the provided categories.
   * @param text - The text to classify
   * @param categories - Array of category names
   * @returns The best-matching category name
   */
  async classify(text: string, categories: string[]): Promise<string> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: `你是一个宠物问题分类助手。请将用户的问题分类到以下类别之一：${categories.join('、')}。只返回类别名称，不要返回其他内容。`,
      },
      {
        role: 'user',
        content: text,
      },
    ];

    const result = await this.chat(messages, { temperature: 0.1, maxTokens: 50 });

    // Match result against categories (fuzzy)
    const trimmed = result.trim();
    const matched = categories.find((c) => trimmed.includes(c));
    return matched || '其他';
  }

  /**
   * Check if the LLM API is configured and available.
   * Accepts either LLM_API_KEY or DEEPSEEK_API_KEY env vars.
   */
  isConfigured(): boolean {
    const key = config.llm.apiKey;
    return (
      !!key &&
      key !== 'your-deepseek-api-key-here' &&
      key !== 'sk-xxxxx'
    );
  }
}

// Export singleton instance
export const llmClient = new LLMClient();
