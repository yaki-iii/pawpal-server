import { ChatService } from '../src/services/chatService';
import { prisma } from '../src/config/database';
import { llmClient } from '../src/services/llmClient';

// Mock Prisma
jest.mock('../src/config/database', () => ({
  prisma: {
    aIAssistantSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
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
    chat: jest.fn(),
  },
}));

// Mock AIService (for getSystemPrompt)
jest.mock('../src/services/aiService', () => ({
  AIService: {
    getSystemPrompt: jest.fn().mockReturnValue('system prompt'),
    toDTO: jest.fn().mockImplementation((session) => ({
      id: session.id,
      userId: session.userId,
      petId: session.petId,
      question: session.question,
      imageUrls: session.imageUrls,
      questionType: session.questionType,
      summary: session.summary,
      sources: session.sources,
      resultCard: session.sources?.find?.((source: { type?: string }) => source.type === 'resultCard')?.card,
      status: session.status,
      conversationId: session.conversationId,
      role: session.role,
      parentId: session.parentId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    })),
  },
}));

const mockUserMessage = {
  id: 'msg-1',
  userId: 'user-1',
  petId: null,
  question: '柯基呕吐怎么办',
  imageUrls: [],
  questionType: '',
  summary: '',
  sources: [],
  status: 'OBSERVING',
  conversationId: 'conv-1',
  role: 'user',
  parentId: null,
  createdAt: new Date('2026-06-01T10:00:00Z'),
  updatedAt: new Date('2026-06-01T10:00:00Z'),
};

const mockAssistantMessage = {
  id: 'msg-2',
  userId: 'user-1',
  petId: null,
  question: '柯基呕吐怎么办',
  imageUrls: [],
  questionType: '',
  summary: '柯基呕吐可能的原因有：1. 饮食问题 2. 换粮过快',
  sources: [],
  status: 'OBSERVING',
  conversationId: 'conv-1',
  role: 'assistant',
  parentId: 'msg-1',
  createdAt: new Date('2026-06-01T10:00:05Z'),
  updatedAt: new Date('2026-06-01T10:00:05Z'),
};

