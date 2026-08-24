# Sudoku API Makefile

.PHONY: all build server generate-constants wasm wasm-copy clean test coverage-gate vulncheck mutation-install mutation-probe-check mutation-go mutation-gate mutation-ratchet mutation-clean

# Go build settings
GO := go
TINYGO := tinygo
GOOS_WASM := GOOS=js GOARCH=wasm

# Output paths
WASM_OUT := ../frontend/public/sudoku.wasm
WASM_EXEC_OUT := ../frontend/public/wasm_exec.js

# TinyGo build flags for smallest WASM
TINYGO_FLAGS := -target=wasm -no-debug -opt=z

# Standard Go LDFLAGS (for fallback builds)
LDFLAGS := -ldflags="-s -w"

# TinyGo root for wasm_exec.js
TINYGO_ROOT := $(shell $(TINYGO) env TINYGOROOT 2>/dev/null)

all: server generate-constants wasm

# Build the HTTP server
server:
	$(GO) build -o bin/server ./cmd/server

# Generate TypeScript constants from Go source
generate-constants:
	@echo "Generating TypeScript constants from Go..."
	@cd scripts && go run generate-ts-constants.go
	@echo "TypeScript constants generated successfully"

# Build WASM module with TinyGo (default - smaller output)
wasm:
	$(TINYGO) build $(TINYGO_FLAGS) -o $(WASM_OUT) ./cmd/wasm

# Build WASM with standard Go (fallback if TinyGo unavailable)
wasm-go:
	$(GOOS_WASM) $(GO) build $(LDFLAGS) -o $(WASM_OUT) ./cmd/wasm

# Copy wasm_exec.js from TinyGo installation
wasm-copy:
	cp "$(TINYGO_ROOT)/targets/wasm_exec.js" $(WASM_EXEC_OUT)

# Copy wasm_exec.js from standard Go (fallback)
wasm-copy-go:
	cp "$$($(GO) env GOROOT)/misc/wasm/wasm_exec.js" $(WASM_EXEC_OUT)

# Build WASM and copy support file (TinyGo)
wasm-all: wasm wasm-copy
	@echo "TinyGo WASM build complete!"
	@echo "Output: $(WASM_OUT)"
	@ls -lh $(WASM_OUT)

# Build WASM and copy support file (standard Go fallback)
wasm-all-go: wasm-go wasm-copy-go
	@echo "Standard Go WASM build complete!"
	@echo "Output: $(WASM_OUT)"
	@ls -lh $(WASM_OUT)

# Run tests
test:
	$(GO) test ./...

# Run tests with Allure-compatible JUnit XML output (requires gotestsum)
test-allure:
	@mkdir -p allure-results
	gotestsum --junitfile allure-results/go-results.xml --format testname -- -v ./...

# Run tests with coverage report
test-coverage:
	$(GO) test -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"
	@$(GO) tool cover -func=coverage.out | tail -1

# Run tests with verbose coverage per package
test-coverage-verbose:
	$(GO) test -v -coverprofile=coverage.out -covermode=atomic ./...
	$(GO) tool cover -func=coverage.out

# Per-package coverage floors. Kept just below measured coverage to absorb minor
# Go-version / test-ordering variance; see COVERAGE.md for the full policy. COV-1
# drove every gated package to an honest ceiling (measured: dp 99.4%, human 100%,
# techniques 99.1%), with the residual sub-100 being genuinely unreachable
# defensive code documented in COVERAGE.md. Floors sit at 99. Note:
# transport/http is intentionally NOT gated here. It is a dev-only HTTP harness
# (ARCH-2; see internal/transport/http/doc.go) never built for production, so it
# carries no production coverage floor. Its tests still run under "go test ./...".
DP_COVERAGE_FLOOR := 99
HUMAN_COVERAGE_FLOOR := 99
TECHNIQUES_COVERAGE_FLOOR := 99
# diagnosis (CODE-7's deduped user-error logic) reaches an honest 98.6% ceiling:
# the only uncovered line is a Go-required trailing `return` after an exhaustive
# early-return, so it is unreachable rather than a testing gap. Floor sits below
# the measured baseline to absorb Go-version/test-order variance.
DIAGNOSIS_COVERAGE_FLOOR := 98

