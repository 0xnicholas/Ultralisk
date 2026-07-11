import { notifications } from '@mantine/notifications';
import { IconX } from '@tabler/icons-react';

export function showApiError(error: unknown, title = 'Request Failed') {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  notifications.show({ icon: <IconX size={16} />, color: 'red', title, message, autoClose: 5000 });
}


