# PawPal Admin M1/M2 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable backend slice for `pawpal guanliyuan`: admin bootstrap, admin login, protected admin APIs, audit logs, dashboard summary, and user suspend/unsuspend.

**Architecture:** Follow the existing Express/TypeScript/Prisma layering. Add focused admin modules instead of changing the existing app-user auth flow: `adminService` owns admin business logic, `adminController` translates HTTP requests, `adminAuth` protects admin routes, and `adminRoutes` mounts under `/api/v1/admin`.

**Tech Stack:** Express, TypeScript, Prisma, PostgreSQL, Jest, bcrypt, jsonwebtoken, zod.

---

## File Structure

- Modify: `prisma/schema.prisma`
  - Add admin/security enums and models.
  - Add account suspension fields to `User`.
- Modify: `src/config/index.ts`
  - Add admin env var config.
- Create: `src/services/adminService.ts`
  - Admin password hashing, bootstrap, login, JWT signing, dashboard summary, user listing/detail/suspend/unsuspend, audit writer.
- Create: `src/middleware/adminAuth.ts`
  - Verify admin JWT and enforce role permissions.
- Create: `src/controllers/adminController.ts`
  - HTTP handlers for admin auth, dashboard, users, audit logs.
- Create: `src/routes/adminRoutes.ts`
  - Admin route schemas and route mounting.
- Modify: `src/routes/index.ts`
  - Mount `/admin`.
- Modify: `src/services/authService.ts`
  - Block suspended normal users from logging into the App.
- Create: `tests/adminService.test.ts`
  - Unit tests for bootstrap, login, permission-sensitive operations, audit logging.
- Create: `tests/adminRoutes.test.ts`
  - Route/middleware smoke tests for admin API protection and login.
- Modify: `tests/authService.test.ts`
  - Verify suspended users cannot log into the App.

## Task 1: Prisma Admin Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add schema definitions**

Add enums:

```prisma
enum AdminRole {
  SUPER_ADMIN
  OPS_ADMIN
  CONTENT_MODERATOR
  SUPPORT
  READONLY
}

enum AdminStatus {
  ACTIVE
  DISABLED
}

enum UserAccountStatus {
  ACTIVE
  SUSPENDED
}
```

Add user fields:

```prisma
  accountStatus  UserAccountStatus @default(ACTIVE)
  suspendedUntil DateTime?
  suspendedReason String           @default("")
```

Add models:

```prisma
model AdminUser {
  id           String      @id @default(cuid())
  email        String      @unique
  passwordHash String
  name         String      @default("")
  role         AdminRole   @default(READONLY)
  status       AdminStatus @default(ACTIVE)
  lastLoginAt  DateTime?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  auditLogs AdminAuditLog[]

  @@index([role, status])
  @@map("admin_users")
}

model AdminAuditLog {
  id            String   @id @default(cuid())
  adminUserId   String?
  action        String
  targetType    String
  targetId      String   @default("")
  reason        String   @default("")
  beforeSnapshot Json?
  afterSnapshot  Json?
  ipAddress     String   @default("")
  userAgent     String   @default("")
  createdAt     DateTime @default(now())

  adminUser AdminUser? @relation(fields: [adminUserId], references: [id], onDelete: SetNull)

  @@index([adminUserId, createdAt])
  @@index([targetType, targetId])
  @@index([action, createdAt])
  @@map("admin_audit_logs")
}
```

- [ ] **Step 2: Validate schema**

Run: `npx prisma validate`

Expected: Prisma schema validation succeeds.

## Task 2: Admin Service Tests

