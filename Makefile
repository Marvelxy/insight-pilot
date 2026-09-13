# ─────────────────────────────────────────────────────────────
# InsightPilot — start the app (run `make -f Makefile.setup setup` first)
#
# Usage:
#   make            # start API (default, :4000 — docs at /api/docs)
#   make all        # api + worker + web in one terminal (Ctrl-C stops all)
#   make <target>   # or start one service (see: make help)
# ─────────────────────────────────────────────────────────────
.DEFAULT_GOAL := start
SHELL := /bin/bash

API_DIR := apps/api
WEB_DIR := apps/web

.PHONY: start worker web all test build check help

start: check ## Start API dev server (:4000)
	cd $(API_DIR) && npm run start:dev

worker: check ## Start ingestion worker (2nd terminal)
	cd $(API_DIR) && npm run start:worker:dev

web: check ## Start web UI (:3000, 3rd terminal)
	cd $(WEB_DIR) && npm run dev

all: check ## Start api + worker + web together (Ctrl-C stops all)
	@trap 'kill 0' INT; \
	(cd $(API_DIR) && npm run start:dev) & \
	(cd $(API_DIR) && npm run start:worker:dev) & \
	(cd $(WEB_DIR) && npm run dev) & \
	wait

test: ## Run api unit tests
	cd $(API_DIR) && npm test -- --passWithNoTests

build: ## Build api + web
	cd $(API_DIR) && npm run build
	cd $(WEB_DIR) && npm run build

check:
	@if [ ! -f .env ]; then echo "✗ .env missing — run: make -f Makefile.setup setup"; exit 1; fi
	@if [ ! -d node_modules ]; then echo "✗ dependencies missing — run: make -f Makefile.setup setup"; exit 1; fi

help: ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS=":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
