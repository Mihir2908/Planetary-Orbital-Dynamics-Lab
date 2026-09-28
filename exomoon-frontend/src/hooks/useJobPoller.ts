'use client';
import { useEffect, useRef } from 'react';
import { useSimulationStore } from './useSimulationStore';
import { agentApi } from '@/lib/agentApi';
import { parseTrajectoryCsv } from '@/lib/csvParser';

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS  = 300_000; // 5 min — surface "timed out" rather than spinning forever

export function useJobPoller() {
  const {
    jobId, jobStatus,
    updateJobStatus, setTrajectoryData, setSimdata,
  } = useSimulationStore();

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    console.log(`[JobPoller] effect fired — jobId=${jobId} jobStatus=${jobStatus}`);
    if (!jobId || jobStatus !== 'running') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      if (Date.now() - startTimeRef.current > POLL_TIMEOUT_MS) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        updateJobStatus('TIMED_OUT', (POLL_TIMEOUT_MS / 1000), {});
        console.warn(`[JobPoller] job ${jobId} timed out after 5 minutes`);
        return;
      }
      try {
        console.log(`[JobPoller] polling ${jobId}...`);
        const data = await agentApi.getJobStatus(jobId);
        console.log(`[JobPoller] status=${data.status} urls=`, data.urls);
        updateJobStatus(data.status, data.elapsed_seconds, data.urls);

        if (data.status === 'SUCCEEDED') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;

          // meta comes directly from the agent service status response (no S3 fetch needed)
          const summaryJson: Record<string, unknown> = (data.meta ?? {}) as Record<string, unknown>;

          // Fetch traj.csv via agent proxy (avoids direct S3 CORS fetch from browser)
          console.log(`[JobPoller] SUCCEEDED — fetching CSV via agent proxy for ${jobId}`);
          try {
            const csvText = await agentApi.getJobCsv(jobId);
            console.log(`[JobPoller] CSV fetched — ${csvText.length} chars, parsing...`);
            const { frames, meta } = parseTrajectoryCsv(csvText, summaryJson);
            console.log(`[JobPoller] parsed ${frames.length} frames, calling setTrajectoryData`);
            setTrajectoryData(frames, meta);
            console.log(`[JobPoller] setTrajectoryData done`);
          } catch (e) {
            console.error('[JobPoller] CSV fetch/parse error:', e);
          }

          // Cache simdata in agent service session for follow-up chat queries
          agentApi.retrieveSimdata(jobId).catch(console.warn);

        } else if (data.status === 'FAILED' || data.status === 'TIMED_OUT') {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      } catch (e) {
        if (e instanceof TypeError && String(e).includes('fetch')) {
          console.warn(`[JobPoller] Cannot reach agent service via /api/agent — is the agent service running on port 8000?`, e);
        } else {
          console.warn('[JobPoller] poll error:', e);
        }
      }
    };

    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // immediate first check

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, jobStatus]);
}
