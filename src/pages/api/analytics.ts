import type { APIRoute } from 'astro';
import { getAllSessionStats, aggregateStats } from '../../lib/analytics.ts';

export const GET: APIRoute = async () => {
  const sessions = await getAllSessionStats();
  const agg      = aggregateStats(sessions);

  return Response.json({
    totalCost:      agg.totalCost,
    thisMonthCost:  agg.thisMonthCost,
    totalSessions:  agg.totalSessions,
    totalMessages:  agg.totalMessages,
    monthlyCosts:   agg.monthlyCosts,
  });
};
