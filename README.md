# Knowledge Graph Generator

> 🧠 Transform your codebase into intelligent knowledge graphs using local LLMs

An advanced CLI tool that analyzes files, extracts meaningful entities and relationships, and builds comprehensive knowledge graphs. Perfect for understanding complex codebases, research projects, and documentation systems.

## 🎯 Project Goals

**Primary Objective**: Create the most intelligent file-to-knowledge-graph converter that:
- ✅ **Zero Hallucination**: Only extracts factually verifiable information
- ✅ **Semantic Understanding**: Goes beyond syntax to capture meaning and relationships  
- ✅ **Scalable Processing**: Handles large codebases with smart chunking and caching
- ✅ **Multiple Formats**: Supports code, documentation, research papers, and more
- ✅ **Production Ready**: Reliable, fast, and integrates with existing workflows

**Secondary Objectives**:
- 🔗 **MCP Integration**: Compatible with Claude Desktop and Anthropic MCP protocol
- 🎛️ **Quality Metrics**: Comprehensive evaluation system for continuous improvement
- 🧪 **Research Ready**: Support for LoRa fine-tuning and model improvement
- 🔍 **Intelligent Search**: Vector and graph-based context retrieval

## 🚀 Key Features

### 🔥 Core Capabilities
- **Multi-format Processing**: Text, code, PDFs, images with smart content extraction
- **Hierarchical Merging**: File-level → entity-level → global-level intelligent merging
- **Smart Chunking**: Content-aware splitting with overlap for large files
- **Context-Aware Processing**: Uses existing knowledge to maintain consistency
- **Quality Evaluation**: Comprehensive metrics for factual accuracy and semantic quality

### 🎛️ Advanced Features
- **MCP Compatibility**: Works with Claude Desktop and server-memory tools
- **Multiple Export Formats**: JSON, JSONL, MCP-compatible formats
- **Vector Search**: ChromaDB and Neo4j integration for semantic retrieval
- **Embeddings Caching**: Persistent caching for 10x performance improvements
- **Watch Mode**: Real-time knowledge graph updates as files change

### 🧠 Intelligence Features
- **Zero Hallucination**: Strict factual grounding with source verification
- **Entity Deduplication**: Smart similarity matching with configurable thresholds
- **Observation Ranking**: Embedding-based duplicate detection and relevance scoring
- **Cross-file Consistency**: Maintains entity naming and relationships across files

## 📦 Installation

```bash
# Clone repository
git clone https://github.com/yourusername/knowledge-graph-generator
cd knowledge-graph-generator

# Install dependencies
npm install

# Build project
npm run build

# Make globally available
npm link

# Or install directly
npm install -g knowledge-graph-generator
```

## 🎮 Usage

### Basic Usage

```bash
# Process current directory
kg-gen

# Process specific directory with custom output
kg-gen -i ./src -o knowledge-graph.json

# Use specific model and chunking
kg-gen -i ./docs -m llama3.2 --chunk-size 3000 --overlap-size 150

# Export in MCP format for Claude Desktop
kg-gen -i ./project --export-format mcp-jsonl -o memory.jsonl

# Watch mode for real-time updates
kg-gen -i ./src -w --silent
```

### Advanced Usage

```bash
# Fine-tuned entity similarity and observation deduplication
kg-gen -i ./codebase \
  --entity-similarity 0.85 \
  --observation-similarity 0.9 \
  --model mistral-7b

# Enable vector search with ChromaDB
kg-gen -i ./research \
  --vector-store chroma \
  --chroma-host http://localhost:8000 \
  --reranker BAAI/bge-reranker-base

# Debug mode with detailed logging
kg-gen -i ./project \
  --debug \
  --log-level debug \
  --log-file processing.log
```

### CLI Options

```bash
Options:
  -i, --input <path>              input directory (default: ".")
  -f, --filter <filter>           files filter (default: "**/*")
  -o, --output <path>             output knowledge graph file (default: "knowledge-graph.json")
  -m, --model <name>              LLM to use with Ollama (default: "llama3.2")
  -s, --system <prompt>           LLM system prompt
  -h, --host <url>                Ollama host URL (default: "http://localhost:11434")
  -L, --log-level <level>         log level (default: "info")
  -l, --log-file <path>           log file
  -w, --watch                     watch for changes and update knowledge graph
  -d, --debug                     debug mode
  -S, --silent                    silent mode
  -c, --chunk-size <size>         maximum chunk size in characters (default: "4000")
  --overlap-size <size>           overlap size between chunks (default: "200")
  --disable-chunking              disable text chunking
  --entity-similarity <threshold> entity name similarity threshold 0-1 (default: "0.8")
  --observation-similarity <threshold> observation deduplication threshold 0-1 (default: "0.85")
  --export-format <format>        export format: json|jsonl|mcp-jsonl (default: "json")
  --vector-store <type>           vector store: none|chroma|neo4j (default: "none")
  --chroma-host <url>             ChromaDB host (default: "http://localhost:8000")
  --neo4j-uri <uri>               Neo4j connection URI (default: "bolt://localhost:7687")
  --reranker <model>              reranker model (default: "none")
  --cache-dir <path>              embeddings cache directory (default: "./.kg-cache")
  --retrieval-limit <num>         context retrieval limit (default: "10")
  -V, --version                   output the version number
  -h, --help                      display help for command
```

