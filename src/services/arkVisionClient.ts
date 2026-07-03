import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface ArkVisionRequest {
  systemPrompt: string;
  history: Array<{ role?: string | null; question: string; summary: string }>;
  message: string;
  imageUrls: string[];
}

export class ArkVisionClient {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: config.ark.apiKey || 'dummy-key',
        baseURL: config.ark.baseUrl,
      });
    }
    return this.client;
  }

  isConfigured(): boolean {
    const key = config.ark.apiKey;
    return !!key && key !== 'your-ark-api-key-here' && key.startsWith('ark-');
  }

  async analyzeImages(request: ArkVisionRequest): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Ark vision is not configured');
    }

    const client = this.getClient();
    const historyText = request.history
      .slice(-6)
      .map((item) => {
        const role = item.role === 'assistant' ? 'AI' : '用户';
        const content = item.role === 'assistant' ? item.summary : item.question;
        return `${role}: ${content}`;
      })
      .filter((line) => line.trim().length > 0)
      .join('\n');

    const text = [
      request.systemPrompt,
      '',
      '你现在可以查看用户上传的图片。请基于图片可见信息和用户文字描述回答，但不要做确诊，不要给出具体用药剂量。',
      '如果图片信息不足，请明确说明需要补充哪些症状和时间信息。',
      historyText ? `\n历史对话：\n${historyText}` : '',
      `\n用户本次问题：${request.message || '请根据图片给出初步观察建议。'}`,
    ].join('\n');

    try {
      const response = await client.responses.create({
        model: config.ark.visionModel,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text },
              ...request.imageUrls.map((url) => ({
                type: 'input_image' as const,
                image_url: url,
                detail: 'auto' as const,
              })),
            ],
          },
        ],
      });

      const outputText = (response as { output_text?: string }).output_text?.trim();
      if (!outputText) {
        throw new Error('Ark vision returned empty response');
      }
      return outputText;
    } catch (error) {
      logger.warn(`Ark vision call failed: ${(error as Error).message}`);
      throw new Error('图片识别服务暂时不可用');
    }
  }
}

export const arkVisionClient = new ArkVisionClient();