# Enforce per-package coverage floors. Runs `go test -cover` per gated package,
# parses the reported percentage, and exits non-zero on breach. CI invokes this
# from the test-go job; run locally with `make coverage-gate`.
coverage-gate:
	@set -e; \
	check_pkg() { \
		pkg="$$1"; floor="$$2"; \
		out=$$(go test -cover "$$pkg" 2>&1) || { \
			echo "coverage-gate: ERROR go test failed for $$pkg" >&2; \
			echo "$$out" >&2; \
			exit 2; \
		}; \
		pct=$$(printf '%s\n' "$$out" | grep -oE 'coverage:[[:space:]]+[0-9]+(\.[0-9]+)?%' | grep -oE '[0-9]+(\.[0-9]+)?' | head -1); \
		if [ -z "$$pct" ]; then \
			echo "coverage-gate: ERROR could not parse coverage for $$pkg" >&2; \
			echo "$$out" >&2; \
			exit 2; \
		fi; \
		ok=$$(awk -v p="$$pct" -v f="$$floor" 'BEGIN { print (p+0 >= f+0) ? 1 : 0 }'); \
		if [ "$$ok" = "1" ]; then \
			printf 'coverage-gate: OK   %s %s%% (floor %s%%)\n' "$$pkg" "$$pct" "$$floor"; \
		else \
			delta=$$(awk -v p="$$pct" -v f="$$floor" 'BEGIN { printf "%.1f", f - p }'); \
			printf 'coverage-gate: FAIL %s %s%% < floor %s%% (short by %spp)\n' "$$pkg" "$$pct" "$$floor" "$$delta" >&2; \
			exit 1; \
		fi; \
	}; \
	check_pkg ./internal/sudoku/dp $(DP_COVERAGE_FLOOR); \
	check_pkg ./internal/sudoku/human $(HUMAN_COVERAGE_FLOOR); \
	check_pkg ./internal/sudoku/human/techniques $(TECHNIQUES_COVERAGE_FLOOR); \
	check_pkg ./internal/sudoku/diagnosis $(DIAGNOSIS_COVERAGE_FLOOR); \
	echo "coverage-gate: all gated packages met their floors."

# Per-package mutation efficacy floors (MUT-1-2; Decisions 4 + 9). The Go solver
# is the source of truth for game correctness, so it carries the project's
# strictest mutation floors. Efficacy is defined in the mutation-gate target
# below. dp currently sits below human and techniques only because it is the one
# package with an honest measurement; MUT-6 is closing that gap.
#
# The numbers themselves live in mutation-floors.json, which the nightly
# workflow reads too, so no copy exists here to drift out of step (MUT-6-1).
# Read one with `python3 scripts/mutation_floors.py get <scope>`; raise one with
# `make mutation-ratchet`, never by editing a number into a file.
MUTATION_FLOORS := python3 scripts/mutation_floors.py

# go-mutesting binary. avito-tech/go-mutesting v2.3.1 carries an upstream
# packaging defect: its go.mod declares `module github.com/avito-tech/go-mutesting`
# without the /v2 suffix the v2.x tag requires, so `go install ...@v2.3.1`
# fails (both with and without /v2). `make mutation-install` builds the exact
# v2.3.1 tag from a local clone as the documented workaround; CI (MUT-1-6)
# must use the same path. GOPATH/bin is not assumed to be on PATH.
GO_MUTESTESTING_BIN := $(shell go env GOPATH)/bin/go-mutesting
GO_MUTESTESTING_TAG := v2.3.1
MUTATION_REPORT_DIR := reports/mutation

