# Backend API Contract

This file was generated automatically by AI Factory after the backend phase completed.
**Frontend agents MUST use these exact paths, methods, and payload shapes.**
Do not invent or guess endpoint paths — use only what is listed here.

## Endpoint Summary

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Authenticate user and return JWT |
| `GET` | `/api/products` | Get products with optional filters and pagination |
| `GET` | `/api/products/:id` | Get a single product with its variants |
| `POST` | `/api/products` | Create a new product (admin only) |
| `GET` | `/api/categories` | Get all active categories |
| `GET` | `/api/cart` | Get current user or guest cart |
| `POST` | `/api/cart/items` | Add item to cart |
| `PUT` | `/api/cart/items/:itemId` | Update cart item quantity |
| `DELETE` | `/api/cart/items/:itemId` | Remove item from cart |
| `POST` | `/api/shipping/calculate` | Calculate shipping rates for given items and zip code |
| `POST` | `/api/orders` | Create a new order |
| `GET` | `/api/orders` | Get authenticated user's order history |
| `GET` | `/api/orders/:id` | Get order details by ID |
| `POST` | `/api/payments/stripe/intent` | Create a Stripe payment intent for an order |
| `POST` | `/api/payments/paypal/create` | Create a PayPal order for payment |
| `POST` | `/api/auth/register` | Register a new user account, hash password, and return a signed JWT with the safe user object. |
| `POST` | `/api/auth/login` | Authenticate an existing user with email/password and return a signed JWT. |
| `GET` | `/api/products` | Get products with filters, search, and pagination |
| `GET` | `/api/products/:id` | Get single product details with all variants |
| `POST` | `/api/products` | Create a new product with optional variants and image uploads (admin, requires auth) |
| `PUT` | `/api/products/:id` | Update an existing product (admin, requires auth) |
| `DELETE` | `/api/products/:id` | Soft-delete a product by setting isActive=false (admin, requires auth) |
| `POST` | `/api/products/:id/variants` | Add a variant to an existing product (admin, requires auth) |
| `PUT` | `/api/products/:id/variants/:variantId` | Update a product variant (admin, requires auth) |
| `DELETE` | `/api/products/:id/variants/:variantId` | Delete a product variant (admin, requires auth) |
| `GET` | `/api/categories` | Get all categories |
| `POST` | `/api/categories` | Create a new category (admin, requires auth) |
| `PUT` | `/api/categories/:id` | Update a category (admin, requires auth) |
| `DELETE` | `/api/categories/:id` | Delete a category (admin, requires auth) |
| `GET` | `/api/cart` | Get current cart for authenticated user or guest session. Pass Authorization header for users or X-Guest-Session-Id header for guests. |
| `POST` | `/api/cart/items` | Add an item to the cart. Merges quantity if same product+variant already exists. Supports auth users and guests. |
| `PUT` | `/api/cart/items/:itemId` | Update the quantity of a specific cart item by its subdocument ID. |
| `DELETE` | `/api/cart/items/:itemId` | Remove a specific item from the cart by its subdocument ID. |
| `POST` | `/api/shipping/calculate` | Calculate available shipping rates (standard, expedited, overnight) based on items, destination zip code, total weight, and order subtotal. Applies zone multiplier based on zip code prefix and free shipping threshold where applicable. |
| `POST` | `/api/payments/stripe/intent` | Create a Stripe PaymentIntent for a given order. Returns a clientSecret for frontend confirmation. Idempotent — reuses existing intent if one already exists on the order. |
| `POST` | `/api/payments/stripe/webhook` | Stripe webhook receiver. Handles payment_intent.succeeded (marks order paid) and payment_intent.payment_failed. Requires raw body; signature verified with STRIPE_WEBHOOK_SECRET. |
| `POST` | `/api/payments/paypal/create` | Create a PayPal Order for a given internal order. Returns paypalOrderId for frontend PayPal SDK. Idempotent — reuses existing PayPal order ID if already set. |
| `POST` | `/api/payments/paypal/capture` | Capture an approved PayPal Order. Marks the internal order as paid on successful capture. |
| `POST` | `/api/payments/paypal/webhook` | PayPal webhook receiver. Handles CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED (marks order paid) and PAYMENT.CAPTURE.DENIED / REVERSED (marks payment_failed). |
| `POST` | `/api/orders` | Create a new order. Validates stock, deducts inventory (variant or product level), clears cart, and sends confirmation email. |
| `GET` | `/api/orders` | Get authenticated user's order history with pagination and optional status filter. |
| `GET` | `/api/orders/:id` | Get order details by ID. Authenticated users must own the order; guest orders accessible without auth. |
| `PATCH` | `/api/orders/:id/status` | Update order status (admin only). Optionally set tracking number. |

