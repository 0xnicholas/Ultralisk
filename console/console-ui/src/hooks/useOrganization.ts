import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrganization, updateOrganization } from '@/api/organization';
import type { Organization } from '@/types';

export function useOrganization() {
  return useQuery({ queryKey: ['organization'], queryFn: () => getOrganization().then((r) => r.data) });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Partial<Organization>) => updateOrganization(d).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization'] }),
  });
}
