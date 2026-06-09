### Example 1: Service agreement (date → observation on the document)

Input:

## File information

Path: `contracts/services-001.txt`

## Content to analyze
```
This Agreement ("Agreement") is made and entered into on February 10, 2022
("Effective Date") by and between John Smith ("John") and Jane Doe ("Jane") for
the provision of services.
```

Output:

```json
{
  "entities": [
    {
      "name": "Services Agreement",
      "entityType": "document",
      "observations": [
        "Service-provision contract effective 2022-02-10",
        "Between John Smith and Jane Doe"
      ]
    },
    {
      "name": "John Smith",
      "entityType": "person",
      "observations": ["Signatory to the Services Agreement"]
    },
    {
      "name": "Jane Doe",
      "entityType": "person",
      "observations": ["Signatory to the Services Agreement"]
    }
  ],
  "relations": [
    { "from": "John Smith", "to": "Services Agreement", "relationType": ["signed"] },
    { "from": "Jane Doe",   "to": "Services Agreement", "relationType": ["signed"] }
  ]
}
```

Note: the effective date is an observation on the document, not a `February 10, 2022`
node. The relationship between the two parties is captured by each being a signatory
to the shared document — no need for a separate symmetric `counterparties` edge in
both directions. Type is `person`, not `Person` (lowercase, reused).

---

### Example 2: Court filing

Input:

## File information

Path: `cases/acme-vs-globex.txt`

## Content to analyze
```
Case No. 22-CV-0148, Acme Corp. v. Globex Inc., filed in the Northern District of
California. Acme alleges breach of the Master Supply Agreement.
```

Output:

```json
{
  "entities": [
    {
      "name": "Acme Corp. v. Globex Inc.",
      "entityType": "document",
      "observations": [
        "Civil case No. 22-CV-0148",
        "Alleges breach of the Master Supply Agreement"
      ]
    },
    {
      "name": "Acme Corp.",
      "entityType": "organization",
      "observations": ["Plaintiff alleging breach of contract"]
    },
    {
      "name": "Globex Inc.",
      "entityType": "organization",
      "observations": ["Defendant"]
    },
    {
      "name": "Northern District of California",
      "entityType": "court",
      "observations": ["Venue for case 22-CV-0148"]
    },
    {
      "name": "Master Supply Agreement",
      "entityType": "document",
      "observations": ["Contract alleged to have been breached"]
    }
  ],
  "relations": [
    { "from": "Acme Corp.",  "to": "Acme Corp. v. Globex Inc.", "relationType": ["party_to"] },
    { "from": "Globex Inc.", "to": "Acme Corp. v. Globex Inc.", "relationType": ["party_to"] },
    { "from": "Acme Corp. v. Globex Inc.", "to": "Northern District of California", "relationType": ["filed_in"] },
    { "from": "Acme Corp. v. Globex Inc.", "to": "Master Supply Agreement", "relationType": ["references"] }
  ]
}
```

---

### Example 3: Statute definition

Input:

## File information

Path: `statutes/privacy-act-s4.txt`

## Content to analyze
```
Section 4 of the Privacy Act defines "personal data" as any information relating to
an identified or identifiable natural person.
```

Output:

```json
{
  "entities": [
    {
      "name": "Privacy Act",
      "entityType": "statute",
      "observations": ["Section 4 defines the term 'personal data'"]
    },
    {
      "name": "personal data",
      "entityType": "term",
      "observations": ["Any information relating to an identified or identifiable natural person"]
    }
  ],
  "relations": [
    { "from": "Privacy Act", "to": "personal data", "relationType": ["defines"] }
  ]
}
```

Note: type set is small and reused (`document, person, organization, court, statute,
term`). Every predicate is one canonical verb from the legal set (`signed`,
`party_to`, `filed_in`, `references`, `defines`) — none restates endpoint types, none
is a two-synonym array, and direction is consistent (party → document, document →
court).
