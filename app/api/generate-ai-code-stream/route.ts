import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { SandboxState } from '@/types/sandbox';
import { selectFilesForEdit, getFileContents, formatFilesForAI } from '@/lib/context-selector';
import { executeSearchPlan, formatSearchResultsForAI, selectTargetFile } from '@/lib/file-search-executor';
import { buildConversationHistoryPrompt, updateConversationMemory } from '@/lib/conversation-memory';
import { FileManifest } from '@/types/file-manifest';
import type { ConversationState, ConversationMessage, ConversationEdit } from '@/types/conversation';
import { appConfig } from '@/config/app.config';

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Model Mapping ---
const modelMapping: { [key: string]: string } = {
  'groq/llama3-8b-8192': 'llama3-8b-8192',
  'groq/llama3-70b-8192': 'llama3-70b-8192',
  'anthropic/claude-3-haiku-20240307': 'claude-3-haiku-20240307',
  'anthropic/claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
  'anthropic/claude-3-opus-20240229': 'claude-3-opus-20240229',
  'openai/gpt-5': 'gpt-5', // Changed as requested
  'openai/gpt-oss-20b': 'gpt-4.1', // Changed as requested
};


declare global {
  var sandboxState: SandboxState;
  var conversationState: ConversationState | null;
  var activeSandbox: any;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'openai/gpt-oss-20b', context, isEdit = false } = await request.json();

    console.log('[generate-ai-code-stream] Received request:', { model, isEdit, sandboxId: context?.sandboxId });

    // Initialize and manage conversation state
    if (!global.conversationState) {
      global.conversationState = {
        conversationId: `conv-${Date.now()}`,
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        context: { messages: [], edits: [], projectEvolution: { majorChanges: [] }, userPreferences: {}, sessionSummary: { totalInteractions: 0, filesCreated: [], filesModified: [], packagesAdded: [], componentsCreated: [] } }
      };
    }
    if (global.conversationState.context.messages.length > 20) {
      global.conversationState.context.messages = global.conversationState.context.messages.slice(-15);
    }

    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      metadata: { sandboxId: context?.sandboxId }
    };

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    // Setup Server-Sent Events stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const sendProgress = async (data: any) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Main async processing logic
    (async () => {
      try {
        await sendProgress({ type: 'status', message: 'Initializing AI...' });

        let editContext: any = null;
        let enhancedSystemPrompt = '';

        // Edit Mode: Agentic Search
        if (isEdit) {
          const manifest: FileManifest | undefined = global.sandboxState?.fileCache?.manifest;
          if (manifest) {
            await sendProgress({ type: 'status', message: '🔍 Analyzing edit request...' });
            try {
              const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, manifest, model }) });
              if (intentResponse.ok) {
                const { searchPlan } = await intentResponse.json();
                const searchExecution = executeSearchPlan(searchPlan, Object.fromEntries(Object.entries(global.sandboxState.fileCache.files).map(([path, data]) => [path.startsWith('/') ? path : `/home/user/app/${path}`, data.content])));
                if (searchExecution.success && searchExecution.results.length > 0) {
                  const target = selectTargetFile(searchExecution.results, searchPlan.editType);
                  if (target) {
                    await sendProgress({ type: 'status', message: `✅ Found target: ${target.filePath.split('/').pop()}` });
                    enhancedSystemPrompt = `${formatSearchResultsForAI(searchExecution.results)}\n\nSURGICAL EDIT INSTRUCTIONS:\n- File: ${target.filePath}\n- Line: ${target.lineNumber}\n- Reason: ${target.reason}\n\nMake ONLY the change requested.\nUser request: "${prompt}"`;
                    editContext = { primaryFiles: [target.filePath], contextFiles: [], systemPrompt: enhancedSystemPrompt, editIntent: { type: searchPlan.editType, description: searchPlan.reasoning, targetFiles: [target.filePath], confidence: 0.95, searchTerms: searchPlan.searchTerms } };
                  }
                }
              }
            } catch (error) {
              console.error('[generate-ai-code-stream] Error in agentic search:', error);
              editContext = selectFilesForEdit(prompt, manifest);
            }
          }
          if (editContext) {
            enhancedSystemPrompt = editContext.systemPrompt || enhancedSystemPrompt;
          }
        }

        // --- Restored Original System Prompt ---
        const conversationContext = buildConversationHistoryPrompt(global.conversationState);
        const systemPrompt = `You are an expert React developer with perfect memory of the conversation. You maintain context across messages and remember scraped websites, generated components, and applied code. Generate clean, modern React code for Vite applications.

## 🎯 SMART CONTEXT UNDERSTANDING
When you receive file context, it will be organized into two important categories:

### 📝 Files to Edit
- These are the PRIMARY files you should modify to fulfill the user's request
- Focus your changes on these files ONLY
- These files have been intelligently selected based on the user's request and code relationships

### 📚 Context Files for Reference
- These provide supporting context to understand component relationships and APIs
- Use these to understand how components connect and what patterns to follow
- DO NOT modify these files unless explicitly requested by the user
- These help you make informed decisions about the primary files

${conversationContext}

  CRITICAL RULES - YOUR MOST IMPORTANT INSTRUCTIONS:
1. **DO EXACTLY WHAT IS ASKED - NOTHING MORE, NOTHING LESS**
2. **CHECK App.jsx FIRST** - ALWAYS see what components exist before creating new ones
3. **NAVIGATION LIVES IN Header.jsx** - Don't create Nav.jsx if Header exists with nav
4. **USE STANDARD TAILWIND CLASSES ONLY**:
   - CORRECT: bg-white, text-black, bg-blue-500, bg-gray-100, text-gray-900
   - WRONG: bg-background, text-foreground, bg-primary, bg-muted, text-secondary
5. **FILE COUNT LIMITS**:
   - Simple style/text change = 1 file ONLY
   - New component = 2 files MAX (component + parent)

${isEdit ? `CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION

