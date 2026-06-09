### Example 1

Input:

## File Information

Path: `meetings/2024-03-15-sprint-retro.txt`

## Content to Analyze

```
Sprint 12 Retrospective — 2024-03-15
Attendees: Sarah Chen (EM), David Park (Backend), Aisha Osei (Frontend), Tom Rivera (QA)
Facilitator: Sarah Chen

WHAT WENT WELL
- CI pipeline improvements cut build time by 40%
- New feature flags system shipped on time

WHAT NEEDS IMPROVEMENT
- API contract changes broke the mobile app twice (no shared schema validation)
- QA was pulled in too late; several bugs caught post-deploy

DECISIONS
1. All API changes must include an OpenAPI diff reviewed by QA before merging.
2. QA joins sprint planning from Sprint 13 onward.

ACTION ITEMS
- David Park: Add openapi-diff step to GitHub Actions by 2024-03-22
- Aisha Osei: Integrate shared schema package into frontend build by 2024-03-29
- Sarah Chen: Update Definition of Done to include schema review gate
- Tom Rivera: Create QA onboarding template for sprint planning by 2024-03-20
```

Output:

```json
{
  "entities": [
    {
      "name": "Sprint 12 Retrospective",
      "entityType": "meeting",
      "observations": [
        "Held on 2024-03-15",
        "Facilitated by Sarah Chen",
        "Focus: process improvements after two API breakages"
      ]
    },
    {
      "name": "Sarah Chen",
      "entityType": "person",
      "observations": ["Engineering Manager", "Facilitator for the retro", "Owns Definition of Done update"]
    },
    {
      "name": "David Park",
      "entityType": "person",
      "observations": ["Backend engineer", "Responsible for OpenAPI diff CI step"]
    },
    {
      "name": "Aisha Osei",
      "entityType": "person",
      "observations": ["Frontend engineer", "Owns shared schema integration into frontend build"]
    },
    {
      "name": "Tom Rivera",
      "entityType": "person",
      "observations": ["QA engineer", "Tasked with creating QA sprint planning onboarding template"]
    },
    {
      "name": "Add openapi-diff to GitHub Actions",
      "entityType": "action_item",
      "observations": ["Due 2024-03-22", "Prevents unreviewed API contract changes from merging"]
    },
    {
      "name": "Integrate shared schema into frontend",
      "entityType": "action_item",
      "observations": ["Due 2024-03-29", "Assigned to Aisha Osei"]
    },
    {
      "name": "QA joins sprint planning",
      "entityType": "decision",
      "observations": ["Effective from Sprint 13", "Addresses late QA involvement causing post-deploy bugs"]
    }
  ],
  "relations": [
    { "from": "Sarah Chen",  "to": "Sprint 12 Retrospective",           "relationType": ["facilitates"] },
    { "from": "David Park",  "to": "Sprint 12 Retrospective",           "relationType": ["attends"] },
    { "from": "Aisha Osei",  "to": "Sprint 12 Retrospective",           "relationType": ["attends"] },
    { "from": "Tom Rivera",  "to": "Sprint 12 Retrospective",           "relationType": ["attends"] },
    { "from": "David Park",  "to": "Add openapi-diff to GitHub Actions","relationType": ["responsible_for"] },
    { "from": "Aisha Osei",  "to": "Integrate shared schema into frontend", "relationType": ["responsible_for"] },
    { "from": "Sprint 12 Retrospective", "to": "QA joins sprint planning", "relationType": ["decides"] }
  ]
}
```

---

### Example 2

Input:

## File Information

Path: `interviews/user-research-2024-04-02.txt`

## Content to Analyze

```
Customer Discovery Interview — 2024-04-02
Interviewer: Maya Patel (Product)
Interviewee: Jordan Lee, CTO at Stackwise (B2B SaaS, 80 employees)

MAYA: How does your team currently handle on-call escalation?

JORDAN: We use PagerDuty, but the runbooks live in Confluence. When an alert fires at 2 AM,
engineers have to context-switch between three tools to figure out what to do. It's painful.

MAYA: What would make that better?

JORDAN: Honestly, if the runbook context surfaced automatically inside the alert — even
just the last five incidents for that service — that would cut mean time to resolve by half.

MAYA: Have you tried any integrations?

JORDAN: We built a custom Slack bot that pulls Confluence pages, but it broke twice in
six months when Confluence changed their API. Maintenance is a nightmare.

PAIN POINTS SUMMARY
- Context fragmentation across PagerDuty, Confluence, Slack
- Runbook discoverability during incidents
- Brittle custom integrations

FEATURE REQUESTS
- Automatic runbook surfacing in alerts
- Recent incident history per service shown inline
- Stable API / webhook support to avoid custom bot maintenance
```

Output:

```json
{
  "entities": [
    {
      "name": "Jordan Lee",
      "entityType": "person",
      "observations": [
        "CTO at Stackwise",
        "Manages on-call engineering team",
        "Built a custom Slack bot for runbook retrieval"
      ]
    },
    {
      "name": "Maya Patel",
      "entityType": "person",
      "observations": ["Product manager", "Conducting customer discovery interview"]
    },
    {
      "name": "Stackwise",
      "entityType": "organization",
      "observations": ["B2B SaaS company", "~80 employees"]
    },
    {
      "name": "Context fragmentation across tools",
      "entityType": "pain_point",
      "observations": [
        "Engineers must switch between PagerDuty, Confluence, and Slack during incidents",
        "Particularly painful during 2 AM on-call alerts"
      ]
    },
    {
      "name": "Brittle custom Slack bot",
      "entityType": "pain_point",
      "observations": [
        "Breaks when Confluence changes their API",
        "Failed twice in six months",
        "High maintenance burden"
      ]
    },
    {
      "name": "Automatic runbook surfacing in alerts",
      "entityType": "feature_request",
      "observations": [
        "Show runbook content inline within alert notifications",
        "Expected to cut MTTR by ~50% per Jordan Lee"
      ]
    },
    {
      "name": "Recent incident history per service",
      "entityType": "feature_request",
      "observations": ["Last 5 incidents for the affected service shown inline in alert"]
    }
  ],
  "relations": [
    { "from": "Jordan Lee",  "to": "Stackwise",                              "relationType": ["works_at"] },
    { "from": "Maya Patel",  "to": "Jordan Lee",                             "relationType": ["interviews"] },
    { "from": "Jordan Lee",  "to": "Context fragmentation across tools",     "relationType": ["reports"] },
    { "from": "Jordan Lee",  "to": "Brittle custom Slack bot",               "relationType": ["reports"] },
    { "from": "Jordan Lee",  "to": "Automatic runbook surfacing in alerts",  "relationType": ["requests"] },
    { "from": "Jordan Lee",  "to": "Recent incident history per service",    "relationType": ["requests"] }
  ]
}
```
