import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { SandboxState } from '@/types/sandbox';

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

declare global {
  var activeSandbox: any;
  var sandboxState: SandboxState;
}

export async function POST(request: NextRequest) {
  try {
    const { 
      errorMessage, 
      filePath, 
      errorType = 'unknown',
      line,
      column,
      model = 'anthropic/claude-3-haiku' 
    } = await request.json();
    
    console.log('[resolve-vite-error] Received error resolution request:');
    console.log('[resolve-vite-error] - Error type:', errorType);
    console.log('[resolve-vite-error] - File path:', filePath);
    console.log('[resolve-vite-error] - Line:', line);
    console.log('[resolve-vite-error] - Error message:', errorMessage);
    
    if (!errorMessage) {
      return NextResponse.json({ 
        success: false, 
        error: 'Error message is required' 
      }, { status: 400 });
    }

    // Get file content if filePath is provided
    let fileContent = '';
    let fileExists = false;
    
    if (filePath && global.activeSandbox) {
      try {
        console.log('[resolve-vite-error] Attempting to read file:', filePath);
        
        const result = await global.activeSandbox.runCode(`
import os

file_path = "${filePath}"
if not file_path.startswith('/'):
    file_path = f"/home/user/app/{file_path}"

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    print("FILE_CONTENT_START")
    print(content)
    print("FILE_CONTENT_END")
    print("FILE_EXISTS:True")
except FileNotFoundError:
    print("FILE_EXISTS:False")
    print(f"File not found: {file_path}")
except Exception as e:
    print("FILE_EXISTS:False")
    print(f"Error reading file: {e}")
        `);
        
        const output = result.logs.stdout.join('\n');
        fileExists = output.includes('FILE_EXISTS:True');
        
        if (fileExists) {
          const startMarker = 'FILE_CONTENT_START\n';
          const endMarker = '\nFILE_CONTENT_END';
          const startIdx = output.indexOf(startMarker);
          const endIdx = output.indexOf(endMarker);
          
          if (startIdx !== -1 && endIdx !== -1) {
            fileContent = output.substring(startIdx + startMarker.length, endIdx);
            console.log('[resolve-vite-error] Successfully read file content, length:', fileContent.length);
          }
        } else {
          console.log('[resolve-vite-error] File does not exist or could not be read');
        }
      } catch (error) {
        console.error('[resolve-vite-error] Error reading file:', error);
      }
    }

    // Build specialized debugging prompt based on error type
    let systemPrompt = '';
    let userPrompt = '';

    if (errorType === 'npm-missing') {
      // Handle missing package errors
      systemPrompt = `You are an expert at resolving React dependency issues. Your task is to fix missing package import errors.

CRITICAL RULES:
1. ONLY output a package installation command in <install> tags
2. Extract the correct package name from the error
3. For scoped packages (@), include the full scope
4. Use the most common/standard version of the package
5. Do NOT modify any code files for package errors`;

      userPrompt = `A package import is failing with this error:
${errorMessage}

${filePath ? `File: ${filePath}` : ''}

Provide the correct npm install command to fix this dependency issue.`;

    } else {
      // Handle code errors (syntax, type, reference, etc.)
      systemPrompt = `You are an expert at debugging React applications. Your task is to fix code errors by providing corrected file content.

CRITICAL RULES:
1. ONLY output the corrected file content in <file path="..."> tags
2. Make MINIMAL changes - only fix the specific error
3. Preserve all existing functionality and formatting
4. Do NOT add new features or improvements beyond fixing the error
5. Ensure the fix is syntactically correct and follows React best practices
6. If the error involves imports, make sure import paths are correct
7. For TypeScript errors, ensure proper typing

ERROR FIXING STRATEGY:
- Syntax errors: Fix the broken syntax while preserving logic
- Type errors: Add proper TypeScript types or fix type mismatches
- Reference errors: Ensure variables/components are properly imported and defined
- Import errors: Fix import paths and ensure imports exist`;

      const locationInfo = line ? ` at line ${line}${column ? `, column ${column}` : ''}` : '';
      
      userPrompt = `The following error occurred${filePath ? ` in file '${filePath}'` : ''}${locationInfo}:

ERROR MESSAGE:
${errorMessage}

${fileContent ? `
CURRENT FILE CONTENT:
\`\`\`
${fileContent}
\`\`\`

Provide the corrected, complete file content that resolves this error.` : `
The file could not be read. Based on the error message, provide guidance on what needs to be fixed.`}`;
    }

    console.log('[resolve-vite-error] Using system prompt for error type:', errorType);
    
    // Determine which AI provider to use
    const isAnthropic = model.startsWith('anthropic/');
    const isOpenAI = model.startsWith('openai/');
    const modelProvider = isAnthropic ? anthropic : (isOpenAI ? openai : groq);
    const actualModel = isAnthropic ? model.replace('anthropic/', '') : 
                       isOpenAI ? model.replace('openai/', '') : model;

    // Make streaming API call
    const result = await streamText({
      model: modelProvider(actualModel),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // Low temperature for more deterministic fixes
      maxTokens: 4096
    });

    // Collect the full response
    let fullResponse = '';
    for await (const textPart of result.textStream) {
      fullResponse += textPart || '';
    }

    console.log('[resolve-vite-error] AI response received, length:', fullResponse.length);

    // Parse the response based on error type
    if (errorType === 'npm-missing') {
      // Extract install command
      const installMatch = fullResponse.match(/<install>(.*?)<\/install>/s);
      if (installMatch) {
        const installCommand = installMatch[1].trim();
        return NextResponse.json({
          success: true,
          fixType: 'package-install',
          installCommand,
          message: `Install command: ${installCommand}`
        });
      } else {
        // Fallback: try to extract package name from the error and generate install command
        const packageMatch = errorMessage.match(/Failed to resolve import ["']([^"']+)["']/);
        if (packageMatch) {
          const importPath = packageMatch[1];
          let packageName = importPath;
          
          // Extract package name from import path
          if (importPath.startsWith('@')) {
            const parts = importPath.split('/');
            packageName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
          } else {
            packageName = importPath.split('/')[0];
          }
          
          return NextResponse.json({
            success: true,
            fixType: 'package-install',
            installCommand: `npm install ${packageName}`,
            message: `Install missing package: ${packageName}`
          });
        }
      }
    } else {
      // Extract corrected file content
      const fileMatch = fullResponse.match(/<file path="([^"]+)">([\s\S]*?)<\/file>/);
      if (fileMatch && fileContent) {
        const correctedPath = fileMatch[1];
        const correctedContent = fileMatch[2].trim();
        
        return NextResponse.json({
          success: true,
          fixType: 'code-fix',
          filePath: correctedPath,
          correctedContent,
          originalContent: fileContent,
          message: `Fixed ${errorType} in ${filePath || correctedPath}`
        });
      } else {
        // If no file tags found, provide the raw response as guidance
        return NextResponse.json({
          success: true,
          fixType: 'guidance',
          message: fullResponse.trim(),
          originalError: errorMessage
        });
      }
    }

    // Fallback response
    return NextResponse.json({
      success: false,
      error: 'Could not generate a fix for this error',
      aiResponse: fullResponse.trim()
    });

  } catch (error) {
    console.error('[resolve-vite-error] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

