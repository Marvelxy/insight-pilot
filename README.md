# InsightPilot

Multi-tenant Retrieval-Augmented Generation (RAG) platform. Organizations can upload PDFs or text documents and chat with them to get streamed answers with citations. Includes metering, API keys, and evals.

**Stack:** NestJS 11 · Prisma 6 · Postgres 16 · Redis + BullMQ · Next.js 15 · Hugging Face (with OpenAI/stub fallback)

## Prerequisites

Before starting, ensure you have the following installed and running on your system:
- **Node.js**: v20+
- **PostgreSQL**: v16+ (running and accepting connections)
- **Redis**: (running and accepting connections)

## Setup & Installation

We provide a setup Makefile to automate environment creation, dependency installation, database creation, and seeding.

1. **Run the setup script:**
   ```bash
   make -f Makefile.setup setup
   ```
   *This command will:*
   - Check if your prerequisites are met
   - Create a `.env` file (you may want to add your `HF_TOKEN` or `OPENAI_API_KEY`)
   - Install all NPM dependencies
   - Create the `insightpilot` Postgres database
   - Run Prisma migrations
   - Seed the database with a demo user and organization

2. **Start the application stack:**
   ```bash
   make all
   ```
   *This starts three services concurrently:*
   - **API Server**: `http://localhost:4000` (Swagger docs available at `/api/docs`)
   - **Ingestion Worker**: Background worker for parsing and embedding documents
   - **Web UI**: `http://localhost:3000`

> **Demo Login:** You can log in to the Web UI at `localhost:3000` using the seeded demo account: `demo@insightpilot.dev` (the password is any string 8 characters or longer).

## Development Commands

You can run individual services during development using the main Makefile:

- `make start` — Starts the NestJS API server in dev mode
- `make worker` — Starts the BullMQ ingestion worker in watch mode
- `make web` — Starts the Next.js web application
- `make build` — Builds the API and Web apps for production
- `make test` — Runs unit tests

## Architecture Notes

- **Authentication**: JWT-based auth via `OrgGuard` (handles org membership + roles). Includes audit logging and quotas.
- **Ingestion Pipeline**: `pdf-parse` → chunks (800 words, 120 overlap) → embed → BullMQ worker. Embeddings are stored natively as JSON with cosine similarity calculated in application code (no `pgvector` required).
- **AI Gateway**: Configured via `AiService`. Prioritizes Hugging Face Serverless API → OpenAI → stub fallback. *(Note: If you switch providers, you must re-upload documents as the embedding vector dimensions will change).*
