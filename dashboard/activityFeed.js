(function (root, factory) {
    const exported = factory();
    if (typeof module === "object" && module.exports) module.exports = exported;
    if (root) root.ActivityFeedController = exported.ActivityFeedController;
})(typeof window !== "undefined" ? window : globalThis, function () {
    class ActivityFeedController {
        constructor(options = {}) {
            this.fetch = options.fetch || globalThis.fetch?.bind(globalThis);
            this.WebSocket = options.WebSocket || globalThis.WebSocket;
            this.storage = options.storage || (() => {
                if (typeof window === "undefined") return null;
                try { return window.localStorage || null; } catch (_) { return null; }
            })();
            this.renderRestartEntry = options.renderRestartEntry || (() => "");
            this.formatRestartExport = options.formatRestartExport || (event => JSON.stringify(event, null, 2));
            this.entries = [];
            this.restartEvents = [];
            this.mode = "activity";
            this.clearedAt = null;
            this.restartClearedAt = this.readRestartClearedAt();
            this.removedRestartIds = this.readRemovedRestartIds();
            this.clearScope = "activity";
            this.clearInFlight = false;
            this.initialized = false;
            this.expanded = false;
            this.socket = null;
            this.nextId = 1;
        }

        byId(id) { return document.getElementById(id); }

        readRestartClearedAt() {
            try { return this.storage?.getItem("stm_restart_log_cleared_at") || null; }
            catch (_) { return null; }
        }

        readRemovedRestartIds() {
            try {
                const value = JSON.parse(this.storage?.getItem("stm_restart_log_removed_ids") || "[]");
                return new Set(Array.isArray(value) ? value : []);
            } catch (_) { return new Set(); }
        }

        restartEventId(event) {
            return String(event.id || `${event.serverId || "UNKNOWN"}:${event.timestamp || event.data?.restartAt || "UNKNOWN"}`);
        }

        restartEventTime(event) {
            return Date.parse(event.timestamp || event.data?.restartAt);
        }

        isRestartVisible(event) {
            if (this.removedRestartIds.has(this.restartEventId(event))) return false;
            if (!this.restartClearedAt) return true;
            const timestamp = this.restartEventTime(event);
            return Number.isFinite(timestamp) && timestamp > Date.parse(this.restartClearedAt);
        }

        isScrollbarInteraction(event) {
            const scrollable = event.target.closest?.(".custom-scrollbar");
            if (!scrollable) return false;
            const scrollbarWidth = scrollable.offsetWidth - scrollable.clientWidth;
            if (scrollbarWidth <= 0) return false;
            const rect = scrollable.getBoundingClientRect();
            return event.clientX >= rect.right - scrollbarWidth;
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;
            this.byId("activityFeedPanel")?.addEventListener("click", event => {
                if (event.target.closest("button") || this.isScrollbarInteraction(event)) return;
                this.setActivityFeedExpanded(true);
            });
            this.byId("activityFeedZoom")?.addEventListener("click", event => {
                event.stopPropagation();
                this.setActivityFeedExpanded(true);
            });
            this.byId("activityFeedInspectorZoom")?.addEventListener("click", event => {
                event.stopPropagation();
                this.setActivityFeedExpanded(true);
            });
            this.byId("activityFeedInspectorClose")?.addEventListener("click", event => {
                event.stopPropagation(); this.setActivityFeedExpanded(false);
            });
            document.querySelectorAll("[data-activity-restart-toggle]").forEach(button =>
                button.addEventListener("click", event => {
                    event.stopPropagation(); this.toggleMode();
                })
            );
            document.querySelectorAll("[data-activity-clear]").forEach(button =>
                button.addEventListener("click", event => {
                    event.stopPropagation(); this.openConfirmation("activity");
                })
            );
            document.querySelectorAll("[data-log-clear-all]").forEach(button =>
                button.addEventListener("click", event => {
                    event.stopPropagation();
                    this.openConfirmation(this.mode === "restart" ? "all" : "activity");
                })
            );
            document.querySelectorAll("[data-restart-clear]").forEach(button =>
                button.addEventListener("click", event => {
                    event.stopPropagation(); this.openConfirmation("restart");
                })
            );
            document.querySelectorAll("[data-activity-export]").forEach(button =>
                button.addEventListener("click", event => { event.stopPropagation(); this.exportActivity(); })
            );
            document.querySelectorAll("[data-restart-export-all]").forEach(button =>
                button.addEventListener("click", event => { event.stopPropagation(); this.exportAllRestarts(); })
            );
            this.byId("activityClearCancel")?.addEventListener("click", () => this.closeConfirmation());
            this.byId("activityClearConfirm")?.addEventListener("click", () => this.confirmClear());
            this.byId("activityFeedInspector")?.addEventListener("pointerdown", event => {
                this.backdropPointerDown = event.target === event.currentTarget;
            });
            this.byId("activityFeedInspector")?.addEventListener("click", event => {
                if (this.backdropPointerDown && event.target === event.currentTarget) this.setActivityFeedExpanded(false);
                this.backdropPointerDown = false;
            });
            document.addEventListener("keydown", event => {
                if (event.key !== "Escape") return;
                if (this.isConfirmationOpen()) this.closeConfirmation();
                else if (this.isOpen()) this.setActivityFeedExpanded(false);
            });
            this.loadState();
            this.connectWebSocket();
            this.render();
        }

        add(entry) {
            const timestamp = entry.timestamp || new Date().toISOString();
            if (this.clearedAt && Date.parse(timestamp) <= Date.parse(this.clearedAt)) return null;
            const stored = { ...entry, id: entry.id || `activity-${this.nextId++}`, timestamp };
            this.entries.unshift(stored);
            if (this.entries.length > 80) this.entries.length = 80;
            this.renderActivity();
            return stored.id;
        }

        remove(id) {
            this.entries = this.entries.filter(entry => entry.id !== id);
            this.renderActivity();
        }

        removeByAlertId(alertId) {
            this.entries = this.entries.filter(entry => entry.alertId !== alertId);
            this.renderActivity();
        }

        createEntryNode(entry) {
            const row = document.createElement("div");
            row.className = entry.className || "flex justify-between items-center pl-2 bg-black/40 py-1 border-l border-white/10 mb-0.5";
            if (entry.alertId) row.dataset.alertId = entry.alertId;
            const content = document.createElement("div");
            content.className = entry.contentClass || "flex items-center gap-2 flex-wrap flex-1";
            for (const segment of entry.segments || []) {
                const span = document.createElement("span");
                span.className = segment.className || "";
                span.textContent = String(segment.text ?? "");
                if (segment.color) {
                    span.style.color = segment.color;
                    span.style.textShadow = `0 0 5px ${segment.color}`;
                }
                content.appendChild(span);
            }
            row.appendChild(content);
            if (entry.dismissible !== false) {
                const close = document.createElement("button");
                close.type = "button";
                close.className = "activity-entry-close text-gray-400 hover:text-red-500 px-2 text-sm font-bold";
                close.textContent = "X";
                close.setAttribute("aria-label", "Dismiss activity entry");
                close.addEventListener("click", event => {
                    event.stopPropagation(); this.remove(entry.id);
                });
                row.appendChild(close);
            }
            return row;
        }

        renderActivity() {
            for (const id of ["alertBox", "activityFeedInspectorBox"]) {
                const box = this.byId(id);
                if (!box) continue;
                box.replaceChildren(...this.entries.map(entry => this.createEntryNode(entry)));
                box.scrollTop = 0;
            }
        }

        renderRestart() {
            for (const id of ["restartLogBox", "activityFeedInspectorRestartBox"]) {
                const box = this.byId(id);
                if (!box) continue;
                box.replaceChildren();
                if (!this.restartEvents.length) {
                    const empty = document.createElement("div");
                    empty.className = "text-gray-500 font-bold py-2";
                    empty.textContent = "NO RESTART EVENTS RECORDED";
                    box.appendChild(empty);
                    continue;
                }
                for (const event of this.restartEvents) {
                    const row = document.createElement("div");
                    row.className = "border-l-2 border-red-500 bg-red-950/30 px-3 py-2 mb-1";
                    row.innerHTML = this.renderRestartEntry(event, event.data || {});
                    const actions = document.createElement("div");
                    actions.className = "flex gap-2 justify-end mt-2";
                    const exportButton = document.createElement("button");
                    exportButton.className = "btn-system-led";
                    exportButton.textContent = "EXPORT TXT";
                    exportButton.addEventListener("click", () => this.exportRestart(event));
                    const removeButton = document.createElement("button");
                    removeButton.className = "btn-system-led-red";
                    removeButton.textContent = "REMOVE";
                    removeButton.addEventListener("click", () => this.removeRestart(event));
                    actions.append(exportButton, removeButton);
                    row.appendChild(actions);
                    box.appendChild(row);
                }
                box.scrollTop = 0;
            }
        }

        render() {
            const restart = this.mode === "restart";
            for (const id of ["alertBox", "activityFeedInspectorBox"]) this.byId(id)?.classList.toggle("hidden", restart);
            for (const id of ["restartLogBox", "activityFeedInspectorRestartBox"]) {
                const box = this.byId(id);
                if (!box) continue;
                box.classList.toggle("hidden", !restart);
                box.style.display = restart ? "flex" : "none";
            }
            document.querySelectorAll("[data-activity-restart-toggle]").forEach(button => {
                button.textContent = restart ? "Activity Feed" : "Restart Log";
            });
            const title = this.byId("activityFeedInspectorTitle");
            if (title) title.textContent = restart ? "RESTART LOG" : "ACTIVITY FEED";
            document.querySelectorAll("[data-restart-clear]").forEach(button => {
                button.classList.toggle("hidden", !restart);
            });
            document.querySelectorAll("[data-activity-export]").forEach(button => button.classList.toggle("hidden", restart));
            document.querySelectorAll("[data-restart-export-all]").forEach(button => button.classList.toggle("hidden", !restart));
            this.renderActivity();
            if (restart) this.loadRestartLog();
        }

        toggleMode() {
            this.mode = this.mode === "activity" ? "restart" : "activity";
            this.render();
        }

        downloadText(filename, text) {
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 0);
        }

        activityExportText() {
            const lines = this.entries.map(entry => {
                const content = (entry.segments || []).map(segment => String(segment.text ?? "")).join(" ").trim();
                return `[${entry.timestamp || "UNKNOWN"}] ${content}`;
            });
            return `STM CORE ACTIVITY FEED\nEXPORTED: ${new Date().toISOString()}\nENTRIES: ${lines.length}\n\n${lines.join("\n")}`;
        }

        exportActivity() { this.downloadText(`stm-activity-feed-${Date.now()}.txt`, this.activityExportText()); }
        exportRestart(event) { this.downloadText(`stm-restart-${this.restartEventId(event).replace(/[^a-z0-9_-]+/gi, "-")}.txt`, this.formatRestartExport(event)); }
        exportAllRestarts() {
            const body = this.restartEvents.map((event, index) => `=== RESTART ${index + 1} ===\n${this.formatRestartExport(event)}`).join("\n\n");
            this.downloadText(`stm-restart-log-${Date.now()}.txt`, `STM CORE RESTART LOG\nEXPORTED: ${new Date().toISOString()}\nENTRIES: ${this.restartEvents.length}\n\n${body}`);
        }
        removeRestart(event) {
            this.removedRestartIds.add(this.restartEventId(event));
            try { this.storage?.setItem("stm_restart_log_removed_ids", JSON.stringify([...this.removedRestartIds])); } catch (_) {}
            this.restartEvents = this.restartEvents.filter(item => this.restartEventId(item) !== this.restartEventId(event));
            this.renderRestart();
        }

        async loadRestartLog() {
            try {
                const response = await this.fetch("/api/v1/community/restarts?limit=100", { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                this.restartEvents = (Array.isArray(payload.events) ? payload.events : [])
                    .filter(event => this.isRestartVisible(event));
                this.renderRestart();
            } catch (error) {
                for (const id of ["restartLogBox", "activityFeedInspectorRestartBox"]) {
                    const box = this.byId(id);
                    if (!box) continue;
                    box.textContent = `RESTART LOG ERROR: ${error.message}`;
                    box.className += " text-red-500 font-bold";
                }
            }
        }

        setActivityFeedExpanded(expanded) {
            const next = Boolean(expanded);
            const changed = this.expanded !== next;
            this.expanded = next;
            const overlay = this.byId("activityFeedInspector");
            overlay?.classList.toggle("open", next);
            overlay?.setAttribute("aria-hidden", String(!next));
            this.byId("activityFeedPanel")?.setAttribute("aria-expanded", String(next));
            this.byId("activityFeedZoom")?.setAttribute("aria-expanded", String(next));
            this.byId("activityFeedInspectorZoom")?.setAttribute("aria-pressed", String(next));
            document.body.classList.toggle("activity-feed-modal-open", next);
            if (next) {
                this.render();
                if (changed) this.byId("activityFeedInspectorClose")?.focus();
            } else if (changed) {
                this.byId("activityFeedZoom")?.focus();
            }
            return this.expanded;
        }

        open() { return this.setActivityFeedExpanded(true); }
        close() { return this.setActivityFeedExpanded(false); }
        isOpen() { return this.expanded; }
        openConfirmation(scope = "activity") {
            this.clearScope = scope;
            const copy = {
                activity: ["CLEAR ACTIVITY FEED?", "This will clear only Activity Feed on connected dashboards. Restart Log will remain unchanged."],
                restart: ["CLEAR RESTART LOG?", "This will clear only Restart Log on this device. Activity Feed will remain unchanged."],
                all: ["CLEAR ALL LOGS?", "This will clear Activity Feed on connected dashboards and Restart Log on this device."]
            }[scope];
            const title = this.byId("activityClearTitle");
            const description = this.byId("activityClearDescription");
            const error = this.byId("activityClearError");
            if (title) title.textContent = copy[0];
            if (description) description.textContent = copy[1];
            if (error) error.textContent = "";
            this.byId("activityClearConfirmation")?.classList.add("open");
        }
        closeConfirmation() { if (!this.clearInFlight) this.byId("activityClearConfirmation")?.classList.remove("open"); }
        isConfirmationOpen() { return this.byId("activityClearConfirmation")?.classList.contains("open"); }

        applyClear(clearedAt) {
            if (this.clearedAt && Date.parse(clearedAt) <= Date.parse(this.clearedAt)) return;
            this.clearedAt = clearedAt;
            this.entries = this.entries.filter(entry =>
                Date.parse(entry.timestamp) > Date.parse(clearedAt)
            );
            this.renderActivity();
        }

        applyRestartClear(clearedAt) {
            this.restartClearedAt = clearedAt;
            try { this.storage?.setItem("stm_restart_log_cleared_at", clearedAt); } catch (_) {}
            this.restartEvents = this.restartEvents.filter(event => this.isRestartVisible(event));
            this.renderRestart();
        }

        async confirmClear() {
            if (this.clearInFlight) return;
            this.clearInFlight = true;
            const button = this.byId("activityClearConfirm");
            const errorBox = this.byId("activityClearError");
            if (button) button.disabled = true;
            if (errorBox) errorBox.textContent = "";
            try {
                if (this.clearScope === "restart") {
                    this.applyRestartClear(new Date().toISOString());
                    this.byId("activityClearConfirmation")?.classList.remove("open");
                    return;
                }
                const response = await this.fetch("/api/v1/community/activity-feed/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (!payload.success || !payload.clearedAt) throw new Error("INVALID SERVER RESPONSE");
                this.applyClear(payload.clearedAt);
                if (this.clearScope === "all") this.applyRestartClear(payload.clearedAt);
                this.byId("activityClearConfirmation")?.classList.remove("open");
            } catch (error) {
                if (errorBox) errorBox.textContent = `CLEAR FAILED: ${error.message}`;
            } finally {
                this.clearInFlight = false;
                if (button) button.disabled = false;
            }
        }

        async loadState() {
            try {
                const response = await this.fetch("/api/v1/community/activity-feed/state", { cache: "no-store" });
                if (!response.ok) return;
                const payload = await response.json();
                if (payload.clearedAt) this.applyClear(payload.clearedAt);
            } catch (_) {}
        }

        connectWebSocket() {
            if (!this.WebSocket || typeof location === "undefined") return;
            const protocol = location.protocol === "https:" ? "wss:" : "ws:";
            this.socket = new this.WebSocket(`${protocol}//${location.host}/ws`);
            this.socket.addEventListener("message", event => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === "ACTIVITY_FEED_CLEARED" && message.clearedAt) this.applyClear(message.clearedAt);
                } catch (_) {}
            });
        }
    }

    return { ActivityFeedController };
});
