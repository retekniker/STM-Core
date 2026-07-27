class Scheduler {

    constructor(intervalMs, task) {

        if (
            !Number.isInteger(intervalMs) ||
            intervalMs < 1
        ) {
            throw new Error(
                "Scheduler interval must be a positive integer"
            );
        }

        if (typeof task !== "function") {
            throw new Error(
                "Scheduler task must be a function"
            );
        }

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

        this.timer = setTimeout(
            () => {
                void this.runCycle();
            },
            this.intervalMs
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