describe('ChatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chat', () => {
    it('should start a new conversation when no conversationId provided', async () => {
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce(mockUserMessage) // user message save
        .mockResolvedValueOnce(mockAssistantMessage); // assistant reply save
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]); // no prior history
      (prisma.aIAssistantSession.update as jest.Mock).mockResolvedValue({}); // parentId linking
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue('柯基呕吐可能的原因有：1. 饮食问题 2. 换粮过快');

      const result = await ChatService.chat({
        userId: 'user-1',
        message: '柯基呕吐怎么办',
      });

      expect(result.role).toBe('assistant');
      expect(result.summary).toContain('柯基呕吐');
      expect(result.conversationId).toBeTruthy();

      // First create = user message
      const userMsgCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      expect(userMsgCall.role).toBe('user');
      expect(userMsgCall.question).toBe('柯基呕吐怎么办');
      // Second create = assistant reply
      const assistantMsgCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantMsgCall.role).toBe('assistant');
      expect(assistantMsgCall.parentId).toBe('msg-1');
    });

    it('should continue an existing conversation when conversationId is provided', async () => {
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);
      // Prior history: a user message + an assistant reply
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'old-user-msg',
          role: 'user',
          question: '柯基食欲不振',
          summary: '',
          createdAt: new Date('2026-06-01T09:00:00Z'),
        },
        {
          id: 'old-assistant-msg',
          role: 'assistant',
          question: '柯基食欲不振',
          summary: '可能的原因...',
          createdAt: new Date('2026-06-01T09:00:30Z'),
        },
      ]);
      (prisma.aIAssistantSession.update as jest.Mock).mockResolvedValue({});
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue('回复');

      await ChatService.chat({
        userId: 'user-1',
        message: '那如果还呕吐呢',
        conversationId: 'existing-conv',
      });

      // Verify the LLM was called with the full conversation history
      const chatCall = (llmClient.chat as jest.Mock).mock.calls[0];
      const messages = chatCall[0];
      // system + 2 history + 1 new user = 4 messages
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('柯基食欲不振');
      expect(messages[2].role).toBe('assistant');
      expect(messages[2].content).toBe('可能的原因...');
      expect(messages[3].role).toBe('user');
      expect(messages[3].content).toBe('那如果还呕吐呢');
    });

    it('should link the new user message to the last prior message via parentId', async () => {
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'old-msg',
          role: 'assistant',
          question: '',
          summary: 'prior reply',
          createdAt: new Date('2026-06-01T09:00:00Z'),
        },
      ]);
      (prisma.aIAssistantSession.update as jest.Mock).mockResolvedValue({});
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue('reply');

      await ChatService.chat({
        userId: 'user-1',
        message: 'follow up',
        conversationId: 'conv-1',
      });

      // The update call should set parentId to the last prior message
      expect(prisma.aIAssistantSession.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { parentId: 'old-msg' },
      });
    });

    it('should use fallback reply when LLM is not configured', async () => {
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(false);

      const result = await ChatService.chat({
        userId: 'user-1',
        message: 'test',
      });

      // LLM should NOT be called
      expect(llmClient.chat).not.toHaveBeenCalled();
      // Fallback reply should be stored
      const assistantCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantCall.summary).toContain('AI 服务暂时不可用');
    });

    it('should clearly explain image fallback when LLM is unavailable', async () => {
      const imageUrls = ['https://cdn.example.com/pet-eye.jpg'];
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce({ ...mockUserMessage, imageUrls })
        .mockResolvedValueOnce({ ...mockAssistantMessage, imageUrls });
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(false);

      await ChatService.chat({
        userId: 'user-1',
        message: '帮我看下眼睛照片',
        imageUrls,
      });

      const assistantCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantCall.summary).toContain('已收到 1 张图片');
      expect(assistantCall.summary).toContain('当前模型暂不能直接识别图片内容');
      expect(assistantCall.summary).toContain('请补充文字描述');
    });

    it('should use fallback reply when LLM call fails', async () => {
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce(mockUserMessage)
        .mockResolvedValueOnce(mockAssistantMessage);
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockRejectedValue(new Error('API timeout'));

      await ChatService.chat({
        userId: 'user-1',
        message: 'test',
      });

      const assistantCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantCall.summary).toContain('AI 服务暂时不可用');
    });

    it('should store imageUrls and include image context in the LLM prompt', async () => {
      const imageUrls = [
        'https://cdn.example.com/pet-eye.jpg',
        'https://cdn.example.com/pet-skin.jpg',
      ];
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce({ ...mockUserMessage, imageUrls })
        .mockResolvedValueOnce({ ...mockAssistantMessage, imageUrls });
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue('我已看到图片，请补充症状持续时间。');

      await ChatService.chat({
        userId: 'user-1',
        message: '请看看这两张照片',
        imageUrls,
      });

      const userMsgCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[0][0].data;
      const assistantMsgCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(userMsgCall.imageUrls).toEqual(imageUrls);
      expect(assistantMsgCall.imageUrls).toEqual(imageUrls);

      const messages = (llmClient.chat as jest.Mock).mock.calls[0][0];
      expect(messages[messages.length - 1].content).toContain('用户上传了 2 张图片');
      expect(messages[messages.length - 1].content).toContain(imageUrls[0]);
      expect(messages[messages.length - 1].content).toContain('请看看这两张照片');
    });

    it('should always include a clear image limitation notice when images are attached', async () => {
      const imageUrls = ['https://cdn.example.com/pet-eye.jpg'];
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce({ ...mockUserMessage, imageUrls })
        .mockResolvedValueOnce({ ...mockAssistantMessage, imageUrls });
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue('从图片看可能是眼部发红，建议观察。');

      await ChatService.chat({
        userId: 'user-1',
        message: '请看看眼睛照片',
        imageUrls,
      });

      const assistantCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantCall.summary).toContain('当前 AI 暂不能直接识别图片细节');
      expect(assistantCall.summary).toContain('请补充文字描述');
    });

    it('should save a structured result card for image-assisted replies', async () => {
      const imageUrls = ['https://cdn.example.com/pet-eye.jpg'];
      (prisma.aIAssistantSession.create as jest.Mock)
        .mockResolvedValueOnce({ ...mockUserMessage, imageUrls })
        .mockResolvedValueOnce({ ...mockAssistantMessage, imageUrls });
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);
      (llmClient.isConfigured as jest.Mock).mockReturnValue(true);
      (llmClient.chat as jest.Mock).mockResolvedValue(
        '从照片和描述看，眼部分泌物需要继续观察。\n\n- 观察精神食欲\n- 如果红肿加重请就医',
      );

      await ChatService.chat({
        userId: 'user-1',
        message: '请看看眼睛照片，有点红',
        imageUrls,
      });

      const assistantCall = (prisma.aIAssistantSession.create as jest.Mock).mock.calls[1][0].data;
      expect(assistantCall.sources).toEqual([
        {
          type: 'resultCard',
          card: {
            severity: 'medium',
            visualFindings: expect.arrayContaining(['已收到 1 张图片']),
            possibleCauses: expect.arrayContaining(['眼部刺激或炎症']),
            suggestions: expect.arrayContaining(['记录图片变化，观察 24 小时内是否加重']),
            shouldSeeVet: true,
            vetReminder: '如果出现持续红肿、脓性分泌物、明显疼痛或精神食欲下降，请尽快联系兽医。',
          },
        },
      ]);
    });
  });

  describe('listConversations', () => {
    it('should list conversations sorted by last message time, newest first', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        // Most recent message first (findMany ordering)
        { ...mockAssistantMessage, id: 'msg-5', conversationId: 'conv-2', createdAt: new Date('2026-06-02') },
        { ...mockUserMessage, id: 'msg-4', conversationId: 'conv-2', createdAt: new Date('2026-06-01T20:00:00Z') },
        { ...mockAssistantMessage, id: 'msg-3', conversationId: 'conv-1', createdAt: new Date('2026-06-01T10:00:00Z') },
        { ...mockUserMessage, id: 'msg-1', conversationId: 'conv-1', createdAt: new Date('2026-06-01T09:00:00Z') },
      ]);

      const result = await ChatService.listConversations('user-1');

      expect(result).toHaveLength(2);
      // conv-2 should come first (newer)
      expect(result[0].id).toBe('conv-2');
      expect(result[0].messageCount).toBe(2);
      expect(result[1].id).toBe('conv-1');
      expect(result[1].messageCount).toBe(2);
    });

    it('should generate a short title from the first user message', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockAssistantMessage,
          id: 'msg-2',
          conversationId: 'conv-1',
          role: 'assistant',
          summary: '建议先观察精神食欲。',
          createdAt: new Date('2026-06-01T10:00:30Z'),
        },
        {
          ...mockUserMessage,
          id: 'msg-1',
          conversationId: 'conv-1',
          role: 'user',
          question: '我家柯基今天突然呕吐两次，还不太想吃饭，需要马上去医院吗？',
          createdAt: new Date('2026-06-01T10:00:00Z'),
        },
      ]);

      const result = await ChatService.listConversations('user-1');

      expect(result[0].title).toBe('我家柯基今天突然呕吐两次，还不太想吃饭');
    });

    it('should return empty array when user has no conversations', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);

      const result = await ChatService.listConversations('user-1');

      expect(result).toEqual([]);
    });

    it('should skip messages with null conversationId (legacy one-shot sessions)', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        { ...mockUserMessage, conversationId: null },
      ]);

      const result = await ChatService.listConversations('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getConversationMessages', () => {
    it('should return all messages in chronological order', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([
        { ...mockUserMessage, id: 'msg-1', createdAt: new Date('2026-06-01T09:00:00Z') },
        { ...mockAssistantMessage, id: 'msg-2', createdAt: new Date('2026-06-01T09:00:30Z') },
      ]);

      const result = await ChatService.getConversationMessages('conv-1', 'user-1');

      expect(result).toHaveLength(2);
      expect(prisma.aIAssistantSession.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should throw error if conversation does not exist', async () => {
      (prisma.aIAssistantSession.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        ChatService.getConversationMessages('nonexistent', 'user-1'),
      ).rejects.toThrow('对话不存在或无权访问');
    });
  });

  describe('deleteConversation', () => {
    it('should delete all messages in a conversation owned by the user', async () => {
      (prisma.aIAssistantSession.findFirst as jest.Mock).mockResolvedValue(mockUserMessage);
      (prisma.aIAssistantSession.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

      await ChatService.deleteConversation('conv-1', 'user-1');

      expect(prisma.aIAssistantSession.deleteMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
      });
    });

    it('should throw error if conversation does not exist', async () => {
      (prisma.aIAssistantSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        ChatService.deleteConversation('nonexistent', 'user-1'),
      ).rejects.toThrow('对话不存在');
    });

    it('should throw error if user does not own the conversation', async () => {
      (prisma.aIAssistantSession.findFirst as jest.Mock).mockResolvedValue({
        ...mockUserMessage,
        userId: 'other-user',
      });

      await expect(
        ChatService.deleteConversation('conv-1', 'user-1'),
      ).rejects.toThrow('无权删除该对话');
    });
  });

  describe('buildFallbackReply', () => {
    it('should include the user question (truncated) in the fallback', () => {
      const reply = ChatService.buildFallbackReply('我家柯基突然呕吐怎么办？');
      expect(reply).toContain('我家柯基突然呕吐怎么办');
      expect(reply).toContain('AI 服务暂时不可用');
      expect(reply).toContain('仅供参考');
    });

    it('should truncate long messages in the fallback', () => {
      const longMessage = '我'.repeat(100);
      const reply = ChatService.buildFallbackReply(longMessage);
      // Should contain only the first 50 chars
      expect(reply).toContain('我'.repeat(50));
      expect(reply).not.toContain('我'.repeat(51));
    });
  });
});
