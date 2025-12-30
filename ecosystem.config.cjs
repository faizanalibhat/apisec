module.exports = {
    apps: [
        {
            name: "apisec",
            script: "src/app.js",
            instances: 1,
            exec_mode: "cluster",
            node_args: "--import ./instrumentation.js",
            autorestart: true,
            max_memory_restart: "2G",
            watch: false,
            env: {
                NODE_ENV: "production"
            }
        },
        {
            name: "workers",
            script: "src/workers/main.js",
            node_args: "--import ./instrumentation.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "4G",
            watch: false,
            env: {
                NODE_ENV: "production"
            }
        },
    ]
}
