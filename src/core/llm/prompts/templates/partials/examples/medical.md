### Example 1: Patient record with vitals (literals → observations)

Input:

## File information

Path: `records/john-smith.txt`

## Content to analyze
```
Patient Name: John Smith, Date: 2022-01-01, Test Result: Blood Pressure 120/80 mmHg,
Heart Rate 70 bpm.
```

Output:

```json
{
  "entities": [
    {
      "name": "John Smith",
      "entityType": "person",
      "observations": [
        "Patient; record dated 2022-01-01",
        "Blood pressure 120/80 mmHg",
        "Heart rate 70 bpm"
      ]
    }
  ],
  "relations": []
}
```

Note: `120/80 mmHg` and `70 bpm` are measured values, not nodes. They live as
observations on the patient. The type is `person`, not `Patient Name` — the name is
the patient's name, the type is the category. One real entity → empty `relations`.

---

### Example 2: Prescription

Input:

## File information

Path: `rx/jane-doe.txt`

## Content to analyze
```
Patient Name: Jane Doe, Medication: Amoxicillin 500mg, Dosage: 2 tablets,
Frequency: 3 times a day.
```

Output:

```json
{
  "entities": [
    {
      "name": "Jane Doe",
      "entityType": "person",
      "observations": ["Patient prescribed Amoxicillin"]
    },
    {
      "name": "Amoxicillin",
      "entityType": "medication",
      "observations": ["Prescribed at 500mg, 2 tablets, 3 times a day"]
    }
  ],
  "relations": [
    { "from": "Jane Doe", "to": "Amoxicillin", "relationType": ["prescribed"] }
  ]
}
```

Note: dosage and frequency are observations on the medication, not `2 tablets` /
`3 times a day` nodes. The medication name is canonical (`Amoxicillin`), with the
specific strength in the observation so the same drug merges across records.

---

### Example 3: Medical record (diagnosis + medication)

Input:

## File information

Path: `records/bob-johnson.txt`

## Content to analyze
```
Patient Name: Bob Johnson, Date: 2020-01-01, Diagnosis: Diabetes Type 2,
Medication: Metformin 1000mg.
```

Output:

```json
{
  "entities": [
    {
      "name": "Bob Johnson",
      "entityType": "person",
      "observations": ["Patient; record dated 2020-01-01"]
    },
    {
      "name": "Diabetes Type 2",
      "entityType": "condition",
      "observations": ["Chronic metabolic condition"]
    },
    {
      "name": "Metformin",
      "entityType": "medication",
      "observations": ["Prescribed at 1000mg"]
    }
  ],
  "relations": [
    { "from": "Bob Johnson", "to": "Diabetes Type 2", "relationType": ["diagnosed_with"] },
    { "from": "Bob Johnson", "to": "Metformin",       "relationType": ["prescribed"] }
  ]
}
```

---

### Example 4: Lab report (test → result)

Input:

## File information

Path: `labs/rachel-kim.txt`

## Content to analyze
```
Patient Name: Rachel Kim, Date: 2022-10-01, Test: Blood Test, Result: Abnormal —
elevated white cell count.
```

Output:

```json
{
  "entities": [
    {
      "name": "Rachel Kim",
      "entityType": "person",
      "observations": ["Patient; blood test dated 2022-10-01"]
    },
    {
      "name": "Blood Test",
      "entityType": "test",
      "observations": ["Result abnormal: elevated white cell count"]
    }
  ],
  "relations": [
    { "from": "Rachel Kim", "to": "Blood Test", "relationType": ["underwent"] }
  ]
}
```

Note: `Abnormal` is not a `result` node — the finding is an observation on the test.
A bare result value with no further entity to anchor it is just an observation.

---

### Example 5: Allergy + procedure with provider

Input:

## File information

Path: `records/laura-davis.txt`

## Content to analyze
```
Patient Name: Laura Davis, Date: 2022-08-01, Allergy: Penicillin (causes rash),
Procedure: Appendectomy performed by Dr. Johnson.
```

Output:

```json
{
  "entities": [
    {
      "name": "Laura Davis",
      "entityType": "person",
      "observations": ["Patient; record dated 2022-08-01", "Allergic to penicillin (rash)"]
    },
    {
      "name": "Penicillin",
      "entityType": "medication",
      "observations": ["Causes a rash in this patient"]
    },
    {
      "name": "Appendectomy",
      "entityType": "procedure",
      "observations": ["Surgical removal of the appendix"]
    },
    {
      "name": "Dr. Johnson",
      "entityType": "provider",
      "observations": ["Surgeon who performed the appendectomy"]
    }
  ],
  "relations": [
    { "from": "Laura Davis",  "to": "Penicillin",   "relationType": ["allergic_to"] },
    { "from": "Laura Davis",  "to": "Appendectomy", "relationType": ["underwent"] },
    { "from": "Laura Davis",  "to": "Dr. Johnson",  "relationType": ["treated_by"] }
  ]
}
```

Note: type set stays small and reused (`person, medication, condition, test,
procedure, provider`). Every predicate is a single verb-like label from the medical
set; none restates the endpoint types (`has Blood Pressure` is gone). Direction is
consistent: patient → thing.
