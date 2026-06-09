### Example 1

Input:

## File Information

Path: `src/auth/AuthService.ts`

## Content to Analyze

```typescript
import { Injectable } from '@di/decorators';
import { IAuthService } from './IAuthService';
import { UserRepository } from '../user/UserRepository';
import { JwtTokenService } from '../token/JwtTokenService';
import { HashService } from '../crypto/HashService';

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly jwtService: JwtTokenService,
    private readonly hashService: HashService,
  ) {}

  async login(email: string, password: string): Promise<string> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) throw new Error('User not found');
    const valid = await this.hashService.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  async refresh(token: string): Promise<string> {
    const payload = this.jwtService.verify(token);
    return this.jwtService.sign({ sub: payload.sub, email: payload.email });
  }

  async logout(userId: string): Promise<void> {
    await this.jwtService.revoke(userId);
  }
}
```

Output:

```json
{
  "entities": [
    {
      "name": "AuthService",
      "entityType": "class",
      "observations": [
        "Implements IAuthService interface",
        "Decorated with @Injectable for dependency injection",
        "Handles login, token refresh, and logout operations"
      ]
    },
    {
      "name": "IAuthService",
      "entityType": "interface",
      "observations": [
        "Contract implemented by AuthService",
        "Defines authentication operations"
      ]
    },
    {
      "name": "UserRepository",
      "entityType": "dependency",
      "observations": [
        "Injected via constructor",
        "Used to look up users by email"
      ]
    },
    {
      "name": "JwtTokenService",
      "entityType": "dependency",
      "observations": [
        "Injected via constructor",
        "Signs, verifies, and revokes JWT tokens"
      ]
    },
    {
      "name": "HashService",
      "entityType": "dependency",
      "observations": [
        "Injected via constructor",
        "Compares plain-text passwords against stored hashes"
      ]
    },
    {
      "name": "login",
      "entityType": "function",
      "observations": [
        "Accepts email and password, returns signed JWT string",
        "Throws on unknown user or wrong password"
      ]
    },
    {
      "name": "refresh",
      "entityType": "function",
      "observations": ["Verifies existing token and issues a new one"]
    },
    {
      "name": "logout",
      "entityType": "function",
      "observations": ["Revokes all tokens for the given user ID"]
    }
  ],
  "relations": [
    { "from": "AuthService", "to": "IAuthService",     "relationType": ["implements"] },
    { "from": "AuthService", "to": "UserRepository",   "relationType": ["depends_on"] },
    { "from": "AuthService", "to": "JwtTokenService",  "relationType": ["depends_on"] },
    { "from": "AuthService", "to": "HashService",      "relationType": ["depends_on"] },
    { "from": "login",       "to": "UserRepository",   "relationType": ["calls"] },
    { "from": "login",       "to": "HashService",      "relationType": ["calls"] },
    { "from": "login",       "to": "JwtTokenService",  "relationType": ["calls"] },
    { "from": "refresh",     "to": "JwtTokenService",  "relationType": ["calls"] },
    { "from": "logout",      "to": "JwtTokenService",  "relationType": ["calls"] }
  ]
}
```

---

### Example 2

Input:

## File Information

Path: `pipelines/ingest.py`

## Content to Analyze

```python
import csv
import json
from dataclasses import dataclass
from typing import List

@dataclass
class SalesRecord:
    sku: str
    region: str
    quantity: int
    revenue: float

def read_csv(file_path: str) -> List[SalesRecord]:
    records = []
    with open(file_path, newline='') as f:
        for row in csv.DictReader(f):
            records.append(SalesRecord(
                sku=row['SKU'],
                region=row['Region'],
                quantity=int(row['Quantity']),
                revenue=float(row['Revenue']),
            ))
    return records

def filter_by_region(records: List[SalesRecord], region: str) -> List[SalesRecord]:
    return [r for r in records if r.region == region]

def export_json(records: List[SalesRecord], out_path: str) -> None:
    with open(out_path, 'w') as f:
        json.dump([vars(r) for r in records], f, indent=2)

def ingest_pipeline(src: str, region: str, dest: str) -> None:
    records = read_csv(src)
    filtered = filter_by_region(records, region)
    export_json(filtered, dest)
```

Output:

```json
{
  "entities": [
    {
      "name": "SalesRecord",
      "entityType": "data_structure",
      "observations": [
        "Python dataclass with sku, region, quantity, revenue fields",
        "Used as the canonical in-memory representation of a CSV row"
      ]
    },
    {
      "name": "read_csv",
      "entityType": "function",
      "observations": [
        "Reads a CSV file and returns a list of SalesRecord instances",
        "Uses csv.DictReader; expects SKU, Region, Quantity, Revenue columns"
      ]
    },
    {
      "name": "filter_by_region",
      "entityType": "function",
      "observations": [
        "Filters a list of SalesRecord by exact region string match",
        "Returns a new list; does not mutate input"
      ]
    },
    {
      "name": "export_json",
      "entityType": "function",
      "observations": [
        "Serializes SalesRecord list to a pretty-printed JSON file",
        "Converts dataclasses to dicts via vars()"
      ]
    },
    {
      "name": "ingest_pipeline",
      "entityType": "function",
      "observations": [
        "Orchestrates the full ETL: read → filter → export",
        "Entry point for the ingestion module"
      ]
    }
  ],
  "relations": [
    { "from": "read_csv",         "to": "SalesRecord",      "relationType": ["produces"] },
    { "from": "filter_by_region", "to": "SalesRecord",      "relationType": ["processes"] },
    { "from": "export_json",      "to": "SalesRecord",      "relationType": ["processes"] },
    { "from": "ingest_pipeline",  "to": "read_csv",         "relationType": ["calls"] },
    { "from": "ingest_pipeline",  "to": "filter_by_region", "relationType": ["calls"] },
    { "from": "ingest_pipeline",  "to": "export_json",      "relationType": ["calls"] }
  ]
}
```
