module.exports = {
    apps: [{
        name: "scan-worker",
        script: "src/workers/scan.worker.js",
        instances: 1,
        exec_mode: "cluster",
        autorestart: true,
        max_memory_restart: "2G",
        watch: false,
        env: {
            NODE_ENV: "production"
        }
    }]
}
