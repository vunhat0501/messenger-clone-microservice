`npx -y tree-cli -l 9 --ignore "node_modules,.git,dist,.next,.swc,build,.turbo" -o structure.md`

```markdown
├── apps
| ├── api
| | ├── apps
| | | ├── api
| | | | ├── src
| | | | | ├── app.controller.spec.ts
| | | | | ├── app.controller.ts
| | | | | ├── app.module.ts
| | | | | ├── app.service.ts
| | | | | ├── auth
| | | | | | ├── auth-gateway.controller.ts
| | | | | | ├── auth-gateway.module.ts
| | | | | | ├── config
| | | | | | | ├── jwt.config.ts
| | | | | | | └── refresh.config.ts
| | | | | | ├── decorators
| | | | | | | ├── get-user.decorator.ts
| | | | | | | ├── public.decorator.ts
| | | | | | | └── roles.decorator.ts
| | | | | | ├── guards
| | | | | | | ├── jwt-auth
| | | | | | | | ├── jwt-auth.guard.spec.ts
| | | | | | | | └── jwt-auth.guard.ts
| | | | | | | ├── local-auth
| | | | | | | | ├── local-auth.guard.spec.ts
| | | | | | | | └── local-auth.guard.ts
| | | | | | | ├── refresh-auth
| | | | | | | | ├── refresh-auth.guard.spec.ts
| | | | | | | | └── refresh-auth.guard.ts
| | | | | | | └── roles
| | | | | | | ├── roles.guard.spec.ts
| | | | | | | └── roles.guard.ts
| | | | | | ├── interceptor
| | | | | | | └── token.interceptor.ts
| | | | | | ├── strategies
| | | | | | | ├── jwt.strategy.ts
| | | | | | | ├── local.strategy.ts
| | | | | | | └── refresh-jwt.strategy.ts
| | | | | | └── types
| | | | | | └── auth-jwt-payload.d.ts
| | | | | ├── chat
| | | | | | ├── chat-gateway.module.ts
| | | | | | └── gateway
| | | | | | ├── chat.gateway.spec.ts
| | | | | | └── chat.gateway.ts
| | | | | ├── common
| | | | | | ├── adapter
| | | | | | | └── redis-io.adapter.ts
| | | | | | ├── filter
| | | | | | | └── all-exception
| | | | | | | ├── all-exception.filter.spec.ts
| | | | | | | └── all-exception.filter.ts
| | | | | | ├── interceptor
| | | | | | | ├── timeout
| | | | | | | | ├── timeout.interceptor.spec.ts
| | | | | | | | └── timeout.interceptor.ts
| | | | | | | └── transform
| | | | | | | ├── transform.interceptor.spec.ts
| | | | | | | └── transform.interceptor.ts
| | | | | | └── middleware
| | | | | | └── logger
| | | | | | ├── logger.middleware.spec.ts
| | | | | | └── logger.middleware.ts
| | | | | ├── config
| | | | | | └── env.config.ts
| | | | | ├── main.ts
| | | | | └── users
| | | | | ├── users-gateway.controller.ts
| | | | | └── users-gateway.module.ts
| | | | ├── test
| | | | | ├── app.e2e-spec.ts
| | | | | └── jest-e2e.json
| | | | └── tsconfig.app.json
| | | ├── auth-service
| | | | ├── nest-cli.json
| | | | ├── src
| | | | | ├── auth
| | | | | | ├── auth.controller.spec.ts
| | | | | | ├── auth.controller.ts
| | | | | | ├── auth.module.ts
| | | | | | ├── auth.service.spec.ts
| | | | | | ├── auth.service.ts
| | | | | | ├── dto
| | | | | | | ├── create-auth.dto.ts
| | | | | | | └── update-auth.dto.ts
| | | | | | └── entities
| | | | | | └── auth.entity.ts
| | | | | ├── auth-service.controller.spec.ts
| | | | | ├── auth-service.controller.ts
| | | | | ├── auth-service.module.ts
| | | | | ├── auth-service.service.ts
| | | | | ├── common
| | | | | | └── filter
| | | | | | └── rpc-exception
| | | | | | ├── rpc-exception.filter.spec.ts
| | | | | | └── rpc-exception.filter.ts
| | | | | ├── config
| | | | | | └── postgres.config.ts
| | | | | ├── database
| | | | | | ├── data-source.ts
| | | | | | ├── factories
| | | | | | | ├── auth.factory.ts
| | | | | | | └── user.factory.ts
| | | | | | ├── migrations
| | | | | | | └── postgres
| | | | | | ├── postgres-database.module.ts
| | | | | | ├── seed.ts
| | | | | | └── seeds
| | | | | | └── postgres.seeder.ts
| | | | | ├── main.ts
| | | | | └── user
| | | | | ├── dto
| | | | | | ├── create-user.dto.ts
| | | | | | └── update-user.dto.ts
| | | | | ├── entities
| | | | | | └── user.entity.ts
| | | | | ├── user.controller.spec.ts
| | | | | ├── user.controller.ts
| | | | | ├── user.module.ts
| | | | | ├── user.service.spec.ts
| | | | | └── user.service.ts
| | | | ├── test
| | | | | ├── app.e2e-spec.ts
| | | | | └── jest-e2e.json
| | | | └── tsconfig.app.json
| | | └── chat-service
| | | ├── nest-cli.json
| | | ├── src
| | | | ├── chat-service.controller.spec.ts
| | | | ├── chat-service.controller.ts
| | | | ├── chat-service.module.ts
| | | | ├── chat-service.service.ts
| | | | ├── common
| | | | | └── filter
| | | | | └── rpc-exception
| | | | | ├── rpc-exception.filter.spec.ts
| | | | | └── rpc-exception.filter.ts
| | | | ├── config
| | | | | └── mongo.config.ts
| | | | ├── database
| | | | | ├── mongo-database.module.ts
| | | | | └── schemas
| | | | | ├── conversation.schema.ts
| | | | | └── participant.schema.ts
| | | | └── main.ts
| | | ├── test
| | | | ├── app.e2e-spec.ts
| | | | └── jest-e2e.json
| | | └── tsconfig.app.json
| | ├── eslint.config.mjs
| | ├── jest.config.ts
| | ├── nest-cli.json
| | ├── package.json
| | ├── README.md
| | ├── tsconfig.build.json
| | └── tsconfig.json
| └── web
| ├── app
| | ├── (protected)
| | | ├── account-settings
| | | | ├── components
| | | | | └── settings-card.tsx
| | | | └── page.tsx
| | | ├── components
| | | | ├── app-sidebar.tsx
| | | | ├── create-post-modal.tsx
| | | | ├── edit-post-modal.tsx
| | | | └── post-options-menu.tsx
| | | ├── explore
| | | | ├── page.tsx
| | | | └── [id]
| | | | └── page.tsx
| | | ├── fyp
| | | | ├── components
| | | | | ├── comment-section.tsx
| | | | | └── post-item.tsx
| | | | └── page.tsx
| | | ├── layout.tsx
| | | └── profile
| | | ├── components
| | | | ├── profile-actions.tsx
| | | | ├── profile-card.tsx
| | | | ├── profile-header.tsx
| | | | ├── profile-posts.tsx
| | | | └── profile-stats.tsx
| | | └── [userName]
| | | ├── loading.tsx
| | | └── page.tsx
| | ├── api
| | | ├── auth
| | | | ├── refresh
| | | | | └── route.ts
| | | | ├── signin
| | | | | └── route.ts
| | | | ├── signout
| | | | | └── route.ts
| | | | └── signup
| | | | └── route.ts
| | | └── [...path]
| | | └── route.ts
| | ├── auth
| | | ├── components
| | | | ├── login-form.tsx
| | | | ├── signup-form.tsx
| | | | └── submit-button.tsx
| | | ├── layout.tsx
| | | ├── lib
| | | | ├── auth.ts
| | | | └── type.ts
| | | ├── signin
| | | | └── page.tsx
| | | └── signup
| | | └── page.tsx
| | ├── favicon.ico
| | ├── layout.tsx
| | └── page.tsx
| ├── components
| | ├── authProvider.tsx
| | └── providers.tsx
| ├── components.json
| ├── config
| | └── env.config.ts
| ├── eslint.config.js
| ├── hooks
| ├── jest.config.ts
| ├── jest.setup.ts
| ├── lib
| | └── api.ts
| ├── next-env.d.ts
| ├── next.config.mjs
| ├── package.json
| ├── postcss.config.mjs
| ├── proxy.tsx
| ├── README.md
| ├── store
| | └── useAuthStore.ts
| ├── tsconfig.json
| └── **tests**
| └── page.test.tsx
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── packages
| ├── eslint-config
| | ├── base.js
| | ├── nest.js
| | ├── next.js
| | ├── package.json
| | ├── prettier-base.js
| | ├── react-internal.js
| | └── README.md
| ├── jest-config
| | ├── package.json
| | ├── src
| | | ├── base.ts
| | | ├── entry.ts
| | | ├── nest.ts
| | | └── next.ts
| | └── tsconfig.json
| ├── types
| | ├── package.json
| | ├── src
| | | └── index.ts
| | └── tsconfig.json
| ├── typescript-config
| | ├── base.json
| | ├── nestjs.json
| | ├── nextjs.json
| | ├── package.json
| | ├── react-library.json
| | └── README.md
| └── ui
| ├── components.json
| ├── eslint.config.js
| ├── package.json
| ├── postcss.config.mjs
| ├── src
| | ├── components
| | | ├── alert-dialog.tsx
| | | ├── avatar.tsx
| | | ├── button.tsx
| | | ├── card.tsx
| | | ├── dialog.tsx
| | | ├── dropdown-menu.tsx
| | | ├── field.tsx
| | | ├── input.tsx
| | | ├── label.tsx
| | | ├── separator.tsx
| | | ├── sheet.tsx
| | | ├── sidebar.tsx
| | | ├── skeleton.tsx
| | | ├── textarea.tsx
| | | └── tooltip.tsx
| | ├── hooks
| | | └── use-mobile.ts
| | ├── lib
| | | └── utils.ts
| | └── styles
| | └── globals.css
| ├── tsconfig.json
| └── tsconfig.lint.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── structure.md
├── tsconfig.json
└── turbo.json
```