YOU MUST FOLLOW THESE EDIT RULES:
0. NEVER create tailwind.config.js, vite.config.js, package.json, or any other config files - they already exist!
1. DO NOT regenerate the entire application
2. DO NOT create files that already exist (like App.jsx, index.css, tailwind.config.js)
3. ONLY edit the EXACT files needed for the requested change - NO MORE, NO LESS
4. If the user says "update the header", ONLY edit the Header component - DO NOT touch Footer, Hero, or any other components
5. If you're unsure which file to edit, choose the SINGLE most specific one related to the request.
` : ''}

CRITICAL STYLING RULES - MUST FOLLOW:
- NEVER use inline styles with style={{ }} in JSX
- NEVER use <style jsx> tags or any CSS-in-JS solutions
- NEVER create App.css, Component.css, or any component-specific CSS files
- NEVER import './App.css' or any CSS files except index.css
- ALWAYS use Tailwind CSS classes for ALL styling
- ONLY create src/index.css with the @tailwind directives
- Use Tailwind's full utility set: spacing, colors, typography, flexbox, grid, animations, etc.

Use this XML format for React components only:
<file path="src/components/Example.jsx">
// Your React component code here
</file>

CRITICAL COMPLETION RULES:
1. NEVER say "I'll continue with the remaining components"
2. NEVER use <continue> tags
3. Generate ALL components in ONE response
4. If App.jsx imports 10 components, generate ALL 10
5. Complete EVERYTHING before ending your response
${enhancedSystemPrompt}`;

        let fullPrompt = prompt;
        const backendFiles = global.sandboxState?.fileCache?.files || {};
        if (Object.keys(backendFiles).length > 0) {
          if (editContext?.primaryFiles.length > 0) {
            const primaryFiles = await getFileContents(editContext.primaryFiles, global.sandboxState.fileCache.manifest!);
            const contextFiles = await getFileContents(editContext.contextFiles, global.sandboxState.fileCache.manifest!);
            fullPrompt = `CONTEXT:\n${formatFilesForAI(primaryFiles, contextFiles)}\n\nUSER REQUEST:\n${prompt}`;
          } else {
            const allFilesContent = Object.entries(backendFiles).map(([path, data]) => `<file path="${path}">\n${data.content}\n</file>`).join('\n');
            fullPrompt = `CONTEXT:\n${allFilesContent}\n\nUSER REQUEST:\n${prompt}`;
          }
        }

        await sendProgress({ type: 'status', message: 'Generating code...' });

        // AI Model and Provider Selection
        const isOpenAI = model.startsWith('openai/');
        const modelProvider = model.startsWith('anthropic/') ? anthropic : (isOpenAI ? openai : groq);
        const actualModel = modelMapping[model] || model;

        // Stream Text API Call
        const result = await streamText({
          model: modelProvider(actualModel),
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: fullPrompt }],
          maxTokens: 8192,
          temperature: appConfig.ai.defaultTemperature,
          ...(isOpenAI && model.includes('gpt-5') && { experimental_providerMetadata: { openai: { reasoningEffort: 'high' } } }),
        });

        let generatedCode = '';
        for await (const textPart of result.textStream) {
          generatedCode += textPart;
          await sendProgress({ type: 'stream', text: textPart });
          process.stdout.write(textPart);
        }
        console.log('\n[generate-ai-code-stream] Streaming complete.');

        const files = (generatedCode.match(/<file path="[^"]+">[\s\S]*?<\/file>/g) || []).map(fileBlock => {
          const path = fileBlock.match(/<file path="([^"]+)">/)?.[1] || '';
          const content = fileBlock.replace(/<file path="[^"]+">/, '').replace(/<\/file>$/, '').trim();
          return { path, content };
        });

        await sendProgress({ type: 'complete', generatedCode, explanation: 'Code generation complete.', files: files.length });
        if (global.conversationState) {
          updateConversationMemory(global.conversationState, userMessage, { generatedCode, appliedFiles: files.map(f => ({ path: f.path, action: 'created', size: f.content.length })), fileCount: files.length });
        }

      } catch (error) {
        console.error('[generate-ai-code-stream] Stream processing error:', error);
        await sendProgress({ type: 'error', error: (error as Error).message });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
  } catch (error) {
    console.error('[generate-ai-code-stream] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}