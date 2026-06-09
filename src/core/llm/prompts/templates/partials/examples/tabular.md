### Example 1

Input:

## File Information

Path: `data/inventory/products_2024q1.csv`

## Content to Analyze

```
SKU,Name,Category,Price,Stock,Supplier
PRD-001,USB-C Hub 7-Port,Accessories,49.99,312,TechSource Inc
PRD-002,Mechanical Keyboard TKL,Peripherals,129.99,87,KeyCraft
PRD-003,27in 4K Monitor,Displays,399.99,44,ViewMax
PRD-004,Laptop Stand Aluminum,Accessories,39.99,201,TechSource Inc
PRD-005,Wireless Mouse Ergonomic,Peripherals,69.99,156,KeyCraft
```

Output:

```json
{
  "entities": [
    {
      "name": "products_2024q1",
      "entityType": "table",
      "observations": [
        "Inventory snapshot for Q1 2024",
        "6 columns: SKU, Name, Category, Price, Stock, Supplier",
        "5 product rows across 3 categories"
      ]
    },
    {
      "name": "Accessories",
      "entityType": "category",
      "observations": [
        "Contains PRD-001 (USB-C Hub) and PRD-004 (Laptop Stand)",
        "Both products supplied by TechSource Inc",
        "Price range: $39.99–$49.99"
      ]
    },
    {
      "name": "Peripherals",
      "entityType": "category",
      "observations": [
        "Contains PRD-002 (Mechanical Keyboard) and PRD-005 (Wireless Mouse)",
        "Both products supplied by KeyCraft",
        "Price range: $69.99–$129.99"
      ]
    },
    {
      "name": "Displays",
      "entityType": "category",
      "observations": [
        "Contains PRD-003 (27in 4K Monitor)",
        "Highest unit price at $399.99",
        "Lowest stock level at 44 units"
      ]
    },
    {
      "name": "TechSource Inc",
      "entityType": "supplier",
      "observations": ["Supplies all Accessories category products"]
    },
    {
      "name": "KeyCraft",
      "entityType": "supplier",
      "observations": ["Supplies all Peripherals category products"]
    },
    {
      "name": "ViewMax",
      "entityType": "supplier",
      "observations": ["Sole supplier of Displays category"]
    }
  ],
  "relations": [
    { "from": "products_2024q1", "to": "Accessories",    "relationType": ["contains"] },
    { "from": "products_2024q1", "to": "Peripherals",    "relationType": ["contains"] },
    { "from": "products_2024q1", "to": "Displays",       "relationType": ["contains"] },
    { "from": "TechSource Inc",  "to": "Accessories",    "relationType": ["supplies"] },
    { "from": "KeyCraft",        "to": "Peripherals",    "relationType": ["supplies"] },
    { "from": "ViewMax",         "to": "Displays",       "relationType": ["supplies"] }
  ]
}
```

---

### Example 2

Input:

## File Information

Path: `db/schema/orders.sql`

## Content to Analyze

```sql
CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0)
);

CREATE TABLE orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status      TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL
);
```

Output:

```json
{
  "entities": [
    {
      "name": "customers",
      "entityType": "table",
      "observations": [
        "Primary key: UUID with gen_random_uuid() default",
        "email must be unique and not null",
        "Soft-delete cascade propagates to orders"
      ]
    },
    {
      "name": "products",
      "entityType": "table",
      "observations": [
        "SKU is unique identifier alongside UUID primary key",
        "price_cents enforces positive integer constraint",
        "No cascade delete — orphan order_items are prevented by FK"
      ]
    },
    {
      "name": "orders",
      "entityType": "table",
      "observations": [
        "Links to customers via customer_id foreign key",
        "Default status is 'pending'",
        "Cascade deletes propagate to order_items"
      ]
    },
    {
      "name": "order_items",
      "entityType": "table",
      "observations": [
        "Junction table between orders and products",
        "Stores unit_price_cents at time of purchase (denormalized for history)",
        "quantity must be positive"
      ]
    }
  ],
  "relations": [
    { "from": "orders",       "to": "customers",  "relationType": ["foreign_key_to"] },
    { "from": "order_items",  "to": "orders",     "relationType": ["foreign_key_to"] },
    { "from": "order_items",  "to": "products",   "relationType": ["foreign_key_to"] }
  ]
}
```
