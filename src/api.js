const express = require("express");

class ApiServer {

    constructor(options = {}) {

        if (!options.stateEngine) {
            throw new Error(
                "ApiServer requires StateEngine"
            );
        }

        this.stateEngine = options.stateEngine;
        this.historyRepository =
            options.historyRepository || null;

        this.host = options.host || "0.0.0.0";
        this.port = options.port || 3000;

        this.app = express();
        this.server = null;
        this.startedAt = new Date();

        this.configureMiddleware();
        this.configureRoutes();
        this.configureErrorHandler();
    }

    configureMiddleware() {

        this.app.use(express.json());

        this.app.use((request, response, next) => {

            response.setHeader(
                "Access-Control-Allow-Origin",
                "*"
            );

            response.setHeader(
                "Access-Control-Allow-Methods",
                "GET, OPTIONS"
            );

            response.setHeader(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization"
            );

            if (request.method === "OPTIONS") {
                response.sendStatus(204);
                return;
            }

            next();
        });
    }

    requireHistoryRepository(
        request,
        response,
        next
    ) {

        if (!this.historyRepository) {

            response.status(503).json({
                success: false,
                error: "HISTORY_NOT_AVAILABLE"
            });

            return;
        }

        next();
    }

    configureRoutes() {

        this.app.get("/", (request, response) => {

            response.json({
                service: "STM Core API",
                version: "0.6.0",
                status: "running"
            });
        });

        this.app.get(
            "/api/v1/community/health",
            (request, response) => {

                response.json({
                    success: true,
                    service: "STM Core API",
                    version: "0.6.0",
                    uptimeSeconds: Math.floor(
                        process.uptime()
                    ),
                    startedAt:
                        this.startedAt.toISOString(),
                    timestamp:
                        new Date().toISOString()
                });
            }
        );

        this.app.get(
            "/api/v1/community/servers",
            (request, response) => {

                const servers =
                    this.stateEngine.getAll();

                response.json({
                    success: true,
                    count: servers.length,
                    timestamp:
                        new Date().toISOString(),
                    servers
                });
            }
        );

        this.app.get(
            "/api/v1/community/events",
            this.requireHistoryRepository.bind(this),
            async (request, response, next) => {

                try {

                    const events =
                        await this.historyRepository
                            .getEvents({
                                serverId:
                                    request.query.serverId,
                                type:
                                    request.query.type,
                                player:
                                    request.query.player,
                                before:
                                    request.query.before,
                                limit:
                                    request.query.limit
                            });

                    response.json({
                        success: true,
                        count: events.length,
                        timestamp:
                            new Date().toISOString(),
                        events
                    });

                } catch (error) {
                    next(error);
                }
            }
        );

        this.app.get(
            "/api/v1/community/servers/:serverId/history",
            this.requireHistoryRepository.bind(this),
            async (request, response, next) => {

                try {

                    const snapshots =
                        await this.historyRepository
                            .getServerSnapshots({
                                serverId:
                                    request.params.serverId,
                                before:
                                    request.query.before,
                                limit:
                                    request.query.limit
                            });

                    response.json({
                        success: true,
                        serverId:
                            request.params.serverId,
                        count: snapshots.length,
                        timestamp:
                            new Date().toISOString(),
                        snapshots
                    });

                } catch (error) {
                    next(error);
                }
            }
        );

        this.app.get(
            "/api/v1/community/players/:playerName/history",
            this.requireHistoryRepository.bind(this),
            async (request, response, next) => {

                try {

                    const history =
                        await this.historyRepository
                            .getPlayerHistory(
                                request.params.playerName,
                                {
                                    serverId:
                                        request.query.serverId,
                                    before:
                                        request.query.before,
                                    limit:
                                        request.query.limit
                                }
                            );

                    response.json({
                        success: true,
                        playerName:
                            request.params.playerName,
                        count: history.length,
                        timestamp:
                            new Date().toISOString(),
                        history
                    });

                } catch (error) {
                    next(error);
                }
            }
        );

        this.app.get(
            "/api/v1/community/servers/:serverId",
            (request, response) => {

                const server =
                    this.stateEngine.get(
                        request.params.serverId
                    );

                if (!server) {

                    response.status(404).json({
                        success: false,
                        error: "SERVER_NOT_FOUND",
                        message:
                            `Server ${request.params.serverId} ` +
                            "has no recorded state"
                    });

                    return;
                }

                response.json({
                    success: true,
                    timestamp:
                        new Date().toISOString(),
                    server
                });
            }
        );

        this.app.get(
            "/api/v1/admin/health",
            (request, response) => {

                response.json({
                    success: true,
                    mode: "admin",
                    authentication:
                        "not-configured",
                    message:
                        "Admin API placeholder. " +
                        "Authentication will be added later.",
                    timestamp:
                        new Date().toISOString()
                });
            }
        );

        this.app.use((request, response) => {

            response.status(404).json({
                success: false,
                error: "ENDPOINT_NOT_FOUND",
                path: request.originalUrl
            });
        });
    }

    configureErrorHandler() {

        this.app.use(
            (error, request, response, next) => {

                console.error(
                    `[API ERROR] ` +
                    `${error.stack || error.message}`
                );

                if (response.headersSent) {
                    next(error);
                    return;
                }

                response.status(500).json({
                    success: false,
                    error: "INTERNAL_SERVER_ERROR"
                });
            }
        );
    }

    start() {

        if (this.server) {
            return Promise.resolve({
                host: this.host,
                port: this.port
            });
        }

        return new Promise((resolve, reject) => {

            const server = this.app.listen(
                this.port,
                this.host,
                () => {

                    this.server = server;

                    resolve({
                        host: this.host,
                        port: this.port
                    });
                }
            );

            server.once("error", reject);
        });
    }

    stop() {

        if (!this.server) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {

            this.server.close(error => {

                if (error) {
                    reject(error);
                    return;
                }

                this.server = null;
                resolve();
            });
        });
    }

}

module.exports = ApiServer;
