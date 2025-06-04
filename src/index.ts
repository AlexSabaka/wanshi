// Main entry point - re-export CLI
export * from './cli';

// Also export core functionality for programmatic use
export * from './core/DirectoryProcessor';
export * from './core/processor';
export * from './core/llm/OllamaService';
export * from './core/llm/EmbeddingService';
export * from './core/knowledge/KnowledgeGraphBuilder';
export * from './core/knowledge/merging/KnowledgeMerger';
export * from './core/knowledge/search/KnowledgeGraphSearch';
export * from './core/export/KnowledgeGraphConverter';