import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Stack, Alert, Divider } from '@mantine/core';
import { IconAlertCircle, IconBug } from '@tabler/icons-react';
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

            <Divider label="Development" labelPosition="center" />

            <Button
              variant="outline"
              color="gray"
              fullWidth
              loading={loading}
              leftSection={<IconBug size={16} />}
              onClick={async () => {
                setError('');
                setLoading(true);
                try {
                  await login('dev@ultralisk.com', 'dev-password');
                  navigate('/dashboard', { replace: true });
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Login failed');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Dev Login (skip)
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