# Local patch applied to the pinned tag before building (MUT-6-27). Upstream
# reads three meanings out of one `go test` exit code and expects 2 for a build
# failure; modern `go test` returns 1, so its skip path is unreachable and every
# mutant that never compiled was scored as a kill. The patch compiles each
# mutant with `go test -c` first, observing compilation rather than inferring it
# from an exit code. The filename carries the tag, so bumping the tag points at
# a patch that does not exist and the build stops instead of quietly producing
# an unpatched binary. See the patch header for the measured magnitude.
GO_MUTESTESTING_PATCH := patches/go-mutesting-$(GO_MUTESTESTING_TAG)-compile-probe.patch

# String the patch compiles into the binary. `mutation-install` greps for it to
# tell a patched binary from one an earlier install left on PATH, which the
# is-executable short-circuit would otherwise reuse indefinitely. Keep in sync
# with compileProbeMarker in the patch.
GO_MUTESTESTING_PATCH_MARKER := go-mutesting-compile-probe/MUT-6-27

# Frozen fixture package the compile-probe regression check mutates. It is not
# production code; see its package comment.
MUTATION_PROBE_FIXTURE := ./internal/mutationfixture/compileprobe

# Per-mutant `go test` timeout passed to go-mutesting. This MUST exceed the
# slowest in-scope package suite, or the measurement is meaningless: the tool
# runs `go test -timeout <this>` per mutant and maps a non-zero exit to
# "killed" (cmd/go-mutesting/main.go: `case 1: // Tests failed -> PASS`). A
# timeout panic exits non-zero, so any mutant that outlives the budget is
# scored as killed whether or not a test detected it. go-mutesting's own
# default is 10s, well under every scoped suite here (dp ~75s, techniques
# ~33s, human ~22s), which silently converted surviving mutants into kills.
# Keep this above the slowest suite on the slowest runner. CI must pass the
# same value; see .github/workflows/nightly-mutation.yml.
MUTATION_EXEC_TIMEOUT := 300

# Address-space cap (KB) applied to the whole go-mutesting invocation via
# `ulimit -v`. Some mutants convert a bounded loop into unbounded allocation:
# mutating the AIC BFS dequeue from `queue = queue[1:]` to `queue[0:]` reaches
# 5.5 GB in 50s and is then OS-killed, which on a hosted runner exhausts the
# machine and takes the runner agent down with it (exit 143 followed by "The
# runner has received a shutdown signal"). Under this cap the same mutant dies
# alone as a Go runtime out-of-memory at 1.3 GB in 6s, so `go test` exits
# non-zero and go-mutesting scores it killed through its normal exit-code path.
# This caps address space, not resident memory: the honest techniques suite
# peaks at 90 MB resident and a full `-a` rebuild of every package at 292 MB,
# so 3 GB leaves roughly tenfold headroom for legitimate work. GOMEMLIMIT is
# not a substitute; being a soft limit it raised the peak to 6.2 GB and doubled
# the runtime rather than stopping the growth. CI must use the same value; see
# .github/workflows/nightly-mutation.yml.
MUTATION_ADDRESS_SPACE_KB := 3000000

