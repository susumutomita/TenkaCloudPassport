# GNU make loads this file before Makefile. Keep Makefile as the implementation
# source of truth and expose one stable completion command to autonomous agents.
include Makefile

.PHONY: agent-gate

# Extend before-commit when the product quality contract changes. Do not add a
# weaker Symphony-only path that can diverge from local and CI verification.
agent-gate: before-commit