**Files:**
- Create: `tests/adminService.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- `bootstrapSuperAdmin()` creates a SUPER_ADMIN from env when no admin exists.
- `bootstrapSuperAdmin()` does not overwrite existing admin.
- `login()` returns admin DTO and admin JWT for active admin with correct password.
- `login()` rejects disabled admins and wrong passwords.
- `getDashboardSummary()` returns counts for users, pets, moments, posts, pending reports placeholder `0`.
- `listUsers()` passes pagination/search filters to Prisma and returns rows plus meta.
- `suspendUser()` updates user status and writes audit log.
- `unsuspendUser()` restores active status and writes audit log.

- [ ] **Step 2: Verify tests fail before implementation**

Run: `npm test -- adminService.test.ts --runInBand`

Expected: FAIL because `src/services/adminService.ts` does not exist.

## Task 3: Admin Service Implementation

**Files:**
- Create: `src/services/adminService.ts`
- Modify: `src/config/index.ts`

- [ ] **Step 1: Add admin config**

Add:

```ts
admin: {
  bootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
  bootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
  jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-fallback-secret-change-me',
  jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '12h',
  panelOrigin: process.env.ADMIN_PANEL_ORIGIN || '',
},
```

- [ ] **Step 2: Implement `AdminService`**

Implement:

- `hashPassword(password)`
- `verifyPassword(password, hash)`
- `signToken(admin)`
- `bootstrapSuperAdmin()`
- `login(email, password, context)`
- `getAdminById(adminId)`
- `writeAuditLog(input)`
- `getDashboardSummary()`
- `listUsers(query)`
- `getUserDetail(userId)`
- `suspendUser(admin, userId, input, context)`
- `unsuspendUser(admin, userId, input, context)`
- `listAuditLogs(query)`

- [ ] **Step 3: Verify service tests pass**

Run: `npm test -- adminService.test.ts --runInBand`

Expected: PASS.

## Task 4: Suspended App User Login Test and Implementation

**Files:**
- Modify: `tests/authService.test.ts`
- Modify: `src/services/authService.ts`

- [ ] **Step 1: Write failing test**

Add a login test where `accountStatus` is `SUSPENDED` and assert it throws `该账号已被冻结`.

- [ ] **Step 2: Verify test fails**

Run: `npm test -- authService.test.ts --runInBand`

Expected: FAIL because suspended users are not blocked yet.

- [ ] **Step 3: Implement minimal login guard**

In `AuthService.login`, after deleted-account check, reject `accountStatus === 'SUSPENDED'`.

- [ ] **Step 4: Verify auth tests pass**

Run: `npm test -- authService.test.ts --runInBand`

Expected: PASS.

## Task 5: Admin Middleware, Controller, Routes

**Files:**
- Create: `src/middleware/adminAuth.ts`
- Create: `src/controllers/adminController.ts`
- Create: `src/routes/adminRoutes.ts`
- Modify: `src/routes/index.ts`
- Create: `tests/adminRoutes.test.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- `POST /api/v1/admin/auth/login` returns token for valid admin credentials.
- `GET /api/v1/admin/auth/me` returns 401 without admin token.
- `GET /api/v1/admin/dashboard/summary` returns 401 without admin token.
- `GET /api/v1/admin/users` returns 403 when a READONLY admin attempts a write-only route is not applicable; read should succeed for READONLY.
- `POST /api/v1/admin/users/:id/suspend` returns 403 for READONLY.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- adminRoutes.test.ts --runInBand`

Expected: FAIL because admin route files do not exist.

- [ ] **Step 3: Implement route layer**

Use zod validation like existing routes.

Mount:

- `POST /admin/auth/login`
- `GET /admin/auth/me`
- `GET /admin/dashboard/summary`
- `GET /admin/users`
- `GET /admin/users/:id`
- `POST /admin/users/:id/suspend`
- `POST /admin/users/:id/unsuspend`
- `GET /admin/audit-logs`

- [ ] **Step 4: Verify route tests pass**

Run: `npm test -- adminRoutes.test.ts --runInBand`

Expected: PASS.

## Task 6: Build and Regression

**Files:**
- Any files touched above.

- [ ] **Step 1: Run target tests**

Run:

```bash
npm test -- adminService.test.ts adminRoutes.test.ts authService.test.ts --runInBand
```

Expected: all target tests pass.

- [ ] **Step 2: Run full backend tests**

Run: `npm test -- --runInBand`

Expected: all suites pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript/Prisma build completes.

## Scope Notes

This plan intentionally stops before building the Vercel frontend. Once these backend APIs pass, the next plan should scaffold `/Users/yaki/Desktop/Codex/pawpal-gpt/admin`, connect login/Dashboard/users pages, and deploy through Vercel.

