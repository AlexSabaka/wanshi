### Example 1: Apache access log (timestamp → observation, real predicate)

Input:

## File information

Path: `logs/apache_access.log`

## Content to analyze
```
192.168.1.100 - - [10/Oct/2022:14:30:00 +0000] "GET /index.html HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
```

Output:

```json
{
  "entities": [
    {
      "name": "192.168.1.100",
      "entityType": "ip_address",
      "observations": ["Client that issued a GET request", "User agent Mozilla/5.0"]
    },
    {
      "name": "GET /index.html",
      "entityType": "request",
      "observations": [
        "HTTP/1.1 GET for /index.html at 2022-10-10 14:30:00 UTC",
        "Responded 200 with 1234 bytes"
      ]
    }
  ],
  "relations": [
    { "from": "192.168.1.100", "to": "GET /index.html", "relationType": ["requests"] }
  ]
}
```

Note: the timestamp is an observation on the request, not a `TIMESTAMP` hub node that
every edge points at. The relation is one real interaction with a verb-like predicate
(`requests`) — never `["SOURCE_IP", "REQUEST_METHOD"]`, which just restates the two
endpoint types and is not a predicate at all. Types are lowercase and reused.

---

### Example 2: Auth failure (actors + error)

Input:

## File information

Path: `logs/auth.log`

## Content to analyze
```
2022-10-10 14:32:11 sshd[2451]: Failed password for invalid user admin from 203.0.113.7 port 52344
```

Output:

```json
{
  "entities": [
    {
      "name": "203.0.113.7",
      "entityType": "ip_address",
      "observations": ["Source of a failed SSH login attempt at 2022-10-10 14:32:11"]
    },
    {
      "name": "admin",
      "entityType": "user",
      "observations": ["Invalid user targeted in the failed login"]
    },
    {
      "name": "sshd",
      "entityType": "service",
      "observations": ["SSH daemon (pid 2451) that rejected the login"]
    }
  ],
  "relations": [
    { "from": "203.0.113.7", "to": "admin", "relationType": ["authenticates_as"] },
    { "from": "203.0.113.7", "to": "sshd",  "relationType": ["targets"] }
  ]
}
```

---

### Example 3: Application error

Input:

## File information

Path: `logs/app.log`

## Content to analyze
```
2022-10-10 14:35:02 ERROR OrderService - NullPointerException while processing order 8841
```

Output:

```json
{
  "entities": [
    {
      "name": "OrderService",
      "entityType": "service",
      "observations": ["Raised a NullPointerException while processing order 8841 at 2022-10-10 14:35:02"]
    },
    {
      "name": "NullPointerException",
      "entityType": "error",
      "observations": ["Thrown during order processing in OrderService"]
    }
  ],
  "relations": [
    { "from": "OrderService", "to": "NullPointerException", "relationType": ["reports"] }
  ]
}
```

Note: across the file the type set stays small (`ip_address, user, service, request,
error`) and every relation is a single real interaction — `requests`,
`authenticates_as`, `targets`, `reports`. No timestamp nodes, no type-pair
"predicates", no self-loops, consistent actor → object direction.