# Build the go-mutesting v2.3.1 binary from a pinned-tag local clone, working
# around the upstream go.mod major-version defect above, and apply the local
# compile-probe patch on the way.
#
# Three guards stand between a tag bump and a silently unpatched binary, because
# an unpatched one does not fail: it reports inflated scores that look like an
# improvement. `git apply` fails the build when the patch stops applying; the
# marker grep rejects a stale binary an earlier install left behind; and
# mutation-probe-check proves on a frozen fixture that the built binary actually
# skips a non-compiling mutant. The first two check that the patch is present,
# the third that it works.
mutation-install:
	@set -e; \
	if [ -x "$(GO_MUTESTESTING_BIN)" ] && grep -qa "$(GO_MUTESTESTING_PATCH_MARKER)" "$(GO_MUTESTESTING_BIN)"; then \
		echo "mutation-install: patched go-mutesting already installed at $(GO_MUTESTESTING_BIN)"; \
	else \
		if [ -e "$(GO_MUTESTESTING_BIN)" ]; then \
			echo "mutation-install: $(GO_MUTESTESTING_BIN) predates the compile-probe patch; rebuilding"; \
		fi; \
		tmp=$$(mktemp -d); \
		echo "mutation-install: cloning avito-tech/go-mutesting $(GO_MUTESTESTING_TAG) and building (upstream go install is broken; see Makefile note)"; \
		git clone --depth=1 --branch $(GO_MUTESTESTING_TAG) https://github.com/avito-tech/go-mutesting.git "$$tmp/go-mutesting"; \
		echo "mutation-install: applying $(GO_MUTESTESTING_PATCH)"; \
		git -C "$$tmp/go-mutesting" apply "$(CURDIR)/$(GO_MUTESTESTING_PATCH)" || { \
			echo "mutation-install: FAILED to apply $(GO_MUTESTESTING_PATCH) to $(GO_MUTESTESTING_TAG)."; \
			echo "  Refresh the patch against that tag. Do not build without it:"; \
			echo "  an unpatched go-mutesting scores every non-compiling mutant as a kill."; \
			rm -rf "$$tmp"; \
			exit 1; \
		}; \
		GOTOOLCHAIN=local go -C "$$tmp/go-mutesting" build -o "$(GO_MUTESTESTING_BIN)" ./cmd/go-mutesting; \
		rm -rf "$$tmp"; \
		grep -qa "$(GO_MUTESTESTING_PATCH_MARKER)" "$(GO_MUTESTESTING_BIN)" || { \
			echo "mutation-install: the patch applied but $(GO_MUTESTESTING_PATCH_MARKER) is absent from the built binary,"; \
			echo "  so the patched code is no longer reached. Removing the binary rather than trusting it."; \
			rm -f "$(GO_MUTESTESTING_BIN)"; \
			exit 1; \
		}; \
		echo "mutation-install: installed patched $(GO_MUTESTESTING_BIN)"; \
	fi
	@$(MAKE) --no-print-directory mutation-probe-check

# Regression check for the compile probe: a mutant that does not compile must be
# reported skipped, never killed.
#
# The assertion runs against a frozen fixture package rather than a real one.
# Asserting skippedCount > 0 on a real package is unsound, because a legitimate
# code change can drive that package's non-compiling mutant population to zero;
# the check would then fail on healthy code and be relaxed until it asserted
# nothing. The fixture's mutant population is fixed by construction, so both
# assertions below are decidable and stay decidable.
#
# killedCount is asserted alongside skippedCount because the skip assertion
# alone is satisfied by a probe that wrongly skips everything, which would read
# as a perfect score with an empty denominator.
#
# Checkout safety (INFRA-18): go-mutesting mutates the target file in place,
# so probing the checkout's fixture directly strands a live mutant there when
# the probe is interrupted, the hazard class INFRA-17 closed for the sweep.
# The probe therefore runs against a minimal copy (go.mod, go.sum, and the
# fixture package) in the scratch tmpdir; the checkout is never written, so
# no interruption, SIGKILL included, can dirty it, and an orphaned tmpdir is
# inert. The partial-copy fiction-score hazard documented in
# tools/mutation/README.md does not apply to this one fixture: it is hermetic
# (sole import is `testing`, no file reads), so environmental breakage of the
# copy can only fail compiles, which drives killedCount to 0 and fails the
# assert below loudly instead of inflating the score. Do not extend this
# copy pattern to packages that read files outside the copy.
# go-mutesting writes report.json to its working directory with no way to
# redirect it, which lands it inside the scratch tmpdir here.
define MUTATION_PROBE_ASSERT
import json, sys

stats = json.load(open(sys.argv[1]))["stats"]
killed, skipped = stats["killedCount"], stats["skippedCount"]
print(
    "mutation-probe-check: killed=%d escaped=%d skipped=%d total=%d"
    % (killed, stats["escapedCount"], skipped, stats["totalMutantsCount"])
)
if skipped < 1:
    sys.exit(
        "mutation-probe-check: FAILED, no mutant was skipped. The fixture contains a "
        "mutant that cannot compile, so a skip is mandatory. Zero skips means the "
        "compile probe is not in effect and every non-compiling mutant across every "
        "package is being counted as a kill."
    )
