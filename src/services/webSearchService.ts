import { logger } from '../utils/logger';

/**
 * WebSearchResult — a single web search result item.
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/**
 * WebSearchService — searches the web using DuckDuckGo (free, no API key required).
 *
 * Strategy:
 * - Performs parallel searches with different keyword suffixes ("小红书", "抖音")
 *   to surface content from popular Chinese social platforms.
 * - Parses DuckDuckGo's HTML endpoint results using regex.
 * - Gracefully degrades: if web search fails, returns an empty array so the
 *   AI pipeline can fall back to community + LLM-only mode.
 */
export class WebSearchService {
  /** Default timeout for each search request (ms). */
  private static readonly SEARCH_TIMEOUT = 8000;

  /** Browser-like User-Agent to avoid being blocked by DuckDuckGo. */
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Search the web for a given question.
   * Runs multiple searches in parallel with platform-specific keywords,
   * then merges and deduplicates results.
   *
   * @param question - The user's question
   * @param limit - Maximum number of results to return (default 5)
   * @returns Array of web search results
   */
  static async search(question: string, limit: number = 5): Promise<WebSearchResult[]> {
    if (!question || question.trim().length === 0) {
      return [];
    }

    const trimmedQuestion = question.trim();

    // Run parallel searches with different keyword suffixes to surface
    // content from Xiaohongshu (小红书) and Douyin (抖音).
    const searchQueries = [
      `${trimmedQuestion} 宠物`,
      `${trimmedQuestion} 小红书`,
      `${trimmedQuestion} 抖音`,
    ];

    const searchPromises = searchQueries.map((q) =>
      WebSearchService.searchDuckDuckGo(q, limit),
    );

    const results = await Promise.allSettled(searchPromises);

    const allResults: WebSearchResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const deduped = allResults.filter((r) => {
      if (seenUrls.has(r.url)) return false;
      seenUrls.add(r.url);
      return true;
    });

    logger.info(
      `Web search for "${trimmedQuestion.substring(0, 40)}...": ` +
        `${deduped.length} unique results (from ${allResults.length} total)`,
    );

    return deduped.slice(0, limit);
  }

  /**
   * Search DuckDuckGo's HTML endpoint and parse the results.
   *
   * @param query - The search query string
   * @param limit - Maximum results to extract
   * @returns Array of parsed search results
   */
  private static async searchDuckDuckGo(
    query: string,
    limit: number,
  ): Promise<WebSearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        WebSearchService.SEARCH_TIMEOUT,
      );

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': WebSearchService.USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`DuckDuckGo returned HTTP ${response.status} for query: ${query}`);
        return [];
      }

      const html = await response.text();
      return WebSearchService.parseResults(html, limit);
    } catch (error) {
      const errMsg = (error as Error).message;
      if (errMsg.includes('abort')) {
        logger.warn(`DuckDuckGo search timed out for query: ${query}`);
      } else {
        logger.warn(`DuckDuckGo search failed for "${query}": ${errMsg}`);
      }
      return [];
    }
  }

  /**
   * Parse DuckDuckGo HTML search results page.
   * Extracts titles, URLs, and snippets from result blocks.
   *
   * @param html - The raw HTML response from DuckDuckGo
   * @param limit - Maximum number of results to extract
   * @returns Array of parsed search results
   */
  private static parseResults(html: string, limit: number): WebSearchResult[] {
    const results: WebSearchResult[] = [];

    // DuckDuckGo HTML results have this structure:
    // <a class="result__a" href="//duckduckgo.com/l/?uddg=ENCODED_URL">Title</a>
    // <a class="result__snippet" href="...">Snippet text</a>
    const linkRegex =
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex =
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    // Extract all link/title pairs
    const links: Array<{ url: string; title: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const rawUrl = match[1];
      const title = WebSearchService.stripHtml(match[2]).trim();
      const actualUrl = WebSearchService.extractUrl(rawUrl);
      if (actualUrl && title) {
        links.push({ url: actualUrl, title });
      }
    }

    // Extract all snippets
    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(WebSearchService.stripHtml(match[1]).trim());
    }

    // Combine links with snippets
    const count = Math.min(links.length, limit);
    for (let i = 0; i < count; i++) {
      const link = links[i];
      // Skip DuckDuckGo internal links and empty results
      if (!link.url || link.url.includes('duckduckgo.com')) continue;

      results.push({
        title: link.title,
        url: link.url,
        snippet: snippets[i] || '',
        source: WebSearchService.detectSource(link.url),
      });
    }

    return results;
  }

  /**
   * Extract the actual destination URL from a DuckDuckGo redirect URL.
   * DuckDuckGo wraps result URLs in a redirect like:
   * //duckduckgo.com/l/?uddg=ENCODED_URL&rut=...
   *
   * @param rawUrl - The raw href from DuckDuckGo HTML
   * @returns The decoded actual URL, or the raw URL if extraction fails
   */
  private static extractUrl(rawUrl: string): string {
    try {
      // Check if the URL contains the uddg parameter (DuckDuckGo redirect)
      if (rawUrl.includes('uddg=')) {
        const queryString = rawUrl.split('?')[1];
        if (queryString) {
          const params = new URLSearchParams(queryString);
          const decoded = params.get('uddg');
          if (decoded) {
            return decodeURIComponent(decoded);
          }
        }
      }

      // If it's already a direct URL
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
      }

      // Handle protocol-relative URLs (//example.com/...)
      if (rawUrl.startsWith('//')) {
        return `https:${rawUrl}`;
      }

      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Strip HTML tags and decode HTML entities from a string.
   *
   * @param html - The HTML string to clean
   * @returns Plain text with tags removed and entities decoded
   */
  private static stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  /**
   * Detect the source platform from a URL.
   * Returns a human-readable platform name for display.
   *
   * @param url - The URL to analyze
   * @returns Platform name (e.g., '小红书', '抖音', '知乎', '网络')
   */
  private static detectSource(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes('xiaohongshu') ||
      lowerUrl.includes('xhslink') ||
      lowerUrl.includes('xhs.')
    ) {
      return '小红书';
    }
    if (lowerUrl.includes('douyin') || lowerUrl.includes('iesdouyin')) {
      return '抖音';
    }
    if (lowerUrl.includes('zhihu')) {
      return '知乎';
    }
    if (lowerUrl.includes('baidu') || lowerUrl.includes('baijiahao')) {
      return '百度';
    }
    if (lowerUrl.includes('weibo')) {
      return '微博';
    }
    if (lowerUrl.includes('bilibili') || lowerUrl.includes('b23.tv')) {
      return 'B站';
    }
    if (lowerUrl.includes('sohu')) {
      return '搜狐';
    }
    if (lowerUrl.includes('sina')) {
      return '新浪';
    }
    return '网络';
  }
}
