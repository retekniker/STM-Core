const express = require("express");

class ApiServer {

    constructor(options = {}) {

        if (!options.stateEngine) {
            throw new Error("ApiServer requires StateEngine");
        }

        this.stateEngine = options.stateEngine;
        this.database = options.database || null;

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

    configureRoutes() {

        this.app.get("/", (request, response) => {

            response.json({
                service: "STM Core API",
                version: "0.4.0",
                status: "running"
            });
        });

        this.app.get(
            "/api/v1/community/health",
            (request, response) => {

                response.json({
                    success: true,
                    service: "STM Core API",
                    version: "0.4.0",
                    uptimeSeconds: Math.floor(
                        process.uptime()
                    ),
                    startedAt: this.startedAt.toISOString(),
                    timestamp: new Date().toISOString()
                });
            }
        );

        this.app.get(
            "/api/v1/community/servers",
            (request, response) => {

                const servers = this.stateEngine.getAll();

                response.json({
                    success: true,
                    count: servers.length,
                    timestamp: new Date().toISOString(),
                    servers
                });
            }
        );

        this.app.get(
            "/api/v1/community/servers/:serverId",
            (request, response) => {

                const serverId =
                    request.params.serverId;

                const server =
                    this.stateEngine.get(serverId);

                if (!server) {

                    response.status(404).json({
                        success: false,
                        error: "SERVER_NOT_FOUND",
                        message:
                            `Server ${serverId} has no recorded state`
                    });

                    return;
                }

                response.json({
                    success: true,
                    timestamp: new Date().toISOString(),
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
                    authentication: "not-configured",
                    message:
                        "Admin API placeholder. Authentication will be added later.",
                    timestamp: new Date().toISOString()
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
                    `[API ERROR] ${error.stack || error.message}`
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
            return Promise.resolve();
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
