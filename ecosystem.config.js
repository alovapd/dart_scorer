module.exports = {
  apps: [{
    name: 'dart-scorer',
    script: 'server.js',
    cwd: 'C:/Apps/OzProjects/projects/dart_scorer',
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3007
    }
  }]
};
