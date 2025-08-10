import { FileManifest, EditIntent, EditType } from '@/types/file-manifest';
import { analyzeEditIntent } from '@/lib/edit-intent-analyzer';
import { getEditExamplesPrompt, getComponentPatternPrompt } from '@/lib/edit-examples';

export interface FileContext {
  primaryFiles: string[]; // Files to edit
  contextFiles: string[]; // Files to include for reference
  systemPrompt: string;   // Enhanced prompt with file info
  editIntent: EditIntent;
}

/**
 * Select files and build context based on user prompt
 */
export function selectFilesForEdit(
  userPrompt: string,
  manifest: FileManifest
): FileContext {
  // Analyze the edit intent
  const editIntent = analyzeEditIntent(userPrompt, manifest);
  
  // Get the files based on intent - only edit target files, but build smart local context
  const primaryFiles = editIntent.targetFiles;
  const allFiles = Object.keys(manifest.files);
  
  // Build local context around primary files instead of including all files
  const contextFiles = buildLocalContext(primaryFiles, manifest, allFiles);
  
  // Build enhanced system prompt
  const systemPrompt = buildSystemPrompt(
    userPrompt,
    editIntent,
    primaryFiles,
    contextFiles,
    manifest
  );
  
  return {
    primaryFiles,
    contextFiles,
    systemPrompt,
    editIntent,
  };
}

/**
 * Build local context around primary files by finding related files
 */
function buildLocalContext(
  primaryFiles: string[],
  manifest: FileManifest,
  allFiles: string[]
): string[] {
  const contextFiles = new Set<string>();
  
  // ALWAYS include essential global files for general context
  const essentialFiles: string[] = [];
  
  // App.jsx is most important - shows component structure
  const appFile = allFiles.find(f => f.endsWith('App.jsx') || f.endsWith('App.tsx'));
  if (appFile && !primaryFiles.includes(appFile)) {
    essentialFiles.push(appFile);
  }
  
  // Include design system files for style context
  const tailwindConfig = allFiles.find(f => f.endsWith('tailwind.config.js') || f.endsWith('tailwind.config.ts'));
  if (tailwindConfig && !primaryFiles.includes(tailwindConfig)) {
    essentialFiles.push(tailwindConfig);
  }
  
  const indexCss = allFiles.find(f => f.endsWith('index.css') || f.endsWith('globals.css'));
  if (indexCss && !primaryFiles.includes(indexCss)) {
    essentialFiles.push(indexCss);
  }
  
  // Add essential files to context
  essentialFiles.forEach(file => contextFiles.add(file));
  
  // For each primary file, build local context
  for (const primaryFile of primaryFiles) {
    const fileInfo = manifest.files[primaryFile];
    if (!fileInfo) continue;
    
    // 1. Find directly imported local files
    if (fileInfo.imports) {
      for (const importInfo of fileInfo.imports) {
        if (importInfo.isLocal && importInfo.source) {
          // Resolve relative import to full path
          const resolvedPath = resolveImportPath(primaryFile, importInfo.source, allFiles);
          if (resolvedPath && !primaryFiles.includes(resolvedPath)) {
            contextFiles.add(resolvedPath);
          }
        }
      }
    }
    
    // 2. Find components that import this primary file using componentTree
    if (fileInfo.componentInfo) {
      const componentName = fileInfo.componentInfo.name;
      const treeNode = manifest.componentTree[componentName];
      
      if (treeNode) {
        // Find components that import this component
        for (const importingComponentName of treeNode.importedBy) {
          const importingNode = manifest.componentTree[importingComponentName];
          if (importingNode && !primaryFiles.includes(importingNode.file)) {
            contextFiles.add(importingNode.file);
          }
        }
        
        // Also include components that this component imports (its dependencies)
        for (const importedComponentName of treeNode.imports) {
          const importedNode = manifest.componentTree[importedComponentName];
          if (importedNode && !primaryFiles.includes(importedNode.file)) {
            contextFiles.add(importedNode.file);
          }
        }
      }
    }
  }
  
  // Convert Set to Array and put essential files first for better visibility
  return [...essentialFiles, ...Array.from(contextFiles).filter(f => !essentialFiles.includes(f))];
}

