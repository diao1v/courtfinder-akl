# courtfinder-akl

A Hono app built with Node.js, TypeScript, and pnpm.

## Prerequisites

- Node.js v24 (or v20+)
- pnpm

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Run the development server:
```bash
pnpm dev
```

3. Build for production:
```bash
pnpm build
```

4. Start the production server:
```bash
pnpm start
```

## Project Structure

```
.
├── src/
│   └── index.ts       # Main application entry point
├── dist/              # Build output (generated)
├── package.json       # Project dependencies and scripts
├── tsconfig.json      # TypeScript configuration
└── .gitignore         # Git ignore rules
```

## Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build the project for production
- `pnpm start` - Start the production server

## Tech Stack

- [Hono](https://hono.dev/) - Lightweight web framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [tsx](https://github.com/esbuild-kit/tsx) - TypeScript executor for development
- [pnpm](https://pnpm.io/) - Fast, disk space efficient package manager
