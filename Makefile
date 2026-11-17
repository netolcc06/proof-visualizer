# Run from the repo root inside WSL / Linux. Needs only Docker + Compose.
COMPOSE ?= docker compose

.PHONY: build dev web test logs down verit-wasm carcara-wasm

build: verit-wasm carcara-wasm
	$(COMPOSE) --profile web build bridge web

# veriT -> WebAssembly into wasm/verit/dist (docker layer cache makes repeat runs fast)
verit-wasm:
	docker build -o wasm/verit/dist --target dist wasm/verit

# Carcara -> WebAssembly into wasm/carcara/dist (first build compiles GMP and Carcara; later runs hit the Docker cache)
carcara-wasm:
	docker build -o wasm/carcara/dist --target dist wasm/carcara

dev: verit-wasm carcara-wasm
	$(COMPOSE) up -d bridge frontend
	@echo "App:    http://localhost:3000"
	@echo "Bridge: http://localhost:4000/api/health"

web: verit-wasm carcara-wasm
	$(COMPOSE) --profile web up -d --build bridge web
	@echo "Web:    http://localhost:8080 (bridge: http://localhost:4000)"

test: verit-wasm carcara-wasm
	$(COMPOSE) --profile test build bridge-test
	$(COMPOSE) --profile test run --rm bridge-test
	$(COMPOSE) --profile test run --rm frontend-test

logs:
	$(COMPOSE) --profile web logs -f --tail=100

down:
	$(COMPOSE) --profile web --profile test down --remove-orphans
