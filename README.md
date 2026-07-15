# Genfrona Inventory Tracker

A secure inventory, sales, stock-activity and reporting tool for Genfrona eyewear.

## Features

- Automatic category and price-based product codes
- Inventory, brand, stock and low-stock tracking
- Sales reporting with date-range filters
- Excel import and export
- Two-way Google Sheets synchronisation
- Passwordless, email-linked authentication
- Staff and administrator roles
- User and inventory audit trail

## Technology

- React 19 and Next.js-compatible Vinext runtime
- Cloudflare Workers and D1
- Drizzle ORM migrations
- Tailwind CSS
- SheetJS for Excel files
- Google Apps Script for spreadsheet synchronisation

## Local setup

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

The application expects a D1 `DB` binding. Hosted runtime values for Google Sheets are intentionally excluded from this repository.

## Validation

```bash
npm run build
npm test
```

## Security

Do not commit production secrets, sync keys or environment files. Authentication and authorization checks run server-side.