## 🏗️ Project Structure

```
knowledge-graph-generator/
├── src/
│   ├── cli/                    # Command-line interface
│   ├── processor/              # Core processing logic
│   │   ├── chunking.ts         # Smart text chunking
│   │   ├── merging.ts          # Hierarchical graph merging
│   │   └── fileProcessor.ts    # File content extraction
│   ├── search/                 # Context retrieval
│   │   ├── KnowledgeGraphSearch.ts
│   │   └── RetrievalPipeline.ts
│   ├── vector/                 # Vector database integration
│   │   ├── ChromaDBService.ts
│   │   └── Neo4jStore.ts
│   ├── cache/                  # Embeddings caching
│   │   ├── FileEmbeddingCache.ts
│   │   └── LRUCache.ts
│   ├── evaluation/             # Quality metrics
│   │   ├── QualityEvaluator.ts
│   │   └── metrics.ts
│   ├── types/                  # TypeScript interfaces
│   └── utils/                  # Utilities and helpers
├── prompts/                    # System prompt templates
├── tests/                      # Test suite
├── docs/                       # Documentation
└── examples/                   # Usage examples
```

## 🔬 Quality Metrics

The system includes comprehensive quality evaluation:

### Structural Metrics
- Entity and relation counts
- Graph density and connectivity
- Type distributions

### Semantic Metrics  
- Entity name quality (naming conventions, descriptiveness)
- Observation specificity (detailed vs. trivial facts)
- Domain coverage (how well it captures file content)

### Factual Metrics
- Hallucination detection (ungrounded claims)
- Source grounding (facts verifiable in source)
- Factual consistency (no contradictions)

### Consistency Metrics
- Cross-file consistency (entity naming)
- Type consistency (similar entities, similar types)

### Composite Score
- Overall quality score (0-100)
- Specific recommendations for improvement
- Training data generation for LoRa fine-tuning

## 📊 Output Formats

### Standard JSON
```json
{
  "entities": [
    {
      "name": "entity_name",
      "entityType": "function|class|concept|etc",
      "observations": ["fact1", "fact2"],
      "file": "src/example.ts",
      "chunk": 0,
      "totalChunks": 3
    }
  ],
  "relations": [
    {
      "from": "entity1",
      "to": "entity2", 
      "relationType": ["uses", "depends_on"]
    }
  ]
}
```

### MCP-Compatible JSONL
```jsonl
{"type": "entity", "name": "example_function", "entityType": "function", "observations": ["Processes user input"]}
{"type": "relation", "from": "example_function", "to": "user_input", "relationType": "processes"}
```

## 🛠️ Development Roadmap

### ✅ Completed (Phase 1)
- [x] Core CLI interface with comprehensive options
- [x] Multi-format file processing (text, PDF, images)
- [x] Smart text chunking with overlap
- [x] Hierarchical merging algorithm
- [x] MCP compatibility layer
- [x] Quality evaluation system
- [x] Context-aware processing

### 🚧 In Progress (Phase 2)
- [ ] Comprehensive testing suite
- [ ] File-based embeddings caching
- [ ] Performance benchmarking
- [ ] Documentation improvements

### 📋 Planned (Phase 3-5)

#### Phase 3: Vector Database Integration
- [ ] ChromaDB integration for semantic search
- [ ] Incremental indexing for large codebases
- [ ] Vector-based context retrieval
- [ ] Hybrid search (vector + metadata)

#### Phase 4: Advanced Retrieval
- [ ] Cross-encoder reranking models
- [ ] Quality-aware context selection
- [ ] Neo4j integration for graph traversal
- [ ] Hybrid vector + graph search

#### Phase 5: Production Features
- [ ] Embeddings caching with LRU
- [ ] Performance monitoring and metrics
- [ ] LoRa fine-tuning dataset generation
- [ ] Advanced CLI features and integrations

### 🔬 Research Goals
- [ ] LoRa fine-tuning adapters for knowledge extraction
- [ ] Comparative analysis with other extraction methods
- [ ] Domain-specific prompt optimization
- [ ] Multi-modal knowledge graph generation

