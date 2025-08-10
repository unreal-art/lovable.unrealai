// Conversation memory utilities for enhanced AI context

import type { ConversationState, ConversationMessage, AppliedFile } from '@/types/conversation';

/**
 * Build a concise, token-efficient conversation history prompt
 */
export function buildConversationHistoryPrompt(conversationState: ConversationState | null): string {
  if (!conversationState || conversationState.context.messages.length <= 1) {
    return '';
  }

  const context = conversationState.context;
  const sections: string[] = [];

  // Add session overview
  sections.push('## 🧠 CONVERSATION MEMORY');
  sections.push(`Session started: ${new Date(conversationState.startedAt).toLocaleTimeString()}`);
  sections.push(`Total interactions: ${context.sessionSummary?.totalInteractions || context.messages.length}`);

  // Add recent user prompts and AI actions (last 3-5 interactions)
  const recentInteractions = getRecentInteractions(context.messages, 5);
  if (recentInteractions.length > 0) {
    sections.push('\n### Recent Conversation:');
    recentInteractions.forEach((interaction, index) => {
      const timeAgo = getTimeAgo(interaction.userMessage.timestamp);
      sections.push(`\n**${recentInteractions.length - index}. User (${timeAgo}):** "${truncateText(interaction.userMessage.content, 80)}"`);
      
      if (interaction.aiMessage) {
        const aiSummary = interaction.aiMessage.metadata?.actionSummary || 
                         generateActionSummary(interaction.aiMessage);
        sections.push(`**AI Response:** ${aiSummary}`);
        
        if (interaction.aiMessage.metadata?.appliedFiles?.length) {
          const fileActions = summarizeFileActions(interaction.aiMessage.metadata.appliedFiles);
          sections.push(`**Files:** ${fileActions}`);
        }
      }
    });
  }

  // Add session summary
  if (context.sessionSummary) {
    const summary = context.sessionSummary;
    sections.push('\n### Session Summary:');
    
    if (summary.filesCreated.length > 0) {
      sections.push(`**Created files:** ${summary.filesCreated.slice(-5).join(', ')}${summary.filesCreated.length > 5 ? ` (+${summary.filesCreated.length - 5} more)` : ''}`);
    }
    
    if (summary.filesModified.length > 0) {
      sections.push(`**Modified files:** ${summary.filesModified.slice(-5).join(', ')}${summary.filesModified.length > 5 ? ` (+${summary.filesModified.length - 5} more)` : ''}`);
    }
    
    if (summary.componentsCreated.length > 0) {
      sections.push(`**Components created:** ${summary.componentsCreated.slice(-5).join(', ')}${summary.componentsCreated.length > 5 ? ` (+${summary.componentsCreated.length - 5} more)` : ''}`);
    }
    
    if (summary.packagesAdded.length > 0) {
      sections.push(`**Packages added:** ${summary.packagesAdded.join(', ')}`);
    }
  }

  // Add user preferences
  const userPrefs = analyzeUserPreferences(context.messages);
  if (userPrefs.commonPatterns.length > 0) {
    sections.push('\n### User Patterns:');
    sections.push(`**Edit style:** ${userPrefs.preferredEditStyle}`);
    if (userPrefs.commonPatterns.length > 0) {
      sections.push(`**Common requests:** ${userPrefs.commonPatterns.slice(0, 3).join(', ')}`);
    }
  }

  // Add current context
  if (context.currentTopic) {
    sections.push(`\n### Current Focus: ${context.currentTopic}`);
  }

  // Add recent major changes
  const recentChanges = context.projectEvolution.majorChanges.slice(-2);
  if (recentChanges.length > 0) {
    sections.push('\n### Recent Major Changes:');
    recentChanges.forEach(change => {
      const timeAgo = getTimeAgo(change.timestamp);
      sections.push(`- ${change.description} (${timeAgo})`);
    });
  }

  // Limit total length to prevent context overflow
  let result = sections.join('\n');
  if (result.length > 2000) {
    result = result.substring(0, 2000) + '\n[Memory truncated to prevent context overflow]';
  }

  return result;
}

/**
 * Update conversation state with new interaction data
 */
export function updateConversationMemory(
  conversationState: ConversationState,
  userMessage: ConversationMessage,
  aiResponse?: {
    generatedCode?: string;
    appliedFiles?: AppliedFile[];
    actionSummary?: string;
    fileCount?: number;
    componentCount?: number;
    packagesToInstall?: string[];
  }
): void {
  // Add user message
  conversationState.context.messages.push(userMessage);

  // Create AI message if response provided
  if (aiResponse) {
    const aiMessage: ConversationMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      content: aiResponse.actionSummary || 'Generated code response',
      timestamp: Date.now(),
      metadata: {
        generatedCode: aiResponse.generatedCode,
        appliedFiles: aiResponse.appliedFiles,
        actionSummary: aiResponse.actionSummary,
        fileCount: aiResponse.fileCount,
        componentCount: aiResponse.componentCount,
        addedPackages: aiResponse.packagesToInstall,
      }
    };
    conversationState.context.messages.push(aiMessage);

    // Update session summary
    updateSessionSummary(conversationState, aiResponse);
  }

  // Clean up old messages to prevent unbounded growth
  if (conversationState.context.messages.length > 20) {
    conversationState.context.messages = conversationState.context.messages.slice(-15);
  }

  conversationState.lastUpdated = Date.now();
}

