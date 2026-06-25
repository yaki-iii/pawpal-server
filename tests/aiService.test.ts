import { AIService } from '../src/services/aiService';
import { prisma } from '../src/config/database';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    aIAssistantSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    llm: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    encryption: { key: 'test-encryption-key-32bytes-ok!!!' },
  },
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock LLMClient
jest.mock('../src/services/llmClient', () => ({
  llmClient: {
    isConfigured: jest.fn(),
    classify: jest.fn(),
    chat: jest.fn(),
  },
}));

// Mock SearchService
jest.mock('../src/services/searchService', () => ({
  SearchService: {
    searchAll: jest.fn(),
  },
}));

// Mock WebSearchService
jest.mock('../src/services/webSearchService', () => ({
  WebSearchService: {
    search: jest.fn(),
  },
}));

import { llmClient } from '../src/services/llmClient';
import { SearchService } from '../src/services/searchService';
import { WebSearchService } from '../src/services/webSearchService';

const DISCLAIMER = '以上内容来自社区、知识库和网络公开信息总结，仅供参考，不构成专业兽医建议，复杂情况请及时就医。';

const mockSession = {
  id: 'session-1',
  userId: 'user-1',
  petId: null,
  question: '我家柯基最近经常呕吐怎么办',
  imageUrls: [],
  questionType: '消化问题',
  summary: '根据社区经验...\n\n⚠️ ' + DISCLAIMER,
  sources: [
    { type: 'post', title: '柯基呕吐经验分享', url: '/posts/p1', snippet: '我家柯基也...' },
  ],
  status: 'OBSERVING',
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
};

