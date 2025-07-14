const axios = require('axios');
const logger = require('../utils/logger');

class TranslationService {
  constructor(config) {
    this.config = config;
    this.cache = new Map(); // 简单的内存缓存
    this.cacheTimeout = 60 * 60 * 1000; // 1小时缓存
    
    // 支持的翻译提供商
    this.providers = {
      openai: this.translateWithOpenAI.bind(this),
      deepl: this.translateWithDeepL.bind(this),
      google: this.translateWithGoogle.bind(this)
    };

    // 语言代码映射
    this.languageMapping = {
      'zh-cn': 'zh',
      'zh-tw': 'zh-TW',
      'en': 'en',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
      'it': 'it',
      'pt': 'pt',
      'ar': 'ar',
      'th': 'th',
      'vi': 'vi'
    };

    // 常见语言检测模式
    this.languagePatterns = {
      'zh': /[\u4e00-\u9fff]/,
      'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
      'ko': /[\uac00-\ud7af]/,
      'ar': /[\u0600-\u06ff]/,
      'ru': /[\u0400-\u04ff]/,
      'th': /[\u0e00-\u0e7f]/
    };
  }

  // 检测文本语言
  async detectLanguage(text) {
    try {
      if (!text || text.trim().length === 0) {
        return 'unknown';
      }

      // 使用缓存
      const cacheKey = `detect_${text.substring(0, 100)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 简单的模式匹配检测
      const detectedLanguage = this.detectLanguageByPattern(text);
      if (detectedLanguage !== 'unknown') {
        this.setCache(cacheKey, detectedLanguage);
        return detectedLanguage;
      }

      // 使用外部API检测（如果配置了）
      if (this.config.languageDetection && this.config.languageDetection.enabled) {
        const apiResult = await this.detectLanguageWithAPI(text);
        if (apiResult) {
          this.setCache(cacheKey, apiResult);
          return apiResult;
        }
      }

      // 默认返回中文
      const defaultLang = 'zh';
      this.setCache(cacheKey, defaultLang);
      return defaultLang;

    } catch (error) {
      logger.error('Language detection failed', {
        error: error.message,
        textLength: text.length
      });
      return 'zh'; // 默认中文
    }
  }

  // 通过模式匹配检测语言
  detectLanguageByPattern(text) {
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    // 检测英文（没有特殊字符的情况下）
    if (/^[a-zA-Z0-9\s\.,!?;:'"()\-]+$/.test(text)) {
      return 'en';
    }

    return 'unknown';
  }

  // 使用API检测语言
  async detectLanguageWithAPI(text) {
    try {
      if (this.config.languageDetection.provider === 'google') {
        return await this.detectLanguageWithGoogle(text);
      }
      
      // 可以添加其他提供商
      return null;
    } catch (error) {
      logger.error('API language detection failed', { error: error.message });
      return null;
    }
  }

  // 使用Google API检测语言
  async detectLanguageWithGoogle(text) {
    try {
      const response = await axios.post(
        `https://translation.googleapis.com/language/translate/v2/detect?key=${this.config.languageDetection.apiKey}`,
        {
          q: text.substring(0, 200) // 只检测前200个字符
        }
      );

      const detection = response.data.data.detections[0][0];
      return detection.language;
    } catch (error) {
      logger.error('Google language detection failed', { error: error.message });
      return null;
    }
  }

  // 翻译文本
  async translateText(text, targetLanguage, sourceLanguage = null, options = {}) {
    try {
      if (!text || text.trim().length === 0) {
        return text;
      }

      // 检测源语言（如果没有提供）
      if (!sourceLanguage) {
        sourceLanguage = await this.detectLanguage(text);
      }

      // 如果源语言和目标语言相同，直接返回
      if (sourceLanguage === targetLanguage) {
        return text;
      }

      // 使用缓存
      const cacheKey = `translate_${sourceLanguage}_${targetLanguage}_${text.substring(0, 100)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 选择翻译提供商
      const provider = options.provider || this.config.translation?.defaultProvider || 'openai';
      
      if (!this.providers[provider]) {
        throw new Error(`Unsupported translation provider: ${provider}`);
      }

      // 执行翻译
      const translatedText = await this.providers[provider](text, targetLanguage, sourceLanguage, options);
      
      // 缓存结果
      this.setCache(cacheKey, translatedText);
      
      logger.debug('Text translated', {
        sourceLanguage,
        targetLanguage,
        provider,
        originalLength: text.length,
        translatedLength: translatedText.length
      });

      return translatedText;

    } catch (error) {
      logger.error('Translation failed', {
        error: error.message,
        sourceLanguage,
        targetLanguage,
        textLength: text.length
      });
      
      // 翻译失败时返回原文
      return text;
    }
  }

  // 使用OpenAI翻译
  async translateWithOpenAI(text, targetLanguage, sourceLanguage, options = {}) {
    try {
      const openaiConfig = this.config.translation.openai;
      if (!openaiConfig || !openaiConfig.apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const targetLangName = this.getLanguageName(targetLanguage);
      const sourceLangName = this.getLanguageName(sourceLanguage);

      const prompt = `请将以下${sourceLangName}文本翻译为${targetLangName}，保持原意和语气，只返回翻译结果：\n\n${text}`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: openaiConfig.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '你是一个专业的翻译助手，能够准确翻译各种语言，保持原文的语气和含义。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: Math.min(1000, text.length * 2),
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiConfig.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content.trim();

    } catch (error) {
      logger.error('OpenAI translation failed', { error: error.message });
      throw error;
    }
  }

  // 使用DeepL翻译
  async translateWithDeepL(text, targetLanguage, sourceLanguage, options = {}) {
    try {
      const deeplConfig = this.config.translation.deepl;
      if (!deeplConfig || !deeplConfig.apiKey) {
        throw new Error('DeepL API key not configured');
      }

      const response = await axios.post(
        'https://api-free.deepl.com/v2/translate',
        new URLSearchParams({
          auth_key: deeplConfig.apiKey,
          text: text,
          target_lang: targetLanguage.toUpperCase(),
          source_lang: sourceLanguage ? sourceLanguage.toUpperCase() : 'auto'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data.translations[0].text;

    } catch (error) {
      logger.error('DeepL translation failed', { error: error.message });
      throw error;
    }
  }

  // 使用Google翻译
  async translateWithGoogle(text, targetLanguage, sourceLanguage, options = {}) {
    try {
      const googleConfig = this.config.translation.google;
      if (!googleConfig || !googleConfig.apiKey) {
        throw new Error('Google API key not configured');
      }

      const params = {
        key: googleConfig.apiKey,
        q: text,
        target: targetLanguage
      };

      if (sourceLanguage) {
        params.source = sourceLanguage;
      }

      const response = await axios.post(
        'https://translation.googleapis.com/language/translate/v2',
        new URLSearchParams(params)
      );

      return response.data.data.translations[0].translatedText;

    } catch (error) {
      logger.error('Google translation failed', { error: error.message });
      throw error;
    }
  }

  // 获取语言名称
  getLanguageName(languageCode) {
    const names = {
      'zh': '中文',
      'zh-cn': '简体中文',
      'zh-tw': '繁体中文',
      'en': '英文',
      'ja': '日文',
      'ko': '韩文',
      'fr': '法文',
      'de': '德文',
      'es': '西班牙文',
      'ru': '俄文',
      'it': '意大利文',
      'pt': '葡萄牙文',
      'ar': '阿拉伯文',
      'th': '泰文',
      'vi': '越南文'
    };

    return names[languageCode] || languageCode;
  }

  // 批量翻译
  async translateBatch(texts, targetLanguage, sourceLanguage = null, options = {}) {
    try {
      const results = [];
      
      // 并发翻译（控制并发数量）
      const batchSize = options.batchSize || 5;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => 
          this.translateText(text, targetLanguage, sourceLanguage, options)
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      return results;

    } catch (error) {
      logger.error('Batch translation failed', {
        error: error.message,
        textCount: texts.length,
        targetLanguage
      });
      throw error;
    }
  }

  // 智能翻译（根据上下文选择翻译策略）
  async smartTranslate(messageData, targetLanguage, options = {}) {
    try {
      const {
        content,
        context,
        isCustomerService = false,
        platform
      } = messageData;

      // 检测原始语言
      const sourceLanguage = await this.detectLanguage(content);
      
      // 如果是客服场景，添加特殊处理
      let translationOptions = { ...options };
      if (isCustomerService) {
        translationOptions.style = 'professional';
        translationOptions.context = 'customer_service';
      }

      // 翻译内容
      const translatedContent = await this.translateText(
        content,
        targetLanguage,
        sourceLanguage,
        translationOptions
      );

      return {
        originalContent: content,
        translatedContent: translatedContent,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        confidence: 0.9 // 可以根据实际情况调整
      };

    } catch (error) {
      logger.error('Smart translation failed', {
        error: error.message,
        targetLanguage
      });
      
      return {
        originalContent: messageData.content,
        translatedContent: messageData.content,
        sourceLanguage: 'unknown',
        targetLanguage: targetLanguage,
        confidence: 0,
        error: error.message
      };
    }
  }

  // 缓存管理
  setCache(key, value) {
    this.cache.set(key, {
      value: value,
      timestamp: Date.now()
    });
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  // 清理过期缓存
  cleanupCache() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  // 获取支持的语言列表
  getSupportedLanguages() {
    return Object.keys(this.languageMapping);
  }

  // 验证语言代码
  isLanguageSupported(languageCode) {
    return languageCode in this.languageMapping;
  }

  // 获取翻译统计
  getTranslationStats() {
    return {
      cacheSize: this.cache.size,
      supportedLanguages: this.getSupportedLanguages().length,
      availableProviders: Object.keys(this.providers)
    };
  }
}

module.exports = TranslationService; 