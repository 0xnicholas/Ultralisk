import { SimpleGrid, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconRobot, IconDatabase, IconBrain, IconFileText } from '@tabler/icons-react';

const EXAMPLES = [
  { title: 'Build a Chatbot', description: 'Create a conversational AI with context and memory', icon: IconRobot, color: 'violet' },
  { title: 'RAG Application', description: 'Retrieval-augmented generation with your own data', icon: IconDatabase, color: 'blue' },
  { title: 'AI Agent', description: 'Build agents with tool calling and function execution', icon: IconBrain, color: 'green' },
  { title: 'Structured Output', description: 'Extract structured JSON from unstructured text', icon: IconFileText, color: 'orange' },
];

export function ExamplesResources() {
  return (
    <>
      <Text size="sm" fw={500} mb="xs">Examples &amp; Resources</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
        {EXAMPLES.map((ex) => (
          <Paper key={ex.title} withBorder p="md" radius="md" style={{ cursor: 'pointer' }}>
            <ThemeIcon variant="light" color={ex.color} size="lg" mb="sm"><ex.icon size={20} /></ThemeIcon>
            <Text fw={500} size="sm">{ex.title}</Text>
            <Text size="xs" c="dimmed">{ex.description}</Text>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
