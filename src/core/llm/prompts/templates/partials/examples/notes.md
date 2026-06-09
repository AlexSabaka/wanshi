### Example 1

Input:

## File Information

Path: `docs/api-glossary.md`

## Content to Analyze

```
# REST API Glossary

## Idempotency
An operation is **idempotent** if performing it multiple times produces the same result as
performing it once. In REST, PUT and DELETE are required to be idempotent by the HTTP spec;
POST is not. Clients should retry idempotent requests on network failure.
Related: safe method, retry semantics, PUT vs PATCH.

## Rate Limiting
The server enforces a maximum number of requests per time window per API key. Exceeded
limits return HTTP 429 Too Many Requests with a `Retry-After` header.
Standards: IETF RFC 6585 (additional HTTP status codes).
Related: quota, throttling, backoff strategy.

## Pagination (Cursor-based)
Results are returned in pages using an opaque cursor token rather than page numbers.
The response includes a `next_cursor` field; pass it as `?cursor=<value>` in the next
request. Cursors are stable against concurrent inserts.
Related: offset pagination, keyset pagination, infinite scroll.

## Webhook
An HTTP callback registered by the client to receive event notifications from the server.
The server POSTs a signed JSON payload to the client's endpoint when the event fires.
Clients should verify the `X-Signature-256` header to authenticate payloads.
Related: polling, event streaming, idempotency key.
```

Output:

```json
{
  "entities": [
    {
      "name": "Idempotency",
      "entityType": "concept",
      "observations": [
        "Property where repeated operations produce the same result as one execution",
        "Required by HTTP spec for PUT and DELETE methods",
        "Enables safe client retries on network failures"
      ]
    },
    {
      "name": "Rate Limiting",
      "entityType": "concept",
      "observations": [
        "Server-enforced cap on requests per time window per API key",
        "Returns HTTP 429 with Retry-After header when exceeded",
        "Governed by IETF RFC 6585"
      ]
    },
    {
      "name": "Cursor-based Pagination",
      "entityType": "concept",
      "observations": [
        "Uses opaque cursor token instead of page numbers",
        "Cursor passed via ?cursor= query parameter",
        "Stable against concurrent inserts unlike offset pagination"
      ]
    },
    {
      "name": "Webhook",
      "entityType": "concept",
      "observations": [
        "HTTP callback for server-to-client event notifications",
        "Server POSTs signed JSON payload to registered client endpoint",
        "Signature verified via X-Signature-256 header"
      ]
    },
    {
      "name": "IETF RFC 6585",
      "entityType": "standard",
      "observations": ["Defines additional HTTP status codes including 429 Too Many Requests"]
    }
  ],
  "relations": [
    { "from": "Rate Limiting",          "to": "IETF RFC 6585",          "relationType": ["governed_by"] },
    { "from": "Idempotency",            "to": "Webhook",                 "relationType": ["related_to"] }
  ]
}
```

---

### Example 2

Input:

## File Information

Path: `docs/feature-catalog.md`

## Content to Analyze

```
# Product Feature Catalog — Nexus Platform

## Real-time Collaboration
Simultaneous editing with conflict-free replicated data types (CRDTs).
Tiers: Pro, Enterprise.
Requires: WebSocket support in client environment.
Compatible with: Document Editor, Whiteboard, Code Review modules.

## SSO / SAML 2.0
Single sign-on via SAML 2.0 identity providers (Okta, Azure AD, Google Workspace).
Tiers: Enterprise only.
Requires: Admin configuration of IdP metadata URL and certificate.
Compatible with: All modules. Incompatible with: Legacy API key auth (cannot be used simultaneously).

## Audit Log
Immutable, tamper-evident log of all user actions and configuration changes.
Exported as JSON or CSV. Retention: 90 days (Pro), 2 years (Enterprise).
Tiers: Pro, Enterprise.
Compatible with: SIEM integrations (Splunk, Datadog).

## AI Summarization
One-click summary of documents, threads, and activity feeds using LLM backend.
Tiers: Pro (10 summaries/day), Enterprise (unlimited).
Requires: Nexus AI add-on license.
Compatible with: Document Editor, Inbox modules.
```

Output:

```json
{
  "entities": [
    {
      "name": "Real-time Collaboration",
      "entityType": "feature",
      "observations": [
        "Uses CRDTs for conflict-free simultaneous editing",
        "Available on Pro and Enterprise tiers",
        "Requires WebSocket support in client environment"
      ]
    },
    {
      "name": "SSO / SAML 2.0",
      "entityType": "feature",
      "observations": [
        "Enterprise-only feature",
        "Supports Okta, Azure AD, Google Workspace as identity providers",
        "Incompatible with legacy API key authentication when enabled"
      ]
    },
    {
      "name": "Audit Log",
      "entityType": "feature",
      "observations": [
        "Immutable, tamper-evident action log",
        "Retention: 90 days (Pro), 2 years (Enterprise)",
        "Exportable as JSON or CSV; compatible with SIEM tools"
      ]
    },
    {
      "name": "AI Summarization",
      "entityType": "feature",
      "observations": [
        "LLM-backed document and thread summarization",
        "Pro tier: 10 summaries/day; Enterprise: unlimited",
        "Requires Nexus AI add-on license"
      ]
    },
    {
      "name": "Pro",
      "entityType": "tier",
      "observations": ["Mid-tier plan; includes Real-time Collaboration, Audit Log, AI Summarization (limited)"]
    },
    {
      "name": "Enterprise",
      "entityType": "tier",
      "observations": ["Top-tier plan; includes all features with extended limits"]
    },
    {
      "name": "Nexus AI add-on",
      "entityType": "dependency",
      "observations": ["Required license for AI Summarization feature"]
    }
  ],
  "relations": [
    { "from": "Real-time Collaboration", "to": "Pro",              "relationType": ["included_in"] },
    { "from": "Real-time Collaboration", "to": "Enterprise",       "relationType": ["included_in"] },
    { "from": "SSO / SAML 2.0",         "to": "Enterprise",       "relationType": ["included_in"] },
    { "from": "Audit Log",               "to": "Pro",              "relationType": ["included_in"] },
    { "from": "Audit Log",               "to": "Enterprise",       "relationType": ["included_in"] },
    { "from": "AI Summarization",        "to": "Pro",              "relationType": ["included_in"] },
    { "from": "AI Summarization",        "to": "Enterprise",       "relationType": ["included_in"] },
    { "from": "AI Summarization",        "to": "Nexus AI add-on",  "relationType": ["requires"] }
  ]
}
```
