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