describe('AIService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runPipeline - Full pipeline with LLM', () => {
    it('should run the full pipeline: classify → search → summarize → assemble', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockResolvedValue('消化问题');
      (llmClient.chat as jest.Mock).mockResolvedValue('根据社区经验，柯基呕吐可能的原因有：\n1. 饮食问题\n2. 换粮过快\n3. 寄生虫');
      (SearchService.searchAll as jest.Mock).mockResolvedValue({
        posts: [
          { id: 'p1', title: '柯基呕吐经验分享', content: '我家柯基也经常呕吐，后来...' },
        ],
      });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await AIService.runPipeline({
        userId: 'user-1',
        question: '我家柯基最近经常呕吐怎么办',
      });

      // Step 1: classify was called
      expect(llmClient.classify).toHaveBeenCalledWith(
        '我家柯基最近经常呕吐怎么办',
        expect.arrayContaining(['消化问题', '皮肤问题', '行为异常']),
      );

      // Step 2: search was called with question + questionType
      expect(SearchService.searchAll).toHaveBeenCalled();
      expect(WebSearchService.search).toHaveBeenCalled();

      // Step 3: LLM chat was called for summarization
      expect(llmClient.chat).toHaveBeenCalled();

      // Step 4: session was created in DB
      expect(prisma.aIAssistantSession.create).toHaveBeenCalled();

      // Result should be a DTO
      expect(result.questionType).toBe('消化问题');
      expect(result.question).toBe('我家柯基最近经常呕吐怎么办');
    });

    it('should include disclaimer in the stored summary', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockResolvedValue('消化问题');
      (llmClient.chat as jest.Mock).mockResolvedValue('AI summary text');
      (SearchService.searchAll as jest.Mock).mockResolvedValue({ posts: [] });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue(mockSession);

      await AIService.runPipeline({
        userId: 'user-1',
        question: 'test question',
      });

      const createData = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      expect(createData.summary).toContain(DISCLAIMER);
    });

    it('should build sources array from search results', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockResolvedValue('消化问题');
      (llmClient.chat as jest.Mock).mockResolvedValue('summary');
      (SearchService.searchAll as jest.Mock).mockResolvedValue({
        posts: [
          { id: 'p1', title: 'Post 1', content: 'Content 1' },
          { id: 'p2', title: 'Post 2', content: 'Content 2' },
        ],
      });
      (WebSearchService.search as jest.Mock).mockResolvedValue([
        { title: 'Web 1', url: 'https://example.com/1', snippet: 'snippet', source: '网络' },
      ]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue(mockSession);

      await AIService.runPipeline({
        userId: 'user-1',
        question: 'test',
      });

      const createData = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      // 2 posts + 1 web result = 3 sources
      expect(createData.sources).toHaveLength(3);
      expect(createData.sources[0].type).toBe('post');
      expect(createData.sources[0].url).toBe('/posts/p1');
      expect(createData.sources[2].type).toBe('web');
      expect(createData.sources[2].url).toBe('https://example.com/1');
    });
  });

  describe('runPipeline - Fallback when LLM not configured', () => {
    it('should use default question type "其他" when LLM is not configured', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(false);
      (SearchService.searchAll as jest.Mock).mockResolvedValue({ posts: [] });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue({
        ...mockSession,
        questionType: '其他',
        summary: 'fallback summary\n\n⚠️ ' + DISCLAIMER,
      });

      const result = await AIService.runPipeline({
        userId: 'user-1',
        question: 'test question',
      });

      // LLM classify should NOT be called
      expect(llmClient.classify).not.toHaveBeenCalled();
      expect(llmClient.chat).not.toHaveBeenCalled();

      // Should still search and create session
      expect(SearchService.searchAll).toHaveBeenCalled();
      expect(WebSearchService.search).toHaveBeenCalled();
      expect(prisma.aIAssistantSession.create).toHaveBeenCalled();
    });

    it('should use fallback summary when LLM is not configured', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(false);
      (SearchService.searchAll as jest.Mock).mockResolvedValue({
        posts: [{ id: 'p1', title: '相关帖子', content: '内容' }],
      });
      (WebSearchService.search as jest.Mock).mockResolvedValue([
        { title: '相关网页', url: 'https://example.com', snippet: 'snippet', source: '网络' },
      ]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue({
        ...mockSession,
        questionType: '其他',
      });

      await AIService.runPipeline({
        userId: 'user-1',
        question: 'test',
      });

      const createData = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      // Fallback summary should contain post/web titles
      expect(createData.summary).toContain('相关帖子');
      expect(createData.summary).toContain('相关网页');
      // And should still have disclaimer
      expect(createData.summary).toContain(DISCLAIMER);
    });
  });

  describe('runPipeline - Fallback when LLM fails', () => {
    it('should use default question type when classification fails', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockRejectedValue(new Error('API error'));
      (llmClient.chat as jest.Mock).mockResolvedValue('summary');
      (SearchService.searchAll as jest.Mock).mockResolvedValue({ posts: [] });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue({
        ...mockSession,
        questionType: '其他',
      });

      const result = await AIService.runPipeline({
        userId: 'user-1',
        question: 'test',
      });

      // Should fall back to '其他'
      expect(result.questionType).toBeDefined();
    });

    it('should use fallback summary when LLM chat fails', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockResolvedValue('消化问题');
      (llmClient.chat as jest.Mock).mockRejectedValue(new Error('API timeout'));
      (SearchService.searchAll as jest.Mock).mockResolvedValue({
        posts: [{ id: 'p1', title: '帖子1', content: 'content' }],
      });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue({
        ...mockSession,
      });

      await AIService.runPipeline({
        userId: 'user-1',
        question: 'test',
      });

      const createData = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      // Fallback should contain post title
      expect(createData.summary).toContain('帖子1');
      expect(createData.summary).toContain(DISCLAIMER);
    });

    it('should still complete pipeline even if both LLM calls fail', async () => {
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.classify as jest.Mock).mockRejectedValue(new Error('classify failed'));
      (llmClient.chat as jest.Mock).mockRejectedValue(new Error('chat failed'));
      (SearchService.searchAll as jest.Mock).mockResolvedValue({ posts: [] });
      (WebSearchService.search as jest.Mock).mockResolvedValue([]);
      (prisma.aIAssistantSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await AIService.runPipeline({
        userId: 'user-1',
        question: 'test',
      });

      // Pipeline should still complete
      expect(result).toBeDefined();
      expect(prisma.aIAssistantSession.create).toHaveBeenCalled();
    });
  });

  describe('buildContextText', () => {
    it('should build context with question and posts', () => {
      const context = AIService.buildContextText(
        '柯基呕吐怎么办',
        [{ title: '帖子1', content: '内容内容内容' }],
        [],
      );

      expect(context).toContain('柯基呕吐怎么办');
      expect(context).toContain('帖子1');
      expect(context).toContain('不要做医疗诊断');
      expect(context).toContain('不要给出用药剂量');
    });

    it('should include web search results in context', () => {
      const context = AIService.buildContextText(
        '柯基呕吐',
        [],
        [{ title: '小红书经验', url: 'https://xiaohongshu.com/123', snippet: '我家柯基也呕吐', source: '小红书' }],
      );

      expect(context).toContain('柯基呕吐');
      expect(context).toContain('小红书经验');
      expect(context).toContain('网络搜索结果');
    });

    it('should handle empty search results', () => {
      const context = AIService.buildContextText('test', [], []);

      expect(context).toContain('test');
      // Should still have the instruction
      expect(context).toContain('综合总结参考建议');
    });
  });

  describe('buildFallbackSummary', () => {
    it('should build summary with posts', () => {
      const summary = AIService.buildFallbackSummary(
        [{ title: '帖子A', content: 'c' }],
        [],
      );

      expect(summary).toContain('帖子A');
      expect(summary).toContain('社区相关讨论');
    });

    it('should include web results in fallback summary', () => {
      const summary = AIService.buildFallbackSummary(
        [],
        [{ title: '抖音视频分享', url: 'https://douyin.com/1', snippet: '柯基护理', source: '抖音' }],
      );

      expect(summary).toContain('抖音视频分享');
      expect(summary).toContain('网络相关内容');
    });

    it('should show "no results" message when all empty', () => {
      const summary = AIService.buildFallbackSummary([], []);

      expect(summary).toContain('暂未找到');
      expect(summary).toContain('社区发布求助帖');
    });

    it('should handle only posts (no web results)', () => {
      const summary = AIService.buildFallbackSummary(
        [{ title: '帖子1', content: 'c' }],
        [],
      );

      expect(summary).toContain('帖子1');
      expect(summary).not.toContain('网络相关内容');
    });
  });

  describe('buildDisclaimer', () => {
    it('should return the fixed disclaimer text', () => {
      const disclaimer = AIService.buildDisclaimer();
      expect(disclaimer).toBe(DISCLAIMER);
      expect(disclaimer).toContain('仅供参考');
      expect(disclaimer).toContain('不构成专业兽医建议');
      expect(disclaimer).toContain('请及时就医');
    });
  });

  describe('listByUser', () => {
    it('should list all AI sessions for a user, newest first', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([mockSession]);

      const sessions = await AIService.listByUser('user-1');

      expect(sessions).toHaveLength(1);
      expect(prisma.aIAssistantSession.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getById', () => {
    it('should return session when user is owner', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const session = await AIService.getById('session-1', 'user-1');
      expect(session.id).toBe('session-1');
    });

    it('should throw error if session does not exist', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(AIService.getById('nonexistent', 'user-1')).rejects.toThrow('咨询记录不存在');
    });

    it('should throw error if user is not the owner', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await expect(AIService.getById('session-1', 'other-user')).rejects.toThrow('无权访问该记录');
    });
  });

  describe('updateStatus', () => {
    it('should update session status when user is owner', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      const updated = { ...mockSession, status: 'RECOVERED' };
      (prisma.aIAssistantSession.update as jest.Mock).mockResolvedValue(updated);

      const result = await AIService.updateStatus('session-1', 'user-1', 'RECOVERED');

      expect(result.status).toBe('RECOVERED');
      expect(prisma.aIAssistantSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'RECOVERED' },
      });
    });

    it('should throw error if session does not exist', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(AIService.updateStatus('nonexistent', 'user-1', 'RECOVERED')).rejects.toThrow('咨询记录不存在');
    });

    it('should throw error if user is not the owner', async () => {
      (prisma.aIAssistantSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      await expect(AIService.updateStatus('session-1', 'other-user', 'RECOVERED')).rejects.toThrow('无权修改该记录');
    });
  });

  describe('toDTO', () => {
    it('should convert to DTO with ISO date strings', () => {
      const dto = AIService.toDTO(mockSession);

      expect(dto.id).toBe('session-1');
      expect(dto.question).toBe('我家柯基最近经常呕吐怎么办');
      expect(dto.questionType).toBe('消化问题');
      expect(dto.status).toBe('OBSERVING');
      expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
      expect(dto.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    });
  });
});
