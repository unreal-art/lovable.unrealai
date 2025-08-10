// Conversation tracking types for maintaining context across interactions

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    editedFiles?: string[]; // Files edited in this interaction
    addedPackages?: string[]; // Packages added in this interaction
    editType?: string; // Type of edit performed
    sandboxId?: string; // Sandbox ID at time of message
    // Enhanced tracking for AI responses
    generatedCode?: string; // Raw generated code from AI (for assistant messages)
    appliedFiles?: AppliedFile[]; // Files that were actually applied to sandbox
    actionSummary?: string; // Brief summary of what the AI did
    fileCount?: number; // Number of files generated/modified
    componentCount?: number; // Number of components created
  };
}

export interface AppliedFile {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  size: number; // File size in characters
  componentName?: string; // Component name if it's a React component
}

export interface ConversationEdit {
  timestamp: number;
  userRequest: string;
  editType: string;
  targetFiles: string[];
  confidence: number;
  outcome: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  edits: ConversationEdit[];
  currentTopic?: string; // Current focus area (e.g., "header styling", "hero section")
  projectEvolution: {
    initialState?: string; // Description of initial project state
    majorChanges: Array<{
      timestamp: number;
      description: string;
      filesAffected: string[];
    }>;
  };
  userPreferences: {
    editStyle?: 'targeted' | 'comprehensive'; // How the user prefers edits
    commonRequests?: string[]; // Common patterns in user requests
    packagePreferences?: string[]; // Commonly used packages
  };
  // Enhanced session tracking
  sessionSummary: {
    totalInteractions: number;
    filesCreated: string[]; // All files created in this session
    filesModified: string[]; // All files modified in this session
    packagesAdded: string[]; // All packages added in this session
    componentsCreated: string[]; // All React components created
    lastActionSummary?: string; // Summary of the most recent AI action
    sessionGoals?: string[]; // Inferred goals for this session
  };
}

export interface ConversationState {
  conversationId: string;
  startedAt: number;
  lastUpdated: number;
  context: ConversationContext;
}