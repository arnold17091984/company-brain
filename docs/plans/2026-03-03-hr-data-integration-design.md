# HR Data Integration Design

**Date:** 2026-03-03
**Status:** Approved
**Approach:** HR専用カテゴリ + きめ細かいACL（アプローチA）

## Overview

Company Brainを拡張し、HR・人事データ（人事評価、給与、契約、勤怠、スキル、組織図、コンプライアンス）を一元管理可能にする。データソースは手動アップロード（Excel/CSV/PDF）。既存のRAGパイプラインで自然言語検索可能。フィリピン労働法制を前提。

## Data Model Changes

### 1. Document.category field

`documents` テーブルに `category` カラムを追加:

| category | Description |
|---|---|
| `general` | 既存の全ドキュメント（デフォルト） |
| `hr_evaluation` | 人事評価・査定レポート |
| `hr_compensation` | 給与テーブル、賞与、手当 |
| `hr_contract` | 雇用契約書、NDA |
| `hr_attendance` | 勤怠記録、有休残日数 |
| `hr_skills` | スキルマトリクス、資格、研修履歴 |
| `hr_org` | 組織図、役職表 |
| `hr_compliance` | フィリピン労働法関連（DOLE提出書類等） |

### 2. User.role field

`users` テーブルに `role` カラムを追加:

| role | Description | HR Access |
|---|---|---|
| `employee` | 一般社員 | 自分の契約・評価のみ |
| `manager` | 部門長 | 自部門メンバーのHRデータ |
| `hr` | HR担当者 | 全社員のHRデータ（給与除く） |
| `executive` | 経営層（COO/CFO等） | 全社員のHRデータ |
| `ceo` | CEO専用 | 全データ無制限（経営層のHRデータも閲覧可） |
| `admin` | システム管理者 | システム設定のみ（HRデータ閲覧不可） |

Key: `ceo` only can view executive-level HR data. `admin` cannot access HR data (separation of concerns).

### 3. document_acl table (new)

```sql
CREATE TABLE document_acl (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    grantee_type VARCHAR(20) NOT NULL,  -- "user" | "role" | "department"
    grantee_id VARCHAR(255) NOT NULL,   -- user UUID | role name | department UUID
    permission VARCHAR(10) NOT NULL DEFAULT 'read',  -- "read" | "write"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4. Document.related_employee_id (optional FK)

Optional FK to `users.id` for linking HR documents to specific employees (enables "show me Tanaka's evaluation" queries).

## Upload UI Changes

When uploading, if category is `hr_*`:
1. Category dropdown (required)
2. Access control section:
   - Role-based: multi-select from CEO/Executive/HR/Manager
   - User-based: add specific users by email
   - Department-based: grant to entire department
3. Related employee (optional): link document to a specific employee

General documents (`general` category) upload flow remains unchanged.

## RAG Pipeline Changes

### Qdrant payload additions
- `category` — HR category filter
- `acl_roles` — list of roles with access
- `acl_user_ids` — list of individual user IDs with access
- `related_employee_id` — linked employee ID (optional)

### Search-time ACL enforcement
1. User sends chat query
2. Build Qdrant filter based on user's `role` + `user_id` + `department_id`
3. Validate against `document_acl` entries
4. Only permitted documents passed to Claude for RAG generation

### CEO filter logic
```python
if user.role == "ceo":
    return None  # No filter — full access
elif user.role == "executive":
    # All HR data except other executives' personal HR docs
    filter = exclude(acl where grantee = "ceo" only)
elif user.role == "hr":
    # All HR data except hr_compensation
    filter = exclude(category == "hr_compensation" unless explicitly granted)
```

## Audit Logging

All HR document access logged to `audit_logs` with:
- `action`: "hr_document_access"
- `metadata`: { document_id, category, document_title }

## i18n

New keys for EN/JA/KO:
- HR category labels
- ACL UI strings
- Upload form additions

## Security Considerations

- HR documents are encrypted at rest (Supabase default)
- ACL checked at both DB level (RLS) and application level (Qdrant filter)
- Admin role explicitly excluded from HR data access
- All HR access audited
- Philippine Data Privacy Act (RA 10173) compliance: personal data handling with consent
