# 🛠️ Development Roadmap

## ✅ Completed (Phase 1)

- [x] Core CLI interface with comprehensive options
- [x] Multi-format file processing (text, PDF, images)
- [x] Smart text chunking with overlap
- [x] Hierarchical merging algorithm
- [x] MCP compatibility layer
- [x] Quality evaluation system
- [x] Context-aware processing
- [x] Multi-modal knowledge graph generation (audio transcription, images)

## 🚧 Phase 2: Document Classification & Prompt Routing

### Document Classification System

- [ ] **Implement HeuristicContentClassifier** with DocumentClassConfig-driven approach
- [ ] **Define 12 document classes** with distinct NER patterns:
  - **Domain-specific**: code, financial, medical, legal, research, transcript
  - **Structural**: tabular, communication, documentation  
  - **Generic fallbacks**: technical, narrative, reference
- [ ] **Multi-factor scoring system**: extension (40%) + path (30%) + content (30%) weighting
- [ ] **Regex-based pattern matching** for file patterns, path patterns, and content patterns
- [ ] **Comprehensive test suite** with edge cases and debugging utilities

### Specialized Prompt System

- [ ] **Create specialized prompts** for each document class with relevant examples
- [ ] **Context-aware prompt enhancement** with file-specific metadata
- [ ] **Fallback mechanism** for low-confidence classifications
- [ ] **Mixed domain handling** strategy for complex documents (medical/financial, legal/technical)

### Testing & Validation

- [ ] **Test simple heuristics first** without mixed domain complexity
- [ ] **Measure classification accuracy** on real kg-gen project files
- [ ] **Evaluate prompt routing effectiveness** vs generic approach
- [ ] **Consider hybrid scoring** (coverage + density) if simple approach insufficient

## 🧪 Phase 3: Testing And Quality Control

- [ ] Set up Jest/Vitest testing framework
- [ ] Create unit tests for core services
- [ ] Add integration tests for end-to-end flows
- [ ] Mock LLM responses for consistent testing
- [ ] Add test coverage reporting
- [ ] File-based embeddings caching
- [ ] Implement quality evaluator from README specs
- [ ] Add entity/observation validation
- [ ] Create hallucination detection system
- [ ] Implement graph consistency checker

## Phase 4: Vector Database Integration

- [ ] ChromaDB integration for semantic search
- [ ] Implement graph database support (Neo4j)
- [ ] Add real-time processing with file watchers
- [ ] Support for incremental updates
- [ ] Incremental indexing for large codebases
- [ ] Vector-based context retrieval
- [ ] Hybrid search (vector + metadata)

## Phase 5: Advanced Retrieval

- [ ] Cross-encoder reranking models
- [ ] Quality-aware context selection
- [ ] Neo4j integration for graph traversal
- [ ] Hybrid vector + graph search

## Phase 6: Production Features

- [ ] Embeddings caching with LRU
- [ ] Performance monitoring and metrics
- [ ] LoRa fine-tuning dataset generation
- [ ] Advanced CLI features and integrations

## 🔬 Research Goals

- [ ] **BERT Document Classification**: If heuristics insufficient, train BERT on auto-generated labels
- [ ] **LoRa fine-tuning adapters** for domain-specific knowledge extraction
- [ ] **Custom KBLaM implementation** for knowledge-based language modeling
- [ ] **Comparative analysis** with other extraction methods
- [ ] **Domain-specific prompt optimization** based on classification results
- [ ] **Multi-modal knowledge graphs** with document type awareness
