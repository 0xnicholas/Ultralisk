import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBatchJobs, getBatchJob, createBatchJob, cancelBatchJob } from '@/api/batchJobs';
import type { CreateBatchJobRequest } from '@/types';

export function useBatchJobs() {
  return useQuery({
    queryKey: ['batch-jobs'],
    queryFn: () => getBatchJobs().then((r) => r.data),
  });
}

export function useBatchJob(id: string) {
  return useQuery({
    queryKey: ['batch-jobs', id],
    queryFn: () => getBatchJob(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateBatchJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: CreateBatchJobRequest) => createBatchJob(d).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }),
  });
}

export function useCancelBatchJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBatchJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }),
  });
}
