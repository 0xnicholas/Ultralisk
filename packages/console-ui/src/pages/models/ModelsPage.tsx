import { useState } from 'react';
import { Title } from '@mantine/core';
import { FeaturedModels } from '@/components/models/FeaturedModels';
import { ModelFilters } from '@/components/models/ModelFilters';
import { ModelsTable } from '@/components/models/ModelsTable';

export function ModelsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const apiFilters: Record<string, string> = {};
  if (filters.deployment) apiFilters.deployment = filters.deployment;
  if (filters.category) apiFilters.category = filters.category;

  return (
    <>
      <Title order={2} mb="md">Models</Title>
      <FeaturedModels />
      <ModelFilters filters={filters} onChange={setFilters} />
      <ModelsTable filters={apiFilters} />
    </>
  );
}
