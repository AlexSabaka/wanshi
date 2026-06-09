### Example 1: Service contract

Input:

## File information

Path: `contracts/abc-xyz-services.pdf`

## Content to analyze
```
This contract is made between ABC Corporation ("the Company") and XYZ Inc.
("the Contractor") on January 10, 2022. The Company agrees to pay the Contractor
a total amount of $100,000 for the services rendered.
```

Output:

```json
{
  "entities": [
    {
      "name": "ABC Corporation",
      "entityType": "organization",
      "observations": ["Client in the services contract", "Pays $100,000 for services rendered"]
    },
    {
      "name": "XYZ Inc.",
      "entityType": "organization",
      "observations": ["Contractor in the services contract", "Receives $100,000 for services rendered"]
    }
  ],
  "relations": [
    { "from": "ABC Corporation", "to": "XYZ Inc.", "relationType": ["pays"] }
  ]
}
```

Note: `$100,000` is a value, not an entity. It lives in the observations of the
parties it concerns. The two companies are the real nodes; the payment is the edge.

---

### Example 2: Invoice

Input:

## File information

Path: `invoices/inv-1234.pdf`

## Content to analyze
```
Invoice #1234
Date: January 20, 2022
Bill To: ABC Corporation
Amount: $2,000
```

Output:

```json
{
  "entities": [
    {
      "name": "Invoice #1234",
      "entityType": "document",
      "observations": ["Issued 2022-01-20", "Billed amount $2,000"]
    },
    {
      "name": "ABC Corporation",
      "entityType": "organization",
      "observations": ["Billed party on Invoice #1234"]
    }
  ],
  "relations": [
    { "from": "Invoice #1234", "to": "ABC Corporation", "relationType": ["targets"] }
  ]
}
```

---

### Example 3: Loan agreement

Input:

## File information

Path: `loans/abc-term-loan.docx`

## Content to analyze
```
Loan Agreement between ABC Corporation (Borrower) and XYZ Bank (Lender) with a
loan amount of $500,000 and an interest rate of 5%.
```

Output:

```json
{
  "entities": [
    {
      "name": "ABC Corporation",
      "entityType": "organization",
      "observations": ["Borrower under the loan agreement", "Principal $500,000 at 5% interest"]
    },
    {
      "name": "XYZ Bank",
      "entityType": "organization",
      "observations": ["Lender under the loan agreement"]
    }
  ],
  "relations": [
    { "from": "ABC Corporation", "to": "XYZ Bank", "relationType": ["owes"] }
  ]
}
```

---

### Example 4: Financial statement

Input:

## File information

Path: `reports/fy2022-revenue.docx`

## Content to analyze
```
The company's total revenue for the year 2022 is $1,000,000, comprised of
sales ($800,000) and interest income ($200,000).
```

Output:

```json
{
  "entities": [
    {
      "name": "FY2022 revenue",
      "entityType": "metric",
      "observations": [
        "Total revenue of $1,000,000 for fiscal year 2022",
        "Composed of $800,000 sales and $200,000 interest income"
      ]
    }
  ],
  "relations": []
}
```

Note: a single reported figure with its breakdown is one `metric` entity, not four
dollar-amount nodes wired together. Splitting `$1,000,000`, `$800,000`, and
`$200,000` into separate entities produces meaningless value-nodes and a fan of
edges that say nothing. When there is only one real entity, an empty `relations`
array is correct.