## Endpoint Details

### `POST /api/auth/register`
Register a new user

**Request body:**
```json
{
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "role": "string",
    "addresses": []
  }
}
```

### `POST /api/auth/login`
Authenticate user and return JWT

**Request body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "role": "string",
    "addresses": []
  }
}
```

### `GET /api/products`
Get products with optional filters and pagination

**Response:**
```json
{
  "products": [],
  "totalPages": "number",
  "total": "number",
  "page": "number"
}
```

### `GET /api/products/:id`
Get a single product with its variants

**Response:**
```json
{
  "product": {},
  "variants": []
}
```

### `POST /api/products`
Create a new product (admin only)

**Request body:**
```json
{
  "name": "string",
  "description": "string",
  "price": "number",
  "category": "string",
  "variants": [],
  "images": []
}
```

**Response:**
```json
{
  "product": {},
  "variants": []
}
```

### `GET /api/categories`
Get all active categories

**Response:**
```json
{
  "categories": []
}
```

### `GET /api/cart`
Get current user or guest cart

**Response:**
```json
{
  "cart": {},
  "items": [],
  "total": "number"
}
```

### `POST /api/cart/items`
Add item to cart

**Request body:**
```json
{
  "productId": "string",
  "variantId": "string (optional)",
  "quantity": "number"
}
```

**Response:**
```json
{
  "cart": {},
  "items": [],
  "total": "number"
}
```

### `PUT /api/cart/items/:itemId`
Update cart item quantity

**Request body:**
```json
{
  "quantity": "number"
}
```

**Response:**
```json
{
  "cart": {},
  "items": [],
  "total": "number"
}
```

### `DELETE /api/cart/items/:itemId`
Remove item from cart

**Response:**
```json
{
  "cart": {},
  "items": [],
  "total": "number"
}
```

### `POST /api/shipping/calculate`
Calculate shipping rates for given items and zip code

**Request body:**
```json
{
  "items": [],
  "zipCode": "string"
}
```

**Response:**
```json
{
  "rates": []
}
```

### `POST /api/orders`
Create a new order

**Request body:**
```json
{
  "items": [],
  "shippingAddress": {},
  "shippingMethod": "string",
  "paymentMethod": "string"
}
```

**Response:**
```json
{
  "order": {}
}
```

### `GET /api/orders`
Get authenticated user's order history

**Response:**
```json
{
  "orders": []
}
```

### `GET /api/orders/:id`
Get order details by ID

**Response:**
```json
{
  "order": {},
  "items": [],
  "tracking": "string"
}
```

### `POST /api/payments/stripe/intent`
Create a Stripe payment intent for an order

**Request body:**
```json
{
  "orderId": "string",
  "amount": "number"
}
```

**Response:**
```json
{
  "clientSecret": "string"
}
```

### `POST /api/payments/paypal/create`
Create a PayPal order for payment

**Request body:**
```json
{
  "orderId": "string",
  "amount": "number"
}
```

**Response:**
```json
{
  "paypalOrderId": "string"
}
```

### `POST /api/auth/register`
Register a new user account, hash password, and return a signed JWT with the safe user object.

**Request body:**
```json
{
  "email": "string (required)",
  "password": "string (required, min 6 chars)",
  "firstName": "string (required)",
  "lastName": "string (required)"
}
```

**Response:**
```json
{
  "token": "string (JWT)",
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "addresses": [],
    "role": "string"
  }
}
```

### `POST /api/auth/login`
Authenticate an existing user with email/password and return a signed JWT.

**Request body:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Response:**
```json
{
  "token": "string (JWT)",
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "addresses": [],
    "role": "string"
  }
}
```

### `GET /api/products`
Get products with filters, search, and pagination

**Response:**
```json
{
  "products": [],
  "total": "number",
  "totalPages": "number",
  "page": "number"
}
```

### `GET /api/products/:id`
Get single product details with all variants

**Response:**
```json
{
  "product": {},
  "variants": []
}
```

### `POST /api/products`
Create a new product with optional variants and image uploads (admin, requires auth)

**Request body:**
```json
{
  "name": "string",
  "description": "string",
  "price": "number",
  "category": "string (ObjectId)",
  "images": "string[] (optional, body URLs)",
  "featured": "boolean (optional)",
  "tags": "string[] (optional)",
  "variants": "array (optional, JSON string or array)"
}
```

**Response:**
```json
{
  "product": {},
  "variants": []
}
```

### `PUT /api/products/:id`
Update an existing product (admin, requires auth)

**Request body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "price": "number (optional)",
  "category": "string (optional)",
  "images": "string[] (optional)",
  "featured": "boolean (optional)",
  "isActive": "boolean (optional)",
  "tags": "string[] (optional)"
}
```