/**
 * Resolve a relative import path to the actual file path
 */
function resolveImportPath(fromFile: string, importSource: string, allFiles: string[]): string | null {
  if (!importSource.startsWith('.')) {
    return null; // Not a relative import
  }
  
  // Get the directory of the importing file
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  
  // Build possible paths with common extensions
  const possibleExtensions = ['.jsx', '.tsx', '.js', '.ts'];
  const possiblePaths = [];
  
  // Handle relative path resolution
  const resolvePath = (base: string, relative: string): string => {
    const parts = base.split('/').filter(p => p);
    const relativeParts = relative.split('/').filter(p => p);
    
    for (const part of relativeParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }
    
    return '/' + parts.join('/');
  };
  
  // Handle different import patterns
  if (importSource.endsWith('/')) {
    // Directory import - look for index files
    const resolvedBasePath = resolvePath(fromDir, importSource);
    possiblePaths.push(`${resolvedBasePath}/index.jsx`, `${resolvedBasePath}/index.tsx`, `${resolvedBasePath}/index.js`, `${resolvedBasePath}/index.ts`);
  } else {
    // File import - resolve relative path properly
    const resolvedPath = resolvePath(fromDir, importSource);
    
    // If already has extension, use as-is
    if (possibleExtensions.some(ext => importSource.endsWith(ext))) {
      possiblePaths.push(resolvedPath);
    } else {
      // Try with different extensions
      possibleExtensions.forEach(ext => {
        possiblePaths.push(`${resolvedPath}${ext}`);
      });
    }
  }
  
  // Find the first matching file
  for (const possiblePath of possiblePaths) {
    // Normalize path and check if it exists in allFiles
    const normalizedPath = possiblePath.replace(/\/+/g, '/');
    if (allFiles.includes(normalizedPath)) {
      return normalizedPath;
    }
  }
  
  return null;
}

/**
 * Build an enhanced system prompt with file structure context
 */
function buildSystemPrompt(
  userPrompt: string,
  editIntent: EditIntent,
  primaryFiles: string[],
  contextFiles: string[],
  manifest: FileManifest
): string {
  const sections: string[] = [];
  
  // Add edit examples first for better understanding
  if (editIntent.type !== EditType.FULL_REBUILD) {
    sections.push(getEditExamplesPrompt());
  }
  
  // Add edit intent section
  sections.push(`## Edit Intent
Type: ${editIntent.type}
Description: ${editIntent.description}
Confidence: ${(editIntent.confidence * 100).toFixed(0)}%

User Request: "${userPrompt}"`);
  
  // Add file structure overview
  sections.push(buildFileStructureSection(manifest));
  
  // Add component patterns
  const fileList = Object.keys(manifest.files).map(f => f.replace('/home/user/app/', '')).join('\n');
  sections.push(getComponentPatternPrompt(fileList));
  
  // Add primary files section
  if (primaryFiles.length > 0) {
    sections.push(`## Files to Edit
${primaryFiles.map(f => {
  const fileInfo = manifest.files[f];
  return `- ${f}${fileInfo?.componentInfo ? ` (${fileInfo.componentInfo.name} component)` : ''}`;
}).join('\n')}`);
  }
  
  // Add context files section
  if (contextFiles.length > 0) {
    sections.push(`## Context Files (for reference only)
${contextFiles.map(f => {
  const fileInfo = manifest.files[f];
  return `- ${f}${fileInfo?.componentInfo ? ` (${fileInfo.componentInfo.name} component)` : ''}`;
}).join('\n')}`);
  }
  
  // Add specific instructions based on edit type
  sections.push(buildEditInstructions(editIntent.type));
  
  // Add component relationships if relevant
  if (editIntent.type === EditType.UPDATE_COMPONENT || 
      editIntent.type === EditType.ADD_FEATURE) {
    sections.push(buildComponentRelationships(primaryFiles, manifest));
  }
  
  return sections.join('\n\n');
}

/**
 * Build file structure overview section
 */
