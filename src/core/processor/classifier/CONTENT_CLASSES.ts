import { ContentClass, ContentClassConfig } from "../../../types";


export const CONTENT_CLASSES: Record<ContentClass, ContentClassConfig> = {
  code: {
    name: "code",
    filePatterns: [
      // Tier 1: Smoking Guns (15.0-10.0)
      { pattern: /\.(ts|js|jsx|tsx|mjs)$/i, weight: 15.0 },
      { pattern: /\.(py|rb|php|java|cpp|c|h|go|rs|scala|kt|swift)$/i, weight: 15.0 },
      { pattern: /\.(sql|sh|bat|ps1|dockerfile)$/i, weight: 12.0 },
      { pattern: /^.*\/(src|lib|app|components|utils|services|api|tests?)\//i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns (15.0-10.0) - Structural code patterns
      { pattern: /\b(function|fun|type|class|enum|interface|struct)\s+[\w\d_]+[\s\n\r]*\{/igm, weight: 12.0 },
      { pattern: /\b(async|await|def|let|var|const)\s+[\w\d_]+/igm, weight: 10.0 },
      { pattern: /\b[\w\d_]+\s+(implements|extends)\s+[\w\d_]+[\s\n\r]*\{/igm, weight: 12.0 },

      // Tier 2: Strong Contextual (7.0-4.0) - Code-specific constructs
      { pattern: /\b(?:try|catch|finally|throw)\s*[\(\{]/igm, weight: 5.0 },
      { pattern: /\bconsole\.(?:log|error|warn|info|debug|trace|write(?:line|ln)?)\s*\(/igm, weight: 5.0 },
      { pattern: /\b[\w\d_]{2,}(\.[\w\d_]{2,})*\s*\(/igm, weight: 5.0 },

      // Tier 3: Supporting Evidence (3.0-1.0) - Control flow and keywords
      { pattern: /\b(?:if|for|while|switch|else|elif)\s*\(/igm, weight: 2.0 },
      { pattern: /\b(?:return|break|continue|yield)\s+/igm, weight: 2.0 },
      { pattern: /\b(?:public|private|protected|static|final)\s+[\w\d_]+/igm, weight: 2.0 },

      // Tier 4: Noise (0.5-0.1) - Code punctuation
      { pattern: /[{}();]/g, weight: 0.1 },
    ],
  },

  financial: {
    name: "financial",
    filePatterns: [
      { pattern: /\b(?:financial|revenue|earnings|trading|investment|quarterly|annual).*\.(?:md|txt|pdf|xlsx?)$/i, weight: 10.0 },
      { pattern: /^.*\/(finance|accounting|trading|investment|revenue|earnings)\//i, weight: 8.0 },
      { pattern: /^(?:10-K|10-Q|8-K|annual|quarterly).*report/i, weight: 12.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Formatted financial data
      { pattern: /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:million|billion|trillion|[KMB]))?/g, weight: 10.0 },
      { pattern: /\b(?:NYSE|NASDAQ|S&P\s*500|Dow\s+Jones|ticker\s+symbol):\s*[A-Z]{2,5}/g, weight: 8.0 },

      // Tier 2: Strong Contextual - Financial metrics and reporting
      { pattern: /\b(?:revenue|profit|earnings|EBITDA|ROI|P\/E\s+ratio|market\s+cap)\s*[:=]\s*\$?\d/ig, weight: 6.0 },
      { pattern: /\b(?:Q[1-4]|quarterly|annual)\s+(?:revenue|earnings|report|results|guidance)\b/ig, weight: 5.0 },
      { pattern: /\b(?:beat|miss|exceed)(?:s|ed)?\s+(?:estimates?|expectations?|consensus)/ig, weight: 5.0 },

      // Tier 3: Supporting Evidence - Financial vocabulary
      { pattern: /\b(?:shares?|stock|equity|portfolio|investment|dividend|yield|valuation)\b/ig, weight: 2.0 },
      { pattern: /\b(?:SEC|filing|10-K|10-Q|8-K|proxy|statement)\b/ig, weight: 2.0 },
      { pattern: /\b(?:analyst|investor|shareholder|stakeholder)\b/ig, weight: 1.5 },

      // Tier 4: Noise - Percentage and numbers in financial context
      { pattern: /\d+(?:\.\d+)?%/g, weight: 0.2 },
    ],
  },

  medical: {
    name: "medical",
    filePatterns: [
      { pattern: /\b(?:medical|health|clinical|patient|drug|treatment|pharma).*\.(?:md|txt|pdf)$/i, weight: 10.0 },
      { pattern: /^.*\/(medical|health|clinical|patient|drug|treatment)\//i, weight: 8.0 },
      { pattern: /^(?:chart|record|protocol|trial|study).*\.(txt|md)$/i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Medical dosages and procedures
      { pattern: /\b\d+\s*(?:mg|ml|mcg|µg|IU|units?)\b/g, weight: 10.0 },
      { pattern: /\b(?:BID|TID|QID|PRN|PO|IV|IM|SC|QHS|AC|PC)\b/g, weight: 8.0 },

      // Tier 2: Strong Contextual - Clinical and regulatory
      { pattern: /\b(?:clinical\s+trial|randomized\s+controlled|double-blind|placebo-controlled|efficacy|adverse\s+(?:events?|effects?))\b/ig, weight: 6.0 },
      { pattern: /\b(?:FDA|EMA)\s+(?:approval|clearance|indication|contraindication|black\s+box\s+warning)/ig, weight: 6.0 },
      { pattern: /\b(?:phase\s+[I-IV]|IRB|informed\s+consent|protocol\s+amendment)\b/ig, weight: 5.0 },

      // Tier 3: Supporting Evidence - Medical terminology
      { pattern: /\b(?:patient|diagnosis|treatment|medication|dosage|prescription|therapeutic)\b/ig, weight: 2.5 },
      { pattern: /\b(?:symptoms?|condition|disease|disorder|syndrome|pathology)\b/ig, weight: 2.0 },
      { pattern: /\b(?:blood\s+pressure|heart\s+rate|temperature|vital\s+signs|laboratory\s+values)\b/ig, weight: 2.0 },

      // Tier 4: Noise - Medical abbreviations
      { pattern: /\b[A-Z]{2,5}\b/g, weight: 0.1 },
    ],
  },

  legal: {
    name: "legal",
    filePatterns: [
      { pattern: /^.*\/(legal|contracts|compliance|regulatory|terms)\//i, weight: 8.0 },
      { pattern: /\b(?:contract|agreement|terms|legal|conditions|compliance)/i, weight: 8.0 },
      { pattern: /^(?:NDA|MSA|SLA|ToS|privacy.?policy)/i, weight: 12.0 },
      { pattern: /\bLICENSE\.(txt|md|pdf)?$/i, weight: 10.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Legal document structure
      { pattern: /\b(?:whereas|hereby|party|parties)\s+(?:\w+\s+){0,3}(?:agree|shall|will)\b/ig, weight: 12.0 },
      { pattern: /\b(?:effective\s+date|term|termination|renewal)\s*[:=]/ig, weight: 10.0 },

      // Tier 2: Strong Contextual - Legal language and procedures
      { pattern: /\b(?:jurisdiction|court|statute|regulation|compliance|precedent)\b/ig, weight: 6.0 },
      { pattern: /\b(?:liable|liability|damages|indemnify|breach)\s+(?:of|for|to)\b/ig, weight: 8.0 },
      { pattern: /\b(?:attorney|counsel|legal)\s+(?:\w+\s+){0,2}(?:opinion|ruling|advice)\b/ig, weight: 6.0 },

      // Tier 3: Supporting Evidence - Legal vocabulary
      { pattern: /\b(?:contract|agreement|clause|provision|section|subsection)\b/ig, weight: 2.0 },
      { pattern: /\b(?:plaintiff|defendant|appellant|respondent)\b/ig, weight: 2.0 },
      { pattern: /\b(?:constitute|deem|execute|enforce|waive)\b/ig, weight: 1.5 },

      // Tier 4: Noise - Legal formatting
      { pattern: /\b(?:section|sec\.?)\s+\d+(?:\.\d+)*/ig, weight: 0.2 },
    ],
  },

  research: {
    name: "research",
    filePatterns: [
      // Tier 1: Smoking Guns - Academic paper patterns
      { pattern: /\d{4}\.\d{4,5}(?:v\d)?\.(md|txt|pdf)$/i, weight: 15.0 },
      { pattern: /(findings|research|experiments|studies|analysis|thesis)(.*?)\.(md|doc|docx|rtf|txt|pdf)$/i, weight: 12.0 },
      { pattern: /^.*\/(papers?|research|experiments|studies|analysis|thesis)\//i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Academic structure and citations
      { pattern: /\b(?:doi|arxiv|pubmed|citation)[:\/]\s*\S+/ig, weight: 15.0 },
      { pattern: /^#{1,6}\s*(?:\S+\s+)?(?:abstract|related\s+work|literature\s+review|background|methodology|evaluation|experiments?|results?|discussion|conclusion|future\s+work|acknowledgements?|references?|ethical\s+considerations)\s*$/gim, weight: 13.0 },
      { pattern: /\b\w+\s+et\s+al\.?\s+\((?:19|20)\d{2}\)/ig, weight: 12.0 },
      { pattern: /\[[^\]]*(?:19|20)\d{2}[^\]]*\](?!\()/ig, weight: 12.0 },

      // Tier 2: Strong Contextual - Academic language
      { pattern: /\b(?:we\s+(?:adopt|proposed?|present(ed)?|introduced?|demonstrated?|evaluated?|investigated?|compare|found|explore|observe))\b/ig, weight: 10.0 },
      { pattern: /\b(?:our\s+(?:analysis|hypothesis|method|approach|model|algorithm|framework|contributions?|findings?|results?|corpus))\b/ig, weight: 9.0 },
      { pattern: /\b(?:experimental\s+(?:results|evaluation|setup|design|validation))\b/ig, weight: 9.0 },
      { pattern: /\b(?:state-of-the-art|sota|baseline\s+(?:comparison|method|model))\b/ig, weight: 6.0 },

      // Tier 3: Supporting Evidence - Research methodology
      { pattern: /\b(?:accuracy|precision|recall|f1[-\s]?score|bleu|rouge|meteor)\s*[:=]\s*(?:0?\.\d+|\d+\.?\d*%)/ig, weight: 3.0 },
      { pattern: /\b(?:p-value|p)\s*[<>=]\s*0\.\d+/ig, weight: 3.0 },
      { pattern: /\b(?:significance|confidence\s+interval|standard\s+deviation)\b/ig, weight: 2.0 },
      { pattern: /\b(?:dataset|corpus|benchmark|ground\s+truth)\b/ig, weight: 2.0 },

      // Tier 4: Noise - Academic formatting
      { pattern: /\$[^$\n]{3,}\$/g, weight: 0.5 },
    ],
  },

  transcript: {
    name: "transcript",
    filePatterns: [
      { pattern: /^.*\/(meetings|transcripts|minutes|calls|interviews)\//i, weight: 10.0 },
      { pattern: /\b(?:meeting|transcript|minutes|call|interview).*\.(txt|md)$/i, weight: 10.0 },
      { pattern: /^(?:standup|sync|planning|review).*\.(txt|md)$/i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Transcript structure
      { pattern: /^\[\d\d:\d\d:\d\d\.\d\d\d\s-->\s\d\d:\d\d:\d\d\.\d\d\d\]\s+/ig, weight: 15.0 },
      { pattern: /^\w+\s*:\s*(?![A-Z]{2,})/gm, weight: 8.0 },
      { pattern: /\b(?:attendees?|participants?):\s*\w/ig, weight: 8.0 },
      { pattern: /\b(?:action\s+items?|next\s+steps?|follow.?up)\s*:?\s*\w/ig, weight: 8.0 },

      // Tier 2: Strong Contextual - Meeting language
      { pattern: /\b(?:meeting|transcript|minutes)\s+(?:for|of|-)?\s*\w/ig, weight: 6.0 },
      { pattern: /\b(?:decision|agreed|resolved|discussed)\s+(?:to|on|that)\b/ig, weight: 5.0 },
      { pattern: /\b(?:speaker|moderator|presenter)\s*\d*:\s*/ig, weight: 5.0 },

      // Tier 3: Supporting Evidence - Temporal and organizational
      { pattern: /\b(?:today|yesterday|tomorrow|this\s+week|next\s+week|by\s+(?:friday|monday))\b/ig, weight: 2.0 },
      { pattern: /\b(?:agenda|schedule|timeline|deadline)\b/ig, weight: 2.0 },
      { pattern: /\b(?:team|group|department|stakeholder)\b/ig, weight: 1.5 },

      // Tier 4: Noise - Time stamps
      { pattern: /\d{1,2}:\d{2}(?:\s*[AP]M)?/g, weight: 0.2 },
    ],
  },

  tabular: {
    name: "tabular",
    filePatterns: [
      // Tier 1: Smoking Guns - Data file extensions
      { pattern: /\.(csv|tsv|xlsx?|xls)$/i, weight: 20.0 },
      { pattern: /^.*\/(data|datasets?|exports?|reports?|metrics|table)\//i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Structured tabular data (4+ columns)
      { pattern: /^([^,\n]*,){3,}[^,\n]*$/gm, weight: 2.75 },
      { pattern: /^([^|\n]*\|){3,}[^|\n]*$/gm, weight: 2.75 },
      { pattern: /^([^;\n]*\;){3,}[^;\n]*$/gm, weight: 2.75 },
      { pattern: /^([^:\n]*\:){3,}[^:\n]*$/gm, weight: 2.75 },
      { pattern: /^([^\t\n]*\t){3,}[^\t\n]*$/gm, weight: 2.75 },

      // Tier 2: Strong Contextual - Table headers and structure
      { pattern: /^(?:\w+[,|\t]){3,}\w+$/gm, weight: 2.5 },
      { pattern: /^[^,\n]*,\s*\d+(?:\.\d+)?\s*,/gm, weight: 2.5 },

      // Tier 3: Supporting Evidence - Data patterns
      { pattern: /\b(?:column|row|field|record|entry)\b/ig, weight: 2.0 },
      { pattern: /\b(?:total|sum|average|count|min|max)\b/ig, weight: 1.0 },

      // Tier 4: Noise - Basic separators (2-3 columns only)
      { pattern: /^[^,\n]*,[^,\n]*$/gm, weight: 0.1 },
    ],
  },

  communication: {
    name: "communication",
    filePatterns: [
      { pattern: /^.*\/(email|messages?|chat|correspondence|communications?)\//i, weight: 10.0 },
      { pattern: /\b(?:email|message|chat|correspondence).*\.(txt|md|eml)$/i, weight: 10.0 },
      { pattern: /^(?:inbox|sent|draft).*\.(txt|md)$/i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Email structure
      { pattern: /^(?:From|To|Subject|Cc|Bcc|Date|Reply-To):\s*\S/gim, weight: 12.0 },
      { pattern: /^On\s+.+\s+wrote:\s*$/gim, weight: 10.0 },
      { pattern: /@[\w.-]+\.\w+/g, weight: 8.0 },

      // Tier 2: Strong Contextual - Communication patterns
      { pattern: /\b(?:dear|hi|hello|sincerely|regards|best)\s+\w/ig, weight: 6.0 },
      { pattern: /^>\s+/gm, weight: 5.0 },
      { pattern: /\b(?:email|message|correspondence|communication)\b/ig, weight: 4.0 },

      // Tier 3: Supporting Evidence - Communication vocabulary
      { pattern: /\b(?:sent|received|replied|forwarded|attached)\b/ig, weight: 2.0 },
      { pattern: /\b(?:thread|conversation|discussion|reply)\b/ig, weight: 2.0 },
      { pattern: /\b(?:cc|bcc|fwd|re):/ig, weight: 1.5 },

      // Tier 4: Noise - Common greetings
      { pattern: /\b(?:thanks?|please|regards)\b/ig, weight: 0.1 },
    ],
  },

  documentation: {
    name: "documentation",
    filePatterns: [
      // Tier 1: Smoking Guns - Standard documentation files
      { pattern: /^(?:README|CODE_OF_CONDUCT|CONTRIBUTING|SECURITY|ROADMAP|LICENSE|CHANGELOG|TODO|INSTALL)(?:\.(md|txt|rst))?$/i, weight: 20.0 },
      { pattern: /^.*\/(?:docs?|documentation|guides?|tutorials?|help|wiki)\//i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Installation and setup
      { pattern: /\b(?:npm\s+install|pip\s+install|yarn\s+add|git\s+clone|composer\s+install|brew\s+install)\b/ig, weight: 12.0 },
      { pattern: /\b(?:installation|getting\s+started|quick\s+start|setup\s+guide|development\s+setup)\b/ig, weight: 10.0 },
      { pattern: /\b(?:gpl-[\w\d.]+|mit)\s+license/ig, weight: 10.0 },

      { pattern: /^```(?:json|java|\w+script|cpp|bash|shell)\n[\s\S]+```/g, weight: 10.0 },

      // Tier 2: Strong Contextual - User guidance and API docs
      { pattern: /\b(?:you\s+(?:can|should|need\s+to|must)|to\s+(?:do\s+this|get\s+started)|follow\s+these\s+steps|here's\s+how)\b/ig, weight: 6.0 },
      { pattern: /^#{1,6}\s*(?:installation|usage|api\s+reference|getting\s+started|tutorial|examples?|configuration)\s*$/gim, weight: 6.0 },
      { pattern: /\b(?:GET|POST|PUT|DELETE|PATCH)\s+\/\w+/g, weight: 5.0 },

      // Tier 3: Supporting Evidence - Documentation vocabulary
      { pattern: /\b(?:tutorial|guide|walkthrough|step-by-step|how-to|quick\s+reference)\b/ig, weight: 2.5 },
      { pattern: /\b(?:endpoint|route|parameter|response|request|authentication)\b/ig, weight: 2.0 },
      { pattern: /\b(?:note|warning|tip|important|caution):\s*\w/ig, weight: 2.0 },

      // Tier 4: Noise - Code examples in docs
      { pattern: /```[\s\S]*?```/g, weight: 0.1 },
    ],
  },

  technical: {
    name: "technical",
    filePatterns: [
      { pattern: /\.(log|conf|cfg|config|ini|toml|yaml|yml|xml)$/i, weight: 12.0 },
      { pattern: /^.*\/(logs?|config|infrastructure|system|server)\//i, weight: 8.0 },
      { pattern: /^(?:docker|k8s|terraform|ansible).*\.(yml|yaml|json)$/i, weight: 10.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Log patterns and timestamps
      { pattern: /^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/gm, weight: 10.0 },
      { pattern: /\b(?:ERROR|WARN|INFO|DEBUG|FATAL|TRACE)\s*[:|\[]/ig, weight: 8.0 },

      // Tier 2: Strong Contextual - System and infrastructure
      { pattern: /\b(?:server|service|daemon|process|thread)\b/ig, weight: 5.0 },
      { pattern: /\b(?:configuration|config|setting|parameter)\b/ig, weight: 4.0 },
      { pattern: /^\s*(?:host|port|url|path|timeout)[:=]/gim, weight: 4.0 },

      // Tier 3: Supporting Evidence - Technical vocabulary
      { pattern: /\b(?:timeout|connection|network|database|cache)\b/ig, weight: 2.0 },
      { pattern: /\b(?:deploy|deployment|build|release|version)\b/ig, weight: 2.0 },
      { pattern: /\b(?:cpu|memory|disk|load|performance)\b/ig, weight: 1.5 },

      // Tier 4: Noise - Generic tech terms
      { pattern: /\b(?:system|data|user|file)\b/ig, weight: 0.1 },
    ],
  },

  narrative: {
    name: "narrative",
    filePatterns: [
      { pattern: /\b(?:article|story|blog|news|opinion|essay|editorial).*\.(?:md|txt)$/i, weight: 8.0 },
      { pattern: /^.*\/(articles?|posts?|stories?|content|editorial)\//i, weight: 6.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Narrative structure
      { pattern: /^The\s+\w+\s+of\s+/gim, weight: 8.0 },

      // Tier 2: Strong Contextual - Narrative discourse
      { pattern: /\b(?:furthermore|however|therefore|moreover|nevertheless|meanwhile|subsequently|consequently)\b/ig, weight: 5.0 },
      { pattern: /\b(?:discusses|explores|examines|investigates|analyzes|argues|contends|suggests)\b/ig, weight: 4.0 },
      { pattern: /\b(?:according\s+to|research\s+shows|studies\s+indicate|experts\s+believe)\b/ig, weight: 4.0 },

      // Tier 3: Supporting Evidence - Narrative vocabulary
      { pattern: /\b(?:article|story|report|analysis|opinion|essay)\b/ig, weight: 2.0 },
      { pattern: /\b(?:conclusion|summary|findings|impact)\b/ig, weight: 2.0 },
      { pattern: /\b(?:industry|society|community|population|public)\b/ig, weight: 1.5 },

      // Tier 4: Noise - Common connectors
      { pattern: /\b(?:and|but|or|so|then|also)\b/ig, weight: 0.05 },
    ],
  },

  reference: {
    name: "reference",
    filePatterns: [
      { pattern: /^.*\/(reference|glossary|catalog|index|specs?|standards?)\//i, weight: 10.0 },
      { pattern: /\b(?:glossary|dictionary|catalog|index|reference).*\.(md|txt)$/i, weight: 10.0 },
      { pattern: /^(?:spec|standard|rfc|definition).*\.(md|txt)$/i, weight: 8.0 },
    ],
    contentPatterns: [
      // Tier 1: Smoking Guns - Reference structure
      { pattern: /^[A-Z]{2,}:\s+/gm, weight: 9.0 },
      { pattern: /^[\w\s]+:\s+[\w\s]/gm, weight: 7.0 },

      // Tier 2: Strong Contextual - Reference language
      { pattern: /\b(?:glossary|dictionary|catalog|index|reference)\b/ig, weight: 5.0 },
      { pattern: /\b(?:definition|term|entry|specification|standard)\b/ig, weight: 4.0 },
      { pattern: /\b(?:see\s+also|cross.?reference|related|synonym)\b/ig, weight: 4.0 },

      // Tier 3: Supporting Evidence - Reference vocabulary
      { pattern: /\b(?:alphabetically|categorized|indexed|listed)\b/ig, weight: 2.0 },
      { pattern: /\b(?:abbreviation|acronym|symbol|notation)\b/ig, weight: 2.0 },

      // Tier 4: Noise - List markers
      { pattern: /^\*\s+\w+/gm, weight: 0.2 },
    ],
  },
};
