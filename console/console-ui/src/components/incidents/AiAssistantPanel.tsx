import { useState } from 'react';
import { Paper, Text, Group, Badge, Stack, Progress, Textarea, Button, ScrollArea } from '@mantine/core';
import { IconRobot, IconSend } from '@tabler/icons-react';
import type { Incident } from '@/types';

export function AiAssistantPanel({ incident }: { incident: Incident }) {
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState(incident.conversation_history ?? []);
  const analysis = incident.ai_analysis;

  const handleAsk = () => {
    if (!question.trim()) return;
    const newEntry = { timestamp: new Date().toISOString(), role: 'user' as const, content: question };
    setChat([...chat, newEntry]);
    // Mock: AI would respond via API
    setTimeout(() => {
      setChat((prev) => [...prev, { timestamp: new Date().toISOString(), role: 'assistant' as const, content: 'Based on the metrics, the root cause appears to be related to the OOM kill pattern. I recommend checking the vLLM worker logs for exit code 137 (SIGKILL).' }]);
    }, 500);
    setQuestion('');
  };

  return (
    <Paper withBorder p="md" radius="md" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="md"><IconRobot size={18} color="var(--mantine-color-violet-6)" /><Text size="sm" fw={500}>AI Assistant</Text><Badge size="xs" variant="light">{analysis.model_used}</Badge></Group>

      {/* Root Causes */}
      <Text size="xs" fw={600} mb="xs">Root Causes</Text>
      <Stack gap="sm" mb="md">
        {analysis.root_causes.map((rc, i) => (
          <Paper key={i} withBorder p="sm" radius="sm" bg="var(--mantine-color-dark-7)">
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={600}>#{i + 1} {rc.cause}</Text>
              <Text size="xs" fw={500} c={rc.confidence > 0.8 ? 'red' : rc.confidence > 0.5 ? 'yellow' : 'gray'}>{Math.round(rc.confidence * 100)}%</Text>
            </Group>
            <Progress value={rc.confidence * 100} size="xs" color={rc.confidence > 0.8 ? 'red' : rc.confidence > 0.5 ? 'yellow' : 'gray'} mb={4} />
            <Text size="xs" c="dimmed">{rc.evidence}</Text>
          </Paper>
        ))}
      </Stack>

      {/* Recommendations */}
      <Text size="xs" fw={600} mb="xs">Recommendations</Text>
      <Stack gap={4} mb="md">
        {analysis.recommendations.map((r, i) => (
          <Group key={i} gap="xs">
            <Badge size="xs" color={r.risk === 'low' ? 'green' : r.risk === 'medium' ? 'yellow' : 'red'} variant="light">{r.risk}</Badge>
            <Text size="xs">{r.action}</Text>
          </Group>
        ))}
      </Stack>

      {/* Chat */}
      <Text size="xs" fw={600} mb="xs">Conversation</Text>
      <ScrollArea h={180} mb="sm">
        <Stack gap={4}>
          {chat.map((c, i) => (
            <Paper key={i} p="xs" radius="sm" bg={c.role === 'user' ? 'var(--mantine-color-violet-light)' : undefined}>
              <Text size="xs" fw={c.role === 'user' ? 500 : 400}>{c.content}</Text>
              <Text size="xs" c="dimmed" fs="italic">{c.role}</Text>
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      <Group gap="xs">
        <Textarea value={question} onChange={(e) => setQuestion(e.currentTarget.value)} placeholder="Ask about this incident..." minRows={1} maxRows={3} autosize style={{ flex: 1 }} size="xs" />
        <Button size="sm" variant="light" onClick={handleAsk} disabled={!question.trim()}><IconSend size={14} /></Button>
      </Group>
    </Paper>
  );
}
