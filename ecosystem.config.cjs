module.exports = {
  apps: [
    {
      name: 'oceanlinux',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'oceanlinux-orders',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5655',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5655,
      },
    },
  ],
};