function buildFileStructureSection(manifest: FileManifest): string {
  const allFiles = Object.entries(manifest.files)
    .map(([path]) => path.replace('/home/user/app/', ''))
    .filter(path => !path.includes('node_modules'))
    .sort();
  
  const componentFiles = Object.entries(manifest.files)
    .filter(([, info]) => info.type === 'component' || info.type === 'page')
    .map(([path, info]) => ({
      path: path.replace('/home/user/app/', ''),
      name: info.componentInfo?.name || path.split('/').pop(),
      type: info.type,
    }));
  
  return `## 🚨 EXISTING PROJECT FILES - DO NOT CREATE NEW FILES WITH SIMILAR NAMES 🚨

### ALL PROJECT FILES (${allFiles.length} files)
\`\`\`
${allFiles.join('\n')}
\`\`\`

### Component Files (USE THESE EXACT NAMES)
${componentFiles.map(f => 
  `- ${f.name} → ${f.path} (${f.type})`
).join('\n')}

### CRITICAL: Component Relationships
**ALWAYS CHECK App.jsx FIRST** to understand what components exist and how they're imported!

Common component overlaps to watch for:
- "nav" or "navigation" → Often INSIDE Header.jsx, not a separate file
- "menu" → Usually part of Header/Nav, not separate
- "logo" → Typically in Header, not standalone

When user says "nav" or "navigation":
1. First check if Header.jsx exists
2. Look inside Header.jsx for navigation elements
3. Only create Nav.jsx if navigation doesn't exist anywhere

Entry Point: ${manifest.entryPoint}

### Routes
${manifest.routes.map(r => 
  `- ${r.path} → ${r.component.split('/').pop()}`
).join('\n') || 'No routes detected'}`;
}

/**
 * Build edit-type specific instructions
 */
function buildEditInstructions(editType: EditType): string {
  const instructions: Record<EditType, string> = {
    [EditType.UPDATE_COMPONENT]: `## SURGICAL EDIT INSTRUCTIONS
- You MUST preserve 99% of the original code
- ONLY edit the specific component(s) mentioned
- Make ONLY the minimal change requested
- DO NOT rewrite or refactor unless explicitly asked
- DO NOT remove any existing code unless explicitly asked
- DO NOT change formatting or structure
- Preserve all imports and exports
- Maintain the existing code style
- Return the COMPLETE file with the surgical change applied
- Think of yourself as a surgeon making a precise incision, not an artist repainting`,
    
    [EditType.ADD_FEATURE]: `## Instructions
- Create new components in appropriate directories
- IMPORTANT: Update parent components to import and use the new component
- Update routing if adding new pages
- Follow existing patterns and conventions
- Add necessary styles to match existing design
- Example workflow:
  1. Create NewComponent.jsx
  2. Import it in the parent: import NewComponent from './NewComponent'
  3. Use it in the parent's render: <NewComponent />`,
    
    [EditType.FIX_ISSUE]: `## Instructions
- Identify and fix the specific issue
- Test the fix doesn't break other functionality
- Preserve existing behavior except for the bug
- Add error handling if needed`,
    
    [EditType.UPDATE_STYLE]: `## SURGICAL STYLE EDIT INSTRUCTIONS
- Change ONLY the specific style/class mentioned
- If user says "change background to blue", change ONLY the background class
- DO NOT touch any other styles, classes, or attributes
- DO NOT refactor or "improve" the styling
- DO NOT change the component structure
- Preserve ALL other classes and styles exactly as they are
- Return the COMPLETE file with only the specific style change`,
    
    [EditType.REFACTOR]: `## Instructions
- Improve code quality without changing functionality
- Follow project conventions
- Maintain all existing features
- Improve readability and maintainability`,
    
    [EditType.FULL_REBUILD]: `## Instructions
- You may rebuild the entire application
- Keep the same core functionality
- Improve upon the existing design
- Use modern best practices`,
    
    [EditType.ADD_DEPENDENCY]: `## Instructions
- Update package.json with new dependency
- Add necessary import statements
- Configure the dependency if needed
- Update any build configuration`,
  };
  
  return instructions[editType] || instructions[EditType.UPDATE_COMPONENT];
}

/**
 * Build component relationship information
 */
