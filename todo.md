# Kamal 2.0 Deployment — TODO Checklist (Minimal with Essential Hooks)

## Core Kamal Setup

- [x] Create hooks directory — `.kamal/hooks/`

- [x] Update Kamal deploy configuration — `config/deploy.yml`

- [x] Create secrets template — `.kamal/secrets`

- [x] Update Rails production configuration — `config/environments/production.rb`

- [x] Create Kamal deployment documentation — `.kamal/kamal_deployment.md`

- [x] Update Docker installation documentation — `installation_docs/docker.md`

## Essential Deployment Hooks (Pre & Post only)

- [x] Pre-deploy hook — `.kamal/hooks/pre-deploy.sample`

- [x] Pre-app-boot hook — `.kamal/hooks/pre-app-boot.sample`

- [x] Post-app-boot hook — `.kamal/hooks/post-app-boot.sample`

- [x] Post-deploy hook — `.kamal/hooks/post-deploy.sample`

## Hook Permissions

- [x] Make hooks executable — `.kamal/hooks/*.sample`
