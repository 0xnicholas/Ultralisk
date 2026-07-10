所有修复均已验证：

- **B1**: ✅ Vite `@/` 别名现在位于第 234 行（任务 1），已从任务 11 中移除
- **N1**: ✅ `ApiViewModal.tsx` 已从文件结构树中移除（仅在延迟说明/修复说明中提及）
- **I1**: ✅ `KeyUsageTable.tsx` 有 5 处引用：文件树、创建步骤、BillingPage 使用、摘要、修复说明
- **I2**: ✅ `PATCH /v1/admin/api-keys/:id` 存根端点存在
- **I3**: ✅ `POST` 和 `GET /v1/admin/invitations` 存根端点存在
- **I4**: ✅ `AuthContext` 使用 `api/auth.ts`（`apiLogin`/`apiAccept`）
- **I5**: ✅ `POST /v1/admin/auth/logout` 存根端点存在
- 任务 11 步骤已重新编号（步骤 1 → 类型检查+构建，步骤 2 → 冒烟测试，步骤 3 → 提交）