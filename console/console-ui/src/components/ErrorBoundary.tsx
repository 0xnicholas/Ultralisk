import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', error, info); }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Center h={400}>
          <Stack style={{ alignItems: 'center' }} gap="md">
            <IconAlertCircle size={48} color="var(--mantine-color-red-6)" />
            <Title order={3}>Something went wrong</Title>
            <Text size="sm" c="dimmed" maw={400} ta="center">{this.state.error?.message}</Text>
            <Button variant="light" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
              Reload Page
            </Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