**Response:**
```json
{
  "product": {},
  "variants": []
}
```

### `DELETE /api/products/:id`
Soft-delete a product by setting isActive=false (admin, requires auth)

**Response:**
```json
{
  "message": "Product deleted successfully"
}
```

### `POST /api/products/:id/variants`
Add a variant to an existing product (admin, requires auth)

**Request body:**
```json
{
  "size": "string (optional)",
  "color": "string (optional)",
  "techSpecs": "object (optional)",
  "stock": "number",
  "sku": "string (optional)",
  "priceModifier": "number (optional)"
}
```

**Response:**
```json
{
  "variant": {}
}
```

### `PUT /api/products/:id/variants/:variantId`
Update a product variant (admin, requires auth)

**Request body:**
```json
{
  "size": "string (optional)",
  "color": "string (optional)",
  "techSpecs": "object (optional)",
  "stock": "number (optional)",
  "sku": "string (optional)",
  "priceModifier": "number (optional)"
}
```

**Response:**
```json
{
  "variant": {}
}
```

### `DELETE /api/products/:id/variants/:variantId`
Delete a product variant (admin, requires auth)

**Response:**
```json
{
  "message": "Variant deleted successfully"
}
```

### `GET /api/categories`
Get all categories

**Response:**
```json
{
  "categories": []
}
```

### `POST /api/categories`
Create a new category (admin, requires auth)

**Request body:**
```json
{
  "name": "string",
  "slug": "string",
  "description": "string (optional)"
}
```

**Response:**
```json
{
  "category": {}
}
```

### `PUT /api/categories/:id`
Update a category (admin, requires auth)

**Request body:**
```json
{
  "name": "string (optional)",
  "slug": "string (optional)",
  "description": "string (optional)"
}
```

**Response:**
```json
{
  "category": {}
}
```

### `DELETE /api/categories/:id`
Delete a category (admin, requires auth)

**Response:**
```json
{
  "message": "Category deleted successfully"
}
```

### `GET /api/cart`
Get current cart for authenticated user or guest session. Pass Authorization header for users or X-Guest-Session-Id header for guests.

**Response:**
```json
{
  "cart": {
    "id": "string|null",
    "userId": "string|null",
    "guestSessionId": "string|null"
  },
  "items": [
    {
      "id": "string",
      "productId": "string",
      "variantId": "string|null",
      "quantity": "number",
      "product": {
        "name": "string",
        "price": "number",
        "images": "array",
        "category": "string"
      },
      "variant": {
        "size": "string",
        "color": "string",
        "techSpecs": "object",
        "stock": "number"
      },
      "unitPrice": "number",
      "subtotal": "number"
    }
  ],
  "total": "number"
}
```

### `POST /api/cart/items`
Add an item to the cart. Merges quantity if same product+variant already exists. Supports auth users and guests.

**Request body:**
```json
{
  "productId": "string (required)",
  "variantId": "string (optional)",
  "quantity": "number (required, min 1)"
}
```

**Response:**
```json
{
  "cart": {
    "id": "string",
    "userId": "string|null",
    "guestSessionId": "string|null"
  },
  "items": "array",
  "total": "number"
}
```

### `PUT /api/cart/items/:itemId`
Update the quantity of a specific cart item by its subdocument ID.

**Request body:**
```json
{
  "quantity": "number (required, min 1)"
}
```

**Response:**
```json
{
  "cart": {
    "id": "string",
    "userId": "string|null",
    "guestSessionId": "string|null"
  },
  "items": "array",
  "total": "number"
}
```

### `DELETE /api/cart/items/:itemId`
Remove a specific item from the cart by its subdocument ID.

**Response:**
```json
{
  "cart": {
    "id": "string",
    "userId": "string|null",
    "guestSessionId": "string|null"
  },
  "items": "array",
  "total": "number"
}
```

