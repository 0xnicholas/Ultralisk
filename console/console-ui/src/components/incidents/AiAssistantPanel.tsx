import { useState, useRef, useCallback } from 'react';
import { Paper, Text, Group, Badge, Stack, Progress, Textarea, Button, ScrollArea, Loader } from '@mantine/core';
import { IconRobot, IconSend, IconAlertCircle } from '@tabler/icons-react';
import type { Incident, IncidentConversation } from '@/types';

export function AiAssistantPanel({ incident }: { incident: Incident }) {
  const analysis = incident.ai_analysis;
  const [chat, setChat] = useState<IncidentConversation[]>(incident.conversation_history ?? []);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const hasAnalysis = analysis && analysis.root_causes && analysis.root_causes.length > 0;
  const hasRealAnalysis = hasAnalysis && analysis.root_causes[0].confidence > 0;
  const isAnalyzing = !hasAnalysis && incident.status === 'open';

  const handleAsk = useCallback(() => {
    const q = question.trim();
    if (!q || isAsking) return;

    setIsAsking(true);
    setStreamingAnswer('');
    const userEntry: IncidentConversation = {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: q,
    };
    setChat((prev) => [...prev, userEntry]);
    setQuestion('');

    const controller = new AbortController();
    abortRef.current = controller;

    let fullContent = '';

    fetch(`/v1/admin/incidents/${incident.id}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            // Stream complete — add the full answer to chat
            setChat((prev) => [...prev, {
              timestamp: new Date().toISOString(),
              role: 'assistant',
              content: fullContent,
            }]);
            setStreamingAnswer('');
            setIsAsking(false);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content) {
              fullContent += parsed.content;
              setStreamingAnswer(fullContent);
            }
          } catch { /* skip parse errors */ }
        }
      }

      // If we get here without [DONE], finalize anyway
      if (fullContent) {
        setChat((prev) => [...prev, {
          timestamp: new Date().toISOString(),
          role: 'assistant',
          content: fullContent,
        }]);
        setStreamingAnswer('');
      }
      setIsAsking(false);
    }).catch((err) => {
      if (err.name === 'AbortError') return;
      setChat((prev) => [...prev, {
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err.message}`,
      }]);
      setIsAsking(false);
    });
  }, [question, isAsking, incident.id]);

  return (
    <Paper withBorder p="md" radius="md" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="md">
        <IconRobot size={18} color="var(--mantine-color-violet-6)" />
        <Text size="sm" fw={500}>AI Assistant</Text>
        {hasAnalysis && (
          <Badge size="xs" variant="light">{analysis.model_used}</Badge>
        )}
        {isAnalyzing && (
          <Badge size="xs" variant="light" color="yellow">
            <Group gap={4}>
              <Loader size={8} />
              <span>Analyzing</span>
            </Group>
          </Badge>
        )}
      </Group>

      {/* Status: no analysis yet */}
      {!hasAnalysis && !isAnalyzing && (
        <Paper withBorder p="sm" radius="sm" bg="var(--mantine-color-dark-7)" mb="md">
          <Group gap="xs">
            <IconAlertCircle size={14} color="gray" />
            <Text size="xs" c="dimmed">AI analysis is not available for this incident.</Text>
          </Group>
        </Paper>
      )}

      {/* Root Causes */}
      {hasAnalysis && (
        <>
          <Group mb="xs">
            <Text size="xs" fw={600}>Root Causes</Text>
            {!hasRealAnalysis && (
              <Badge size="xs" color="gray" variant="light">Low confidence</Badge>
            )}
          </Group>
          <Stack gap="sm" mb="md">
            {analysis.root_causes.map((rc, i) => (
              <Paper key={i} withBorder p="sm" radius="sm" bg="var(--mantine-color-dark-7)">
                <Group justify="space-between" mb={4}>
                  <Text size="xs" fw={600}>#{i + 1} {rc.cause}</Text>
                  <Text size="xs" fw={500} c={rc.confidence > 0.8 ? 'red' : rc.confidence > 0.5 ? 'yellow' : 'gray'}>
                    {Math.round(rc.confidence * 100)}%
                  </Text>
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
        </>
      )}

      {/* Summary */}
      {hasAnalysis && analysis.summary && (
        <Paper withBorder p="sm" radius="sm" mb="md" bg="var(--mantine-color-dark-7)">
          <Text size="xs" fs="italic" c="dimmed">{analysis.summary}</Text>
        </Paper>
      )}

      {/* Conversation */}
      <Text size="xs" fw={600} mb="xs">Conversation</Text>
      <ScrollArea h={180} mb="sm">
        <Stack gap={4}>
          {chat.map((c, i) => (
            <Paper key={i} p="xs" radius="sm" bg={c.role === 'user' ? 'var(--mantine-color-violet-light)' : undefined}>
              <Text size="xs" fw={c.role === 'user' ? 500 : 400}>{c.content}</Text>
              <Text size="xs" c="dimmed" fs="italic">{c.role}</Text>
            </Paper>
          ))}
          {isAsking && streamingAnswer && (
            <Paper p="xs" radius="sm">
              <Text size="xs">{streamingAnswer}</Text>
              <Text size="xs" c="dimmed" fs="italic">assistant (streaming)</Text>
            </Paper>
          )}
          {isAsking && !streamingAnswer && (
            <Paper p="xs" radius="sm">
              <Group gap={4}>
                <Loader size={10} />
                <Text size="xs" c="dimmed">Thinking...</Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </ScrollArea>

      {/* Ask input */}
      <Group gap="xs">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          placeholder="Ask about this incident..."
          minRows={1}
          maxRows={3}
          autosize
          style={{ flex: 1 }}
          size="xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
        />
        <Button
          size="sm"
          variant="light"
          onClick={handleAsk}
          disabled={!question.trim() || isAsking}
          loading={isAsking}
        >
          <IconSend size={14} />
        </Button>
      </Group>
    </Paper>
  );
}