function buildComponentRelationships(
  files: string[],
  manifest: FileManifest
): string {
  const relationships: string[] = ['## Component Relationships'];
  
  for (const file of files) {
    const fileInfo = manifest.files[file];
    if (!fileInfo?.componentInfo) continue;
    
    const componentName = fileInfo.componentInfo.name;
    const treeNode = manifest.componentTree[componentName];
    
    if (treeNode) {
      relationships.push(`\n### ${componentName}`);
      
      if (treeNode.imports.length > 0) {
        relationships.push(`Imports: ${treeNode.imports.join(', ')}`);
      }
      
      if (treeNode.importedBy.length > 0) {
        relationships.push(`Used by: ${treeNode.importedBy.join(', ')}`);
      }
      
      if (fileInfo.componentInfo.childComponents?.length) {
        relationships.push(`Renders: ${fileInfo.componentInfo.childComponents.join(', ')}`);
      }
    }
  }
  
  return relationships.join('\n');
}

/**
 * Get file content for selected files
 */
export async function getFileContents(
  files: string[],
  manifest: FileManifest
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  
  for (const file of files) {
    const fileInfo = manifest.files[file];
    if (fileInfo) {
      contents[file] = fileInfo.content;
    }
  }
  
  return contents;
}

/**
 * Format files for AI context
 */
export function formatFilesForAI(
  primaryFiles: Record<string, string>,
  contextFiles: Record<string, string>
): string {
  const sections: string[] = [];
  
  // Add clear header explaining the file organization
  sections.push('# File Organization for Edit Request\n');
  sections.push('The files below are organized into two categories to help you understand what to modify vs what to reference:\n');
  
  // Add primary files with enhanced heading
  sections.push('## 📝 Files to Edit\n');
  sections.push('**THESE are the files you should modify to fulfill the user\'s request.**\n');
  sections.push('🚨 You MUST ONLY generate the files listed in this section. Do NOT generate any other files! 🚨\n');
  sections.push('⚠️ CRITICAL: Return the COMPLETE file - NEVER truncate with "..." or skip any lines! ⚠️\n');
  sections.push('The file MUST include ALL imports, ALL functions, ALL JSX, and ALL closing tags.\n\n');
  
  if (Object.keys(primaryFiles).length === 0) {
    sections.push('*No primary files identified for editing. Please analyze the request and determine which files need modification.*\n\n');
  } else {
    for (const [path, content] of Object.entries(primaryFiles)) {
      sections.push(`### ${path}
**IMPORTANT: This is the COMPLETE file. Your output must include EVERY line shown below, modified only where necessary.**
\`\`\`${getFileExtension(path)}
${content}
\`\`\`
`);
    }
  }
  
  // Add context files with enhanced heading and explanation
  if (Object.keys(contextFiles).length > 0) {
    sections.push('\n## 📚 Context Files for Reference\n');
    sections.push('**THESE files are provided for context and understanding relationships.**\n');
    sections.push('- Use these to understand component APIs, import paths, and architectural patterns\n');
    sections.push('- DO NOT modify these files unless they are explicitly mentioned in the user\'s request\n');
    sections.push('- These files show you how components are connected and what dependencies exist\n\n');
    
    for (const [path, content] of Object.entries(contextFiles)) {
      // Truncate very large context files to save tokens
      let truncatedContent = content;
      if (content.length > 2000) {
        truncatedContent = content.substring(0, 2000) + '\n// ... [truncated for context length]';
      }
      
      sections.push(`### ${path} (Reference Only)
\`\`\`${getFileExtension(path)}
${truncatedContent}
\`\`\`
`);
    }
  }
  
  // Add final instructions
  sections.push('\n## 🎯 Instructions\n');
  sections.push('1. **Focus on "Files to Edit"** - These are your primary targets\n');
  sections.push('2. **Reference "Context Files"** - Use these to understand relationships and APIs\n');
  sections.push('3. **Maintain consistency** - Follow patterns shown in the context files\n');
  sections.push('4. **Preserve existing functionality** - Only change what the user specifically requested\n');
  
  return sections.join('\n');
}

/**
 * Get file extension for syntax highlighting
 */
function getFileExtension(path: string): string {
  const ext = path.split('.').pop() || '';
  const mapping: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'css': 'css',
    'json': 'json',
  };
  return mapping[ext] || ext;
}