### `POST /api/shipping/calculate`
Calculate available shipping rates (standard, expedited, overnight) based on items, destination zip code, total weight, and order subtotal. Applies zone multiplier based on zip code prefix and free shipping threshold where applicable.

**Request body:**
```json
{
  "items": [
    {
      "productId": "string (optional, used to look up price/weight)",
      "variantId": "string (optional)",
      "quantity": "number (required, positive integer)",
      "price": "number (optional, overrides product lookup)",
      "weight": "number (optional lbs, overrides product lookup)"
    }
  ],
  "zipCode": "string (required, US zip code e.g. '90210' or '90210-1234')"
}
```

**Response:**
```json
{
  "rates": [
    {
      "method": "standard | expedited | overnight",
      "label": "string",
      "cost": "number",
      "estimatedDays": {
        "min": "number",
        "max": "number"
      },
      "estimatedDelivery": "string",
      "isFree": "boolean",
      "freeShippingMessage": "string (only present when isFree is true)"
    }
  ],
  "calculationDetails": {
    "totalWeightLbs": "number",
    "subtotal": "number",
    "zipCode": "string",
    "itemCount": "number"
  }
}
```

### `POST /api/payments/stripe/intent`
Create a Stripe PaymentIntent for a given order. Returns a clientSecret for frontend confirmation. Idempotent — reuses existing intent if one already exists on the order.

**Request body:**
```json
{
  "orderId": "string",
  "amount": "number (dollars)"
}
```

**Response:**
```json
{
  "clientSecret": "string"
}
```

### `POST /api/payments/stripe/webhook`
Stripe webhook receiver. Handles payment_intent.succeeded (marks order paid) and payment_intent.payment_failed. Requires raw body; signature verified with STRIPE_WEBHOOK_SECRET.

**Request body:**
```json
"Raw Stripe event payload"
```

**Response:**
```json
{
  "received": true
}
```

### `POST /api/payments/paypal/create`
Create a PayPal Order for a given internal order. Returns paypalOrderId for frontend PayPal SDK. Idempotent — reuses existing PayPal order ID if already set.

**Request body:**
```json
{
  "orderId": "string",
  "amount": "number (dollars)"
}
```

**Response:**
```json
{
  "paypalOrderId": "string"
}
```

### `POST /api/payments/paypal/capture`
Capture an approved PayPal Order. Marks the internal order as paid on successful capture.

**Request body:**
```json
{
  "paypalOrderId": "string"
}
```

**Response:**
```json
{
  "status": "string",
  "captureData": {}
}
```

### `POST /api/payments/paypal/webhook`
PayPal webhook receiver. Handles CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED (marks order paid) and PAYMENT.CAPTURE.DENIED / REVERSED (marks payment_failed).

**Request body:**
```json
"PayPal webhook event payload"
```

**Response:**
```json
{
  "received": true
}
```

### `POST /api/orders`
Create a new order. Validates stock, deducts inventory (variant or product level), clears cart, and sends confirmation email.

**Request body:**
```json
{
  "items": [
    {
      "productId": "string",
      "variantId": "string (optional)",
      "quantity": "number"
    }
  ],
  "shippingAddress": {
    "firstName": "string",
    "lastName": "string",
    "address1": "string",
    "address2": "string (optional)",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "country": "string",
    "phone": "string (optional)"
  },
  "shippingMethod": {
    "carrier": "string",
    "service": "string",
    "estimatedDays": "number",
    "price": "number"
  },
  "paymentMethod": {
    "type": "stripe|paypal|cod",
    "transactionId": "string (optional)"
  },
  "guestEmail": "string (for guest checkout)",
  "cartId": "string (optional, to clear after order)"
}
```

**Response:**
```json
{
  "order": {}
}
```

### `GET /api/orders`
Get authenticated user's order history with pagination and optional status filter.

**Response:**
```json
{
  "orders": [],
  "total": "number",
  "page": "number",
  "totalPages": "number"
}
```

### `GET /api/orders/:id`
Get order details by ID. Authenticated users must own the order; guest orders accessible without auth.

**Response:**
```json
{
  "order": {},
  "items": [],
  "tracking": "string|null"
}
```

### `PATCH /api/orders/:id/status`
Update order status (admin only). Optionally set tracking number.

**Request body:**
```json
{
  "status": "string (pending|confirmed|processing|shipped|delivered|cancelled|refunded)",
  "tracking": "string (optional)"
}
```

**Response:**
```json
{
  "order": {}
}
```
