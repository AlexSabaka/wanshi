import { ContentClass, ContentClassNERExample } from "../../../types";

export const NER_DOMAIN_EXAMPLES: Record<ContentClass, ContentClassNERExample> = {
  code: {
    name: "code",
    description: "Source code, scripts, and technical implementations",
    primaryEntityTypes: [
      "function", "class", "module", "api_endpoint", "database_table",
      "configuration", "dependency", "algorithm", "data_structure",
    ],
    primaryRelationTypes: [
      "calls", "imports", "extends", "implements", "configures",
      "depends_on", "exposes", "consumes",
    ],
    examples: [
      {
        filePath: "src/index.ts",
        fileContent: `import { Command } from "commander";\nconst program = new Command();\nprogram.parse();`,
        output: {
          entities: [
            {
              name: "file-converter",
              files: ["src/index.ts"],
              entityType: "cli_application",
              observations: ["Converts files between different formats", "Version 1.0.0", "NodeJS CLI utility"]
            },
            {
              name: "processFiles",
              files: ["src/index.ts"],
              entityType: "function",
              observations: ["Handles file conversion logic", "Accepts input path, output path, and format parameters"]
            }
          ],
          relations: [
            {
              from: "file-converter",
              to: "processFiles",
              relationType: ["calls", "delegates_to"]
            }
          ]
        }
      }
    ],
  },

  financial: {
    name: 'financial',
    description: 'Financial reports, market analysis, and economic data',
    primaryEntityTypes: [
      'company', 'stock_symbol', 'financial_metric', 'transaction',
      'regulation', 'market', 'investment', 'currency', 'portfolio'
    ],
    primaryRelationTypes: [
      'owns', 'trades', 'reports', 'regulates', 'correlates_with',
      'outperforms', 'invests_in', 'complies_with'
    ],
    examples: [
      {
        filePath: "reports/q3-earnings.txt",
        fileContent: "Q3 2024 Revenue: $2.1B (+15% YoY)\nNet Income: $450M\nEarnings per share: $3.21",
        output: {
          entities: [
            {
              name: "q3_2024_earnings",
              files: ["reports/q3-earnings.txt"],
              entityType: "financial_report",
              observations: ["Revenue: $2.1B", "15% YoY growth", "Net Income: $450M", "EPS: $3.21"]
            }
          ],
          relations: []
        }
      }
    ],
  },

  medical: {
    name: 'medical',
    description: 'Medical records, research papers, and healthcare documentation',
    primaryEntityTypes: [
      'condition', 'treatment', 'medication', 'anatomy', 'procedure',
      'symptom', 'diagnosis', 'patient', 'healthcare_provider', 'clinical_trial'
    ],
    primaryRelationTypes: [
      'treats', 'causes', 'indicates', 'prevents', 'interacts_with',
      'diagnoses', 'prescribes', 'contraindicates'
    ],
    examples: [
      {
        filePath: "medical/patient-chart.txt",
        fileContent: "Patient presents with acute chest pain. Diagnosis: Myocardial infarction.\nTreatment: Aspirin 325mg, Metoprolol 50mg BID",
        output: {
          entities: [
            {
              name: "myocardial_infarction",
              files: ["medical/patient-chart.txt"],
              entityType: "condition",
              observations: ["Primary diagnosis", "Presents as acute chest pain"]
            },
            {
              name: "aspirin_325mg",
              files: ["medical/patient-chart.txt"],
              entityType: "medication",
              observations: ["Treatment for myocardial infarction", "325mg dosage"]
            }
          ],
          relations: [
            {
              from: "aspirin_325mg",
              to: "myocardial_infarction",
              relationType: ["treats"]
            }
          ]
        }
      }
    ],
  },

  legal: {
    name: 'legal',
    description: 'Legal documents, contracts, and regulatory content',
    primaryEntityTypes: [
      'party', 'contract', 'statute', 'jurisdiction', 'obligation',
      'right', 'precedent', 'court', 'lawyer', 'legal_entity'
    ],
    primaryRelationTypes: [
      'contracts_with', 'obligates', 'grants_right_to', 'governs',
      'precedent_for', 'jurisdiction_over', 'represents'
    ],
    examples: [
      {
        filePath: "legal/service-agreement.txt",
        fileContent: "WHEREAS the parties wish to enter into agreement\nParty A hereby agrees to provide services\nJurisdiction: State of California",
        output: {
          entities: [
            {
              name: "service_agreement",
              files: ["legal/service-agreement.txt"],
              entityType: "contract",
              observations: ["Service provision contract", "California jurisdiction"]
            },
            {
              name: "party_a",
              files: ["legal/service-agreement.txt"],
              entityType: "party",
              observations: ["Service provider", "Contractual party"]
            }
          ],
          relations: [
            {
              from: "party_a",
              to: "service_agreement",
              relationType: ["party_to"]
            }
          ]
        }
      }
    ],
  },

  research: {
    name: 'research',
    description: 'Academic papers, scientific studies, and experimental data',
    primaryEntityTypes: [
      'hypothesis', 'experiment', 'methodology', 'result', 'dataset',
      'researcher', 'institution', 'publication', 'statistical_test', 'variable'
    ],
    primaryRelationTypes: [
      'tests', 'validates', 'measures', 'correlates_with', 'cites',
      'replicates', 'contradicts', 'builds_upon'
    ],
    examples: [
      {
        filePath: "experiments/crispr-protocol.txt",
        fileContent: "CRISPR-Cas9 gene editing protocol\nTarget: BRCA1 gene\nGuide RNA: 5'-GGCTATCCTCTCAGAGTGAC-3'\nEfficiency: 78% editing",
        output: {
          entities: [
            {
              name: "BRCA1_gene",
              files: ["experiments/crispr-protocol.txt"],
              entityType: "gene",
              observations: ["Target gene for CRISPR editing", "Associated with breast cancer susceptibility"]
            },
            {
              name: "guide_RNA_BRCA1",
              files: ["experiments/crispr-protocol.txt"],
              entityType: "rna_sequence",
              observations: ["Sequence: 5'-GGCTATCCTCTCAGAGTGAC-3'", "Targets BRCA1 gene"]
            }
          ],
          relations: [
            {
              from: "guide_RNA_BRCA1",
              to: "BRCA1_gene",
              relationType: ["targets", "binds_to"]
            }
          ]
        }
      }
    ],
  },

  transcript: {
    name: 'transcript',
    description: 'Meeting minutes, interviews, and recorded conversations',
    primaryEntityTypes: [
      'speaker', 'topic', 'decision', 'action_item', 'timeline',
      'participant', 'agenda_item', 'meeting', 'deadline', 'responsibility'
    ],
    primaryRelationTypes: [
      'discusses', 'decides', 'assigns', 'schedules', 'follows_up',
      'reports_to', 'responsible_for', 'attends'
    ],
    examples: [
      {
        filePath: "meetings/q4-planning.txt",
        fileContent: "Meeting Minutes - Q4 Planning\nAttendees: John, Sarah, Mike\nAction Items:\n- John: Finalize budget by Friday",
        output: {
          entities: [
            {
              name: "q4_planning_meeting",
              files: ["meetings/q4-planning.txt"],
              entityType: "meeting",
              observations: ["Q4 planning session", "3 attendees"]
            },
            {
              name: "john",
              files: ["meetings/q4-planning.txt"],
              entityType: "participant",
              observations: ["Meeting attendee", "Responsible for budget finalization"]
            }
          ],
          relations: [
            {
              from: "john",
              to: "q4_planning_meeting",
              relationType: ["attends"]
            }
          ]
        }
      }
    ],
  },

  tabular: {
    name: 'tabular',
    description: 'Structured data, spreadsheets, and database exports',
    primaryEntityTypes: [
      'column', 'row', 'metric', 'data_relationship', 'schema',
      'table', 'field', 'record', 'aggregate', 'dimension'
    ],
    primaryRelationTypes: [
      'contains', 'aggregates', 'relates_to', 'foreign_key_to',
      'groups_by', 'sums_to', 'measures'
    ],
    examples: [
      {
        filePath: "data/sales-report.csv",
        fileContent: "Product,Revenue,Units Sold\nWidget A,$15000,150\nWidget B,$25000,200",
        output: {
          entities: [
            {
              name: "sales_data",
              files: ["data/sales-report.csv"],
              entityType: "table",
              observations: ["Contains product sales information", "3 columns: Product, Revenue, Units Sold"]
            },
            {
              name: "revenue_column",
              files: ["data/sales-report.csv"],
              entityType: "column",
              observations: ["Financial metric", "Dollar amounts"]
            }
          ],
          relations: [
            {
              from: "sales_data",
              to: "revenue_column",
              relationType: ["contains"]
            }
          ]
        }
      }
    ],
  },

  communication: {
    name: 'communication',
    description: 'Emails, chat logs, and interpersonal communications',
    primaryEntityTypes: [
      'person', 'organization', 'project', 'commitment', 'thread',
      'sender', 'recipient', 'subject', 'attachment', 'follow_up'
    ],
    primaryRelationTypes: [
      'sends_to', 'cc', 'bcc', 'replies_to', 'forwards_to',
      'collaborates_with', 'reports_to', 'schedules_with'
    ],
    examples: [
      {
        filePath: "emails/project-update.txt",
        fileContent: "From: john@company.com\nTo: team@company.com\nSubject: Project Update\n\nDear team,\nThe project is on track.",
        output: {
          entities: [
            {
              name: "john",
              files: ["emails/project-update.txt"],
              entityType: "person",
              observations: ["Email sender", "Works at company.com"]
            },
            {
              name: "project_update_email",
              files: ["emails/project-update.txt"],
              entityType: "thread",
              observations: ["Project status communication", "Sent to team"]
            }
          ],
          relations: [
            {
              from: "john",
              to: "project_update_email",
              relationType: ["sends"]
            }
          ]
        }
      }
    ],
  },

  documentation: {
    name: 'documentation',
    description: 'User guides, API docs, and instructional content',
    primaryEntityTypes: [
      'feature', 'procedure', 'example', 'requirement', 'guide',
      'api_method', 'parameter', 'tutorial_step', 'configuration_option'
    ],
    primaryRelationTypes: [
      'documents', 'explains', 'demonstrates', 'requires',
      'configures', 'guides_through', 'references'
    ],
    examples: [
      {
        filePath: "docs/README.md",
        fileContent: "# Installation Guide\n\n## Getting Started\n\nRun npm install to begin\n\n## Usage\n\nExample:\n```\nnpm start\n```",
        output: {
          entities: [
            {
              name: "installation_guide",
              files: ["docs/README.md"],
              entityType: "guide",
              observations: ["Explains installation process", "Includes npm commands"]
            },
            {
              name: "npm_install",
              files: ["docs/README.md"],
              entityType: "procedure",
              observations: ["Installation command", "First step in setup"]
            }
          ],
          relations: [
            {
              from: "installation_guide",
              to: "npm_install",
              relationType: ["documents", "explains"]
            }
          ]
        }
      }
    ],
  },

  technical: {
    name: 'technical',
    description: 'System logs, configurations, and infrastructure content',
    primaryEntityTypes: [
      'service', 'error', 'configuration', 'system_event', 'server',
      'log_entry', 'performance_metric', 'alert', 'deployment'
    ],
    primaryRelationTypes: [
      'logs_to', 'configures', 'monitors', 'alerts_on',
      'depends_on', 'triggers', 'connects_to'
    ],
    examples: [
      {
        filePath: "logs/server.log",
        fileContent: "2024-01-15 10:30:15 ERROR [server] Connection failed: timeout\n2024-01-15 10:30:16 WARN [auth] Invalid credentials",
        output: {
          entities: [
            {
              name: "connection_timeout_error",
              files: ["logs/server.log"],
              entityType: "error",
              observations: ["Server connection failure", "Timeout-related issue", "Occurred at 10:30:15"]
            },
            {
              name: "server_service",
              files: ["logs/server.log"],
              entityType: "service",
              observations: ["Logging connection errors", "Part of system infrastructure"]
            }
          ],
          relations: [
            {
              from: "server_service",
              to: "connection_timeout_error",
              relationType: ["logs", "reports"]
            }
          ]
        }
      }
    ],
  },

  narrative: {
    name: 'narrative',
    description: 'Articles, reports, and general prose content',
    primaryEntityTypes: [
      'topic', 'concept', 'person', 'event', 'location',
      'organization', 'idea', 'theme', 'argument', 'conclusion'
    ],
    primaryRelationTypes: [
      'discusses', 'mentions', 'relates_to', 'describes',
      'analyzes', 'compares', 'concludes', 'argues'
    ],
    examples: [
      {
        filePath: "articles/ai-impact.md",
        fileContent: "The Rise of Artificial Intelligence\n\nArtificial intelligence has transformed numerous industries. This article explores the impact of AI on society.",
        output: {
          entities: [
            {
              name: "artificial_intelligence",
              files: ["articles/ai-impact.md"],
              entityType: "concept",
              observations: ["Transforming industries", "Has societal impact", "Rising technology"]
            },
            {
              name: "ai_industry_transformation",
              files: ["articles/ai-impact.md"],
              entityType: "topic",
              observations: ["Main article theme", "Discusses AI's industrial impact"]
            }
          ],
          relations: [
            {
              from: "ai_industry_transformation",
              to: "artificial_intelligence",
              relationType: ["discusses", "analyzes"]
            }
          ]
        }
      }
    ],
  },

  reference: {
    name: 'reference',
    description: 'Glossaries, catalogs, and structured reference material',
    primaryEntityTypes: [
      'definition', 'term', 'entry', 'category', 'reference',
      'glossary_item', 'catalog_entry', 'specification', 'standard'
    ],
    primaryRelationTypes: [
      'defines', 'categorizes', 'references', 'specifies',
      'lists', 'indexes', 'cross_references'
    ],
    examples: [
      {
        filePath: "reference/tech-glossary.txt",
        fileContent: "Glossary of Terms\n\nAPI: Application Programming Interface\nSaaS: Software as a Service\nCloud: Remote computing infrastructure",
        output: {
          entities: [
            {
              name: "API",
              files: ["reference/tech-glossary.txt"],
              entityType: "term",
              observations: ["Abbreviation for Application Programming Interface", "Technical terminology"]
            },
            {
              name: "tech_glossary",
              files: ["reference/tech-glossary.txt"],
              entityType: "glossary",
              observations: ["Technical terms reference", "Contains API, SaaS, Cloud definitions"]
            }
          ],
          relations: [
            {
              from: "tech_glossary",
              to: "API",
              relationType: ["defines", "contains"]
            }
          ]
        }
      }
    ],
  }
};