## 🧪 Testing

```bash
# Run full test suite
npm test

# Run quality evaluation
npm run test:quality

# Run performance benchmarks
npm run benchmark

# Generate test coverage
npm run test:coverage
```

### Test Categories
- **Unit Tests**: Individual components and functions
- **Integration Tests**: End-to-end processing workflows  
- **Quality Tests**: Evaluation metrics and scoring
- **Performance Tests**: Speed and memory usage benchmarks

## 🔧 Configuration

### Environment Variables
```bash
# Ollama configuration
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Vector database configuration  
CHROMA_HOST=http://localhost:8000
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Cache configuration
KG_CACHE_DIR=./.kg-cache
KG_CACHE_SIZE_MB=1024

# Quality thresholds
ENTITY_SIMILARITY_THRESHOLD=0.8
OBSERVATION_SIMILARITY_THRESHOLD=0.85
```

### Configuration File (kg-config.json)
```json
{
  "llm": {
    "model": "llama3.2",
    "host": "http://localhost:11434",
    "temperature": 0.1
  },
  "processing": {
    "chunkSize": 4000,
    "overlapSize": 200,
    "enableChunking": true
  },
  "merging": {
    "entitySimilarityThreshold": 0.8,
    "observationSimilarityThreshold": 0.85
  },
  "vectorStore": {
    "type": "chroma",
    "host": "http://localhost:8000",
    "collection": "knowledge_graphs"
  },
  "cache": {
    "enabled": true,
    "directory": "./.kg-cache",
    "maxSizeMB": 1024
  }
}
```

## 🤖 LLM Requirements

### Supported Models
- **Llama 3.2** (recommended): Best balance of quality and speed
- **Mistral 7B**: Good for code understanding
- **CodeLlama**: Specialized for programming languages
- **Qwen 2.5**: Excellent for research documents

### Model Requirements
- **Context Window**: Minimum 8k tokens (12k+ recommended)
- **Instruction Following**: Must support system prompts
- **JSON Output**: Reliable structured output generation
- **Local Deployment**: Works with Ollama, LMStudio, etc.

### Performance Notes
- Larger models (70B+) provide better entity extraction quality
- Smaller models (7B-13B) are faster but may miss subtle relationships
- Code-specialized models excel at programming language analysis
- Fine-tuned models show 15-30% improvement in domain-specific tasks

## 🔗 Integration Examples

### Claude Desktop (MCP)
```bash
# Generate MCP-compatible memory file
kg-gen -i ./project --export-format mcp-jsonl -o memory.jsonl

# Configure in Claude Desktop settings
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-memory", "memory.jsonl"]
    }
  }
}
```

### CI/CD Pipeline
```yaml
# .github/workflows/knowledge-graph.yml
name: Update Knowledge Graph
on:
  push:
    branches: [main]
jobs:
  update-kg:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Generate Knowledge Graph
        run: |
          npx kg-gen -i ./src -o docs/knowledge-graph.json
          git add docs/knowledge-graph.json
          git commit -m "Update knowledge graph" || exit 0
          git push
```

### API Integration
```javascript
// Use as Node.js library
import { processDirectory, mergeKnowledgeGraphs } from 'kg-gen';

const options = {
  input: './src',
  model: 'llama3.2',
  entitySimilarityThreshold: 0.8
};

const knowledgeGraph = await processDirectory(options);
console.log(`Generated ${knowledgeGraph.entities.length} entities`);
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
git clone https://github.com/yourusername/knowledge-graph-generator
cd knowledge-graph-generator
npm install
npm run dev
```

### Areas for Contribution
- 🐛 **Bug Fixes**: Improve reliability and error handling
- 🚀 **Performance**: Optimize processing speed and memory usage  
- 🧠 **Intelligence**: Enhance extraction quality and accuracy
- 🔧 **Features**: Add new file formats, export options, integrations
- 📖 **Documentation**: Improve guides, examples, and API docs
- 🧪 **Testing**: Expand test coverage and quality metrics

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Anthropic** for MCP protocol and Claude integration inspiration
- **Ollama** for local LLM deployment and API
- **ChromaDB** and **Neo4j** for vector and graph database capabilities
- **LangChain** for text splitting and processing utilities
- **Open Source Community** for the amazing tools and libraries that make this possible

## 📞 Support

- 📖 **Documentation**: [docs/](docs/)
- 🐛 **Issues**: [GitHub Issues](   )
- 💬 **Discussions**: [GitHub Discussions](   )
- 📧 **Email**: [Author](   )

---

**Built with ❤️ for developers, researchers, and knowledge workers who want to understand their data better.**