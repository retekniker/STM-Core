class Scheduler {

    constructor(intervalMs, task) {
        this.intervalMs = intervalMs;
        this.task = task;
        this.running = false;
        this.timer = null;
    }

    async start() {

        if (this.running) {
            return;
        }

        this.running = true;

        await this.runCycle();
    }

    async runCycle() {

        if (!this.running) {
            return;
        }

        const startedAt = Date.now();

        try {

            await this.task();

        } catch (error) {

            console.error(
                `[SCHEDULER ERROR] ${error.message}`
            );

        }

        if (!this.running) {
            return;
        }

        const elapsed = Date.now() - startedAt;

        const delay = Math.max(
            0,
            this.intervalMs - elapsed
        );

        this.timer = setTimeout(
            () => this.runCycle(),
            delay
        );
    }

    stop() {

        this.running = false;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

}

module.exports = Scheduler;