/**
 * Get recent user-AI interaction pairs
 */
function getRecentInteractions(messages: ConversationMessage[], maxCount: number) {
  const interactions = [];
  let userMessage: ConversationMessage | null = null;

  // Go through messages in reverse to get most recent first
  for (let i = messages.length - 1; i >= 0 && interactions.length < maxCount; i--) {
    const message = messages[i];
    
    if (message.role === 'user') {
      if (userMessage) {
        // We found a previous user message without an AI response
        interactions.unshift({ userMessage, aiMessage: null });
      }
      userMessage = message;
    } else if (message.role === 'assistant' && userMessage) {
      // Found AI response to current user message
      interactions.unshift({ userMessage, aiMessage: message });
      userMessage = null;
    }
  }

  // Add any remaining user message without AI response
  if (userMessage && interactions.length < maxCount) {
    interactions.unshift({ userMessage, aiMessage: null });
  }

  return interactions.slice(0, maxCount);
}

/**
 * Generate action summary from AI message metadata
 */
function generateActionSummary(aiMessage: ConversationMessage): string {
  const metadata = aiMessage.metadata;
  if (!metadata) return 'Generated response';

  const parts = [];
  
  if (metadata.fileCount) {
    if (metadata.fileCount === 1) {
      parts.push('Modified 1 file');
    } else {
      parts.push(`Modified ${metadata.fileCount} files`);
    }
  }

  if (metadata.componentCount) {
    if (metadata.componentCount === 1) {
      parts.push('created 1 component');
    } else {
      parts.push(`created ${metadata.componentCount} components`);
    }
  }

  if (metadata.addedPackages?.length) {
    parts.push(`added ${metadata.addedPackages.length} package${metadata.addedPackages.length > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Generated code';
}

/**
 * Summarize file actions from applied files
 */
function summarizeFileActions(appliedFiles: AppliedFile[]): string {
  const actions = appliedFiles.reduce((acc, file) => {
    const fileName = file.path.split('/').pop() || file.path;
    acc[file.action] = acc[file.action] || [];
    acc[file.action].push(fileName);
    return acc;
  }, {} as Record<string, string[]>);

  const summaries = [];
  if (actions.created?.length) {
    summaries.push(`created ${actions.created.slice(0, 3).join(', ')}${actions.created.length > 3 ? ` (+${actions.created.length - 3})` : ''}`);
  }
  if (actions.modified?.length) {
    summaries.push(`modified ${actions.modified.slice(0, 3).join(', ')}${actions.modified.length > 3 ? ` (+${actions.modified.length - 3})` : ''}`);
  }
  if (actions.deleted?.length) {
    summaries.push(`deleted ${actions.deleted.join(', ')}`);
  }

  return summaries.join(', ');
}

/**
 * Analyze user preferences from conversation history
 */
function analyzeUserPreferences(messages: ConversationMessage[]): {
  commonPatterns: string[];
  preferredEditStyle: 'targeted' | 'comprehensive';
} {
  const userMessages = messages.filter(m => m.role === 'user');
  const patterns: string[] = [];
  
  // Count edit-related keywords
  let targetedEditCount = 0;
  let comprehensiveEditCount = 0;
  
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for targeted edit patterns
    if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
      targetedEditCount++;
    }
    
    // Check for comprehensive edit patterns
    if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
      comprehensiveEditCount++;
    }
    
    // Extract common request patterns
    if (content.includes('hero')) patterns.push('hero section edits');
    if (content.includes('header')) patterns.push('header modifications');
    if (content.includes('color') || content.includes('style')) patterns.push('styling changes');
    if (content.includes('button')) patterns.push('button updates');
    if (content.includes('animation')) patterns.push('animation requests');
  });
  
  return {
    commonPatterns: [...new Set(patterns)].slice(0, 3), // Top 3 unique patterns
    preferredEditStyle: targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'
  };
}

/**
 * Update session summary with new interaction data
 */
function updateSessionSummary(
  conversationState: ConversationState,
  aiResponse: {
    appliedFiles?: AppliedFile[];
    packagesToInstall?: string[];
    actionSummary?: string;
  }
): void {
  if (!conversationState.context.sessionSummary) {
    conversationState.context.sessionSummary = {
      totalInteractions: 0,
      filesCreated: [],
      filesModified: [],
      packagesAdded: [],
      componentsCreated: []
    };
  }

  const summary = conversationState.context.sessionSummary;
  summary.totalInteractions++;
  summary.lastActionSummary = aiResponse.actionSummary;

  if (aiResponse.appliedFiles) {
    aiResponse.appliedFiles.forEach(file => {
      const fileName = file.path;
      
      if (file.action === 'created' && !summary.filesCreated.includes(fileName)) {
        summary.filesCreated.push(fileName);
        
        if (file.componentName && !summary.componentsCreated.includes(file.componentName)) {
          summary.componentsCreated.push(file.componentName);
        }
      } else if (file.action === 'modified' && !summary.filesModified.includes(fileName)) {
        summary.filesModified.push(fileName);
      }
    });
  }

  if (aiResponse.packagesToInstall) {
    aiResponse.packagesToInstall.forEach(pkg => {
      if (!summary.packagesAdded.includes(pkg)) {
        summary.packagesAdded.push(pkg);
      }
    });
  }
}

/**
 * Get human-readable time ago string
 */
function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
