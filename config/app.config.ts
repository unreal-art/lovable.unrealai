// Application Configuration
// This file contains all configurable settings for the application

export const appConfig = {
  // E2B Sandbox Configuration
  e2b: {
    // Sandbox timeout in minutes
    timeoutMinutes: 15,

    // Convert to milliseconds for E2B API
    get timeoutMs() {
      return this.timeoutMinutes * 60 * 1000
    },

    // Vite development server port
    vitePort: 5173,

    // Time to wait for Vite to be ready (in milliseconds)
    viteStartupDelay: 7000,

    // Time to wait for CSS rebuild (in milliseconds)
    cssRebuildDelay: 2000,

    // Default sandbox template (if using templates)
    defaultTemplate: undefined, // or specify a template ID
  },

  // AI Model Configuration
  ai: {
    // Default AI model
    defaultModel: "unreal::kimi-k2-instruct",

    // Available models
    availableModels: [
      ,
      "unreal::gpt-oss-120b",
      "unreal::gpt-oss-20b",
      // Removed non-code-generation models: reel*, flux*, firesearch-ocr-v6, qwen2p5-vl-32b-instruct, playground-v2.5-1024px-aesthetic
      "unreal::r1-1776",
      "unreal::llama4-scout-instruct-basic",
      "unreal::llama4-maverick-instruct-basic",
      "unreal::llama-v3p1-405b-instruct",
      "unreal::llama-v3p1-8b-instruct",
      "unreal::mixtral-8x22b-instruct",
      "unreal::qwen3-coder-480b-a35b-instruct",
      "unreal::qwen3-coder-30b-a3b-instruct",
      "unreal::qwen3-235b-a22b-instruct-2507",
      "unreal::qwen3-235b-a22b-thinking-2507",
      "unreal::deepseek-r1-0528",
      "unreal::deepseek-r1-basic",
      "unreal::llama-v3p1-70b-instruct",
      "unreal::llama-v3p3-70b-instruct",
      "unreal::deepseek-r1",
      "unreal::qwen3-30b-a3b",
      "unreal::qwen3-30b-a3b-instruct-2507",
      "unreal::qwen3-30b-a3b-thinking-2507",
      "unreal::glm-4p5",
      "unreal::glm-4p5-air",
      "unreal::dobby-unhinged-llama-3-3-70b-new",
      "unreal::dobby-mini-unhinged-plus-llama-3-1-8b",
      "unreal::deepseek-v3",
      "unreal::deepseek-v3-0324",
      "unreal::qwen3-235b-a22b",
      "unreal::kimi-k2-instruct",
      "unreal::arctic-text2sql-r1-7b-public",
    ],

    // Model display names
    modelDisplayNames: {
      "unreal::r1-1776": "R1 1776",
      "unreal::llama4-scout-instruct-basic": "Llama 4 Scout Instruct Basic",
      "unreal::llama4-maverick-instruct-basic":
        "Llama 4 Maverick Instruct Basic",
      "unreal::llama-v3p1-405b-instruct": "Llama v3.1 405B Instruct",
      "unreal::llama-v3p1-8b-instruct": "Llama v3.1 8B Instruct",
      "unreal::mixtral-8x22b-instruct": "Mixtral 8x22B Instruct",
      "unreal::qwen3-coder-480b-a35b-instruct":
        "Qwen3 Coder 480B A35B Instruct",
      "unreal::qwen3-coder-30b-a3b-instruct": "Qwen3 Coder 30B A3B Instruct",
      "unreal::qwen3-235b-a22b-instruct-2507": "Qwen3 235B A22B Instruct 2507",
      "unreal::qwen3-235b-a22b-thinking-2507": "Qwen3 235B A22B Thinking 2507",
      "unreal::deepseek-r1-0528": "DeepSeek R1 0528",
      "unreal::deepseek-r1-basic": "DeepSeek R1 Basic",
      "unreal::llama-v3p1-70b-instruct": "Llama v3.1 70B Instruct",
      "unreal::llama-v3p3-70b-instruct": "Llama v3.3 70B Instruct",
      "unreal::deepseek-r1": "DeepSeek R1",
      "unreal::qwen3-30b-a3b": "Qwen3 30B A3B",
      "unreal::qwen3-30b-a3b-instruct-2507": "Qwen3 30B A3B Instruct 2507",
      "unreal::qwen3-30b-a3b-thinking-2507": "Qwen3 30B A3B Thinking 2507",
      "unreal::glm-4p5": "GLM 4.5",
      "unreal::glm-4p5-air": "GLM 4.5 Air",
      "unreal::dobby-unhinged-llama-3-3-70b-new":
        "Dobby Unhinged Llama 3.3 70B New",
      "unreal::dobby-mini-unhinged-plus-llama-3-1-8b":
        "Dobby Mini Unhinged Plus Llama 3.1 8B",
      "unreal::deepseek-v3": "DeepSeek V3",
      "unreal::deepseek-v3-0324": "DeepSeek V3 (0324)",
      "unreal::qwen3-235b-a22b": "Qwen3 235B A22B",
      "unreal::kimi-k2-instruct": "Kimi K2 Instruct",
      "unreal::gpt-oss-120b": "GPT-OSS 120B",
      "unreal::gpt-oss-20b": "GPT-OSS 20B",
      "unreal::arctic-text2sql-r1-7b-public": "Arctic Text2SQL R1 7B (Public)",
    },

    // Temperature settings for non-reasoning models
    defaultTemperature: 0.7,

    // Max tokens for code generation
    maxTokens: 8000,

    // Max tokens for truncation recovery
    truncationRecoveryMaxTokens: 4000,
  },

  // Code Application Configuration
  codeApplication: {
    // Delay after applying code before refreshing iframe (milliseconds)
    defaultRefreshDelay: 2000,

    // Delay when packages are installed (milliseconds)
    packageInstallRefreshDelay: 5000,

    // Enable/disable automatic truncation recovery
    enableTruncationRecovery: false, // Disabled - too many false positives

    // Maximum number of truncation recovery attempts per file
    maxTruncationRecoveryAttempts: 1,
  },

  // UI Configuration
  ui: {
    // Show/hide certain UI elements
    showModelSelector: true,
    showStatusIndicator: true,

    // Animation durations (milliseconds)
    animationDuration: 200,

    // Toast notification duration (milliseconds)
    toastDuration: 3000,

    // Maximum chat messages to keep in memory
    maxChatMessages: 100,

    // Maximum recent messages to send as context
    maxRecentMessagesContext: 20,
  },

  // Development Configuration
  dev: {
    // Enable debug logging
    enableDebugLogging: true,

    // Enable performance monitoring
    enablePerformanceMonitoring: false,

    // Log API responses
    logApiResponses: true,
  },

  // Package Installation Configuration
  packages: {
    // Use --legacy-peer-deps flag for npm install
    useLegacyPeerDeps: true,

    // Package installation timeout (milliseconds)
    installTimeout: 60000,

    // Auto-restart Vite after package installation
    autoRestartVite: true,
  },

  // File Management Configuration
  files: {
    // Excluded file patterns (files to ignore)
    excludePatterns: [
      "node_modules/**",
      ".git/**",
      ".next/**",
      "dist/**",
      "build/**",
      "*.log",
      ".DS_Store",
    ],

    // Maximum file size to read (bytes)
    maxFileSize: 1024 * 1024, // 1MB

    // File extensions to treat as text
    textFileExtensions: [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".css",
      ".scss",
      ".sass",
      ".html",
      ".xml",
      ".svg",
      ".json",
      ".yml",
      ".yaml",
      ".md",
      ".txt",
      ".env",
      ".gitignore",
      ".dockerignore",
    ],
  },

  // API Endpoints Configuration (for external services)
  api: {
    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000, // milliseconds

    // Request timeout (milliseconds)
    requestTimeout: 30000,
  },
}

// Type-safe config getter
export function getConfig<K extends keyof typeof appConfig>(
  key: K
): (typeof appConfig)[K] {
  return appConfig[key]
}

// Helper to get nested config values
export function getConfigValue(path: string): any {
  return path.split(".").reduce((obj, key) => obj?.[key], appConfig as any)
}

export default appConfig