if killed < 1:
    sys.exit(
        "mutation-probe-check: FAILED, no mutant was killed. The fixture contains a "
        "mutant that compiles and fails its test, so a kill is mandatory. Zero kills "
        "means the probe is rejecting mutants that do compile."
    )
endef
export MUTATION_PROBE_ASSERT

mutation-probe-check:
	@set -e; \
	if [ ! -x "$(GO_MUTESTESTING_BIN)" ]; then \
		echo "mutation-probe-check: $(GO_MUTESTESTING_BIN) not found; run 'make mutation-install' first"; \
		exit 1; \
	fi; \
	work=$$(mktemp -d); \
	trap 'rm -rf "$$work"' EXIT; \
	trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM; \
	probe="$$work/probe"; \
	mkdir -p "$$probe/$(MUTATION_PROBE_FIXTURE)"; \
	cp go.mod go.sum "$$probe/"; \
	cp $(MUTATION_PROBE_FIXTURE)/*.go "$$probe/$(MUTATION_PROBE_FIXTURE)/"; \
	printf 'skip_without_test: true\nskip_with_build_tags: true\njson_output: true\nsilent_mode: true\n' > "$$work/config.yml"; \
	ulimit -v $(MUTATION_ADDRESS_SPACE_KB); \
	if ! ( cd "$$probe" && "$(GO_MUTESTESTING_BIN)" --exec-timeout $(MUTATION_EXEC_TIMEOUT) \
		--config="$$work/config.yml" $(MUTATION_PROBE_FIXTURE) > "$$work/run.log" 2>&1 ); then \
		echo "mutation-probe-check: go-mutesting failed on $(MUTATION_PROBE_FIXTURE):"; \
		cat "$$work/run.log"; \
		exit 1; \
	fi; \
	python3 -c "$$MUTATION_PROBE_ASSERT" "$$probe/report.json"

# Run go-mutesting on each in-scope Go package (Decision 9: explicit
# enumeration; human/techniquetest is excluded as pure test-fixture data). The
# enumeration itself lives in PACKAGE_PKGS in scripts/mutation_floors.py, which
# the gate also reads, so a package cannot be swept without being gated or
# gated without being swept.
# Emits reports/mutation/<pkg-slug>/{report.json,go-mutesting-report.html}.
# go-mutesting v2.3.1 has NO --output flag; JSON+HTML are config keys
# (json_output / html_output), so a config.yml is generated per package.
# The tool writes report.json/go-mutesting-report.html to CWD and mirrors the
# target path inside its tmp sandbox, so targets must be clean ./pkg paths
# (relative ../ escapes panic) and outputs are relocated per package.
#
# Local-tree safety (INFRA-17): the built-in runner mutates source files in
# place and restores them between mutants, so an interrupted run strands a
# live mutant in the checkout, and even a healthy run leaves an hours-long
# window in which `git add -A` commits one (observed 2026-08-22 in
# swordfish.go). This target therefore never mutates the developer's
# checkout: the outer invocation re-runs itself inside a throwaway detached
# `git worktree` of HEAD (the full repo, so the curated-fixture loaders still
# find ../frontend/puzzles.json; a partial copy of api/ is the fiction-score
# hazard documented in tools/mutation/README.md), copies reports/mutation/
# back on exit, and tears the worktree down in an EXIT trap. Safety does not
# depend on the trap firing: the checkout is simply never written, so even
# `kill -9` cannot dirty it; a worktree orphaned by a hard kill is
# garbage-collected by the `git worktree prune` at the start of the next run.
# The run refuses to start while api/ or frontend/puzzles.json (the fixture
# input the suite reads) has uncommitted or untracked changes, because a
# worktree of HEAD would silently measure different code than what is in the
# editor. An EXIT-trap file restore was rejected instead of this
# because it does not survive SIGKILL or the OOM kills the ulimit
# deliberately provokes, and it leaves the mid-run `git add -A` hazard
# untouched.
# CI was never at risk and is unaffected by construction: each nightly job
# starts from a fresh checkout and invokes go-mutesting directly with
# ci-exec.sh, not through this target. Do not add isolation there too.
#
# mutation-install is a prerequisite of the INNER invocation only. Its final
# mutation-probe-check step self-isolates (it probes a tmpdir copy of the
# fixture; see that target), so the placement is no longer load-bearing for
# checkout safety; it stays on the inner invocation so the probe verifies the
# exact fixture files the sweep is about to measure.
# Interruption note, measured: go-mutesting v2.3.1 swallows SIGINT, so a
# Ctrl-C alone does not stop a run; termination actually arrives as a
# follow-up SIGTERM/SIGHUP/SIGKILL. The HUP/INT/TERM traps below cover the
# catchable ones so teardown still runs, and SIGKILL merely orphans the
# /tmp worktree for the next run's prune; the checkout stays clean on every
# path because it is never written.
ifdef MUTATION_GO_IN_WORKTREE
mutation-go: mutation-install
	@set -e; \
	ulimit -v $(MUTATION_ADDRESS_SPACE_KB); \
	for pkg in $$($(MUTATION_FLOORS) packages --pkg-paths); do \
		slug=$$(echo "$$pkg" | sed 's|^\./||; s|/|-|g'); \
		outdir="$(MUTATION_REPORT_DIR)/$$slug"; \
		mkdir -p "$$outdir"; \
		printf 'skip_without_test: true\nskip_with_build_tags: true\njson_output: true\nhtml_output: true\nsilent_mode: false\n' > "$$outdir/config.yml"; \
		echo "mutation-go: running go-mutesting on $$pkg -> $$outdir/"; \
		"$(GO_MUTESTESTING_BIN)" --exec-timeout $(MUTATION_EXEC_TIMEOUT) --config="$$outdir/config.yml" "$$pkg"; \
		mv -f report.json go-mutesting-report.html "$$outdir/" 2>/dev/null; \
	done; \
	echo "mutation-go: all in-scope packages done. Reports under $(MUTATION_REPORT_DIR)/."
else
mutation-go:
	@set -e; \
	git worktree prune; \
	if [ -n "$$(git status --porcelain -- . ../frontend/puzzles.json)" ]; then \
		echo "mutation-go: REFUSING to run: api/ or frontend/puzzles.json has uncommitted or untracked changes:"; \
		git status --porcelain -- . ../frontend/puzzles.json; \
		echo "mutation-go: the sweep runs in a worktree of HEAD, so it would measure"; \
		echo "mutation-go: different code than your editor holds. Commit or stash first."; \
		exit 1; \
	fi; \
	scratch=$$(mktemp -d); \
	wt="$$scratch/repo"; \
	trap 'if [ -d "$$wt/api/$(MUTATION_REPORT_DIR)" ]; then mkdir -p "$(MUTATION_REPORT_DIR)"; cp -R "$$wt/api/$(MUTATION_REPORT_DIR)/." "$(MUTATION_REPORT_DIR)/"; fi; git worktree remove --force "$$wt" >/dev/null 2>&1 || true; rm -rf "$$scratch"; git worktree prune' EXIT; \
	trap 'exit 129' HUP; trap 'exit 130' INT; trap 'exit 143' TERM; \
	echo "mutation-go: isolating the run in a temporary git worktree (the checkout is never mutated)"; \
	git worktree add --detach "$$wt" HEAD; \
	$(MAKE) -C "$$wt/api" mutation-go MUTATION_GO_IN_WORKTREE=1
endif

# Enforce per-package mutation efficacy floors by parsing each package's
# report.json. Efficacy = (killed + timeout) / (killed + timeout + escaped)
# as a percentage, where:
#   killed  = killedCount   (tests failed on the mutant)
#   timeout = timeOutCount  (mutant hung the suite; counted as caught)
#   escaped = escapedCount  (covered but tests did NOT catch it: the gap)
# notCovered/error/skipped are excluded from the denominator: notCovered is a
# coverage gap (Decision 8 separates coverage from mutation scope), error is a
# tooling/build failure, and skipped covers `// mutator-disable-next-line`
# equivalent-mutant annotations. Run `make mutation-go` first; this target
# does not run the slow sweep itself.
#
# The comparison lives in scripts/mutation_floors.py, which the nightly workflow
# also calls, so the local gate and CI cannot disagree about either the floors
# or the arithmetic. MUT-6-1 moved it there from three separate copies of the
# formula (this recipe's awk, the workflow's inline python, and the aggregate
# script). report.json field names are verified against v2.3.1 output (note the
# spelling `timeOutCount` / `timeouted`).
mutation-gate:
	@$(MUTATION_FLOORS) gate-package --package-dir $(MUTATION_REPORT_DIR) \
	&& echo "mutation-gate: all in-scope packages met their floors."

# Raise the floors in mutation-floors.json to the efficacy a completed run
# actually measured, per the procedure in that file's _ratchet block. Writes in
# place; review the diff before committing. Set SHARDS_DIR to a directory of
# downloaded techniques shard artifacts to ratchet those too, and RUN to the
# workflow run id so the provenance records where the number came from.
mutation-ratchet:
	@$(MUTATION_FLOORS) propose --in-place \
		--package-dir $(MUTATION_REPORT_DIR) \
		$(if $(SHARDS_DIR),--shards-dir $(SHARDS_DIR)) \
		$(if $(RUN),--run $(RUN)) --recorded $$(date +%F) \
		--note "Measured under --exec-timeout $(MUTATION_EXEC_TIMEOUT), ulimit -v $(MUTATION_ADDRESS_SPACE_KB)."

# Remove mutation report artifacts (report.json, HTML, per-pkg config).
mutation-clean:
	rm -rf $(MUTATION_REPORT_DIR)

# govulncheck version; keep in sync with the test-go job in
# .github/workflows/deploy.yml.
GOVULNCHECK_VERSION := v1.5.0
GOVULNCHECK_BIN := $(shell go env GOPATH)/bin/govulncheck

# Vulnerability gate. Runs govulncheck against the module and fails on
# confirmed vulnerabilities reachable from the call graph. Auto-installs
# govulncheck to GOPATH/bin if missing (CI installs it fresh each run).
# CI invokes this from the test-go job; run locally with `make vulncheck`.
vulncheck:
	@set -e; \
	if [ ! -x "$(GOVULNCHECK_BIN)" ]; then \
		echo "vulncheck: installing govulncheck $(GOVULNCHECK_VERSION) to $(GOVULNCHECK_BIN)"; \
		go install golang.org/x/vuln/cmd/govulncheck@$(GOVULNCHECK_VERSION); \
	fi; \
	out=$$($(GOVULNCHECK_BIN) ./... 2>&1) || { \
		echo "vulncheck: FAIL govulncheck reported findings or errored" >&2; \
		echo "$$out" >&2; \
		exit 1; \
	}; \
	echo "vulncheck: OK no confirmed vulnerabilities."

# Memory profiling tests
test-memory:
	$(GO) test -memprofile=mem.out -run=. ./internal/sudoku/...
	@echo "Memory profile generated: mem.out"
	@echo "View with: go tool pprof mem.out"

# CPU profiling tests  
test-cpu:
	$(GO) test -cpuprofile=cpu.out -run=. ./internal/sudoku/...
	@echo "CPU profile generated: cpu.out"
	@echo "View with: go tool pprof cpu.out"

# Run benchmarks
bench:
	$(GO) test -bench=. -benchmem ./internal/sudoku/...

# Clean build artifacts
clean:
	rm -f bin/server
	rm -f $(WASM_OUT)
	rm -f $(WASM_EXEC_OUT)

# Development: build and run server
run: server
	./bin/server

# Check WASM size
wasm-size:
	@ls -lh $(WASM_OUT) 2>/dev/null || echo "WASM not built yet. Run 'make wasm' first."
