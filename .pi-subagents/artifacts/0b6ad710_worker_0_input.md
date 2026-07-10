# Task for worker

You are implementing Task 3: Types, Auth API, and Auth Pages

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-2 are done. Stub files exist for types/index.ts, api/auth.ts, LoginPage.tsx, AcceptInvitationPage.tsx. You need to replace them with full implementations.

## Step 1: Replace types/index.ts with full types

OVERWRITE `packages/console-ui/src/types/index.ts`:

```typescript
// === User & Auth ===
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'developer' | 'readonly';
  org_id: string;
  org_name: string;
  created_at: string;
}

// === Models ===
export interface Model {
  id: string;
  display_name: string;
  author: string;
  category: 'chat' | 'embedding' | 'image' | 'audio' | 'video' | 'moderation';
  description: string;
  capabilities: {
    context_window: number;
    max_output_tokens: number;
    json_mode: boolean;
    tool_calling: boolean;
    multi_modal: boolean;
    fine_tuning: boolean;
  };
  pricing: {
    serverless: {
      input_per_1m_tokens: number;
      output_per_1m_tokens: number;
      cached_input_per_1m_tokens?: number;
    };
    batch_discount_percent?: number;
    dedicated?: {
      gpu_type: string;
      price_per_hour: number;
    };
  };
  deployment_types: ('serverless' | 'dedicated')[];
  status: 'available' | 'degraded' | 'unavailable';
  version: string;
  featured: boolean;
  created_at: string;
}

export interface ModelDetail extends Model {
  usage_examples: {
    curl: string;
    python: string;
    typescript: string;
  };
}

// === API Keys ===
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist: string[] | null;
  monthly_quota_usd: number | null;
  usage_this_month_usd: number;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: 'active' | 'revoked';
}

export interface ApiKeyCreated extends ApiKey {
  secret: string;
}

export interface CreateApiKeyRequest {
  name: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist?: string[];
  monthly_quota_usd?: number;
}

// === Usage ===
export interface UsageSummary {
  period: { from: string; to: string };
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  by_model: {
    model_id: string;
    model_display_name: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  by_key: {
    key_id: string;
    key_name: string;
    key_prefix: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  recent_activity: {
    timestamp: string;
    model_id: string;
    status_code: number;
    latency_ms: number;
    tokens: number;
  }[];
}

// === Billing ===
export interface Billing {
  balance_usd: number;
  monthly_budget_usd: number | null;
  month_to_date_spend_usd: number;
  estimated_month_end_usd: number;
  auto_recharge_enabled: boolean;
  invoices: {
    id: string;
    period: string;
    amount_usd: number;
    status: 'paid' | 'pending' | 'overdue';
    download_url: string;
    issued_at: string;
  }[];
}

// === Chat ===
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PlaygroundSession {
  id: string;
  name: string;
  modelId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// === API Response wrappers ===
export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
}

export interface SingleResponse<T> {
  data: T;
}
```

## Step 2: Auth API is already correct — keep as-is

The existing `packages/console-ui/src/api/auth.ts` already has login, acceptInvitation, getMe. Leave it.

## Step 3: Replace LoginPage with full implementation

OVERWRITE `packages/console-ui/src/pages/auth/LoginPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/stores/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={420} my={80}>
      <Title ta="center" mb="lg">Ultralisk Console</Title>
      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              Sign in to your account
            </Text>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
```

## Step 4: Replace AcceptInvitationPage with full implementation

OVERWRITE `packages/console-ui/src/pages/auth/AcceptInvitationPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Paper, Title, PasswordInput, Button, Text, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/stores/AuthContext';

export function AcceptInvitationPage() {
  const { acceptInvitation } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await acceptInvitation(token, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Container size={420} my={80}>
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          Invalid invitation link. Please request a new invitation.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size={420} my={80}>
      <Title ta="center" mb="lg">Set Your Password</Title>
      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              Create a password to activate your account
            </Text>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}
            <PasswordInput
              label="Password"
              placeholder="Min. 8 characters"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            />
            <Button type="submit" fullWidth loading={loading}>
              Activate Account
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
```

## Step 5: Verify typecheck

```bash
cd packages/console-ui && pnpm typecheck
```
Expected: No TypeScript errors.

## Step 6: Commit

```bash
git add packages/console-ui/src
git commit -m "feat: add auth types, API module, Login and AcceptInvitation pages"
```

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```