import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  buildDescription,
  isValidValues,
  normalizeTaskKey,
  normalizeTitleKey,
  parseJobMeta,
  type ParsedJobMeta,
} from '../../../lib/jobClubPosts';

type SavePayload = {
  action: 'save';
  id: string;
  values: ParsedJobMeta;
};

type TogglePayload = {
  action: 'toggle-active';
  id: string;
  nextIsActive: boolean;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const getBearerToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice('Bearer '.length).trim();
};

const ensureAuthorized = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return null;
  }

  return user;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = await ensureAuthorized(req, res);
  if (!user) return;

  if (req.method === 'PATCH') {
    const payload = req.body as SavePayload | TogglePayload;

    if (!payload?.id || typeof payload.id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Post id is required' });
    }

    if (payload.action === 'save') {
      if (!isValidValues(payload.values)) {
        return res.status(400).json({ ok: false, error: 'Invalid job values' });
      }

      const values = payload.values;
      const cleaned: ParsedJobMeta = {
        area: values.area.trim(),
        job: values.job.trim(),
        status: values.status,
        priority: values.priority,
        materials: values.materials.trim(),
      };

      const { error } = await supabaseAdmin
        .from('job_club_posts')
        .update({
          title: `${cleaned.area} - ${cleaned.job}`,
          description: buildDescription(cleaned),
        })
        .eq('id', payload.id);

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({ ok: true });
    }

    if (payload.action === 'toggle-active') {
      const { data: targetPost, error: targetError } = await supabaseAdmin
        .from('job_club_posts')
        .select('id, title, description')
        .eq('id', payload.id)
        .maybeSingle();

      if (targetError) {
        return res.status(500).json({ ok: false, error: targetError.message });
      }

      if (!targetPost) {
        return res.status(404).json({ ok: false, error: 'Job not found' });
      }

      const meta = parseJobMeta(targetPost.description);
      if (!meta) {
        const { error } = await supabaseAdmin
          .from('job_club_posts')
          .update({ is_active: payload.nextIsActive })
          .eq('id', payload.id);

        if (error) {
          return res.status(500).json({ ok: false, error: error.message });
        }

        return res.status(200).json({ ok: true, updatedCount: 1 });
      }

      const taskKey = normalizeTaskKey(meta);
      const titleKey = normalizeTitleKey(`${meta.area} - ${meta.job}`);

      const { data: allRows, error: allRowsError } = await supabaseAdmin
        .from('job_club_posts')
        .select('id, title, description')
        .limit(2000);

      if (allRowsError) {
        return res.status(500).json({ ok: false, error: allRowsError.message });
      }

      const matchingRows = (allRows || []).filter((row) => {
        const rowMeta = parseJobMeta(row.description);
        if (rowMeta) {
          return normalizeTaskKey(rowMeta) === taskKey;
        }

        return normalizeTitleKey(row.title) === titleKey;
      });

      if (matchingRows.length === 0) {
        return res.status(404).json({ ok: false, error: 'No matching jobs found to update' });
      }

      for (const row of matchingRows) {
        const rowMeta = parseJobMeta(row.description);
        if (!rowMeta) {
          const { error } = await supabaseAdmin
            .from('job_club_posts')
            .update({ is_active: payload.nextIsActive })
            .eq('id', row.id);
          if (error) {
            return res.status(500).json({ ok: false, error: error.message });
          }
          continue;
        }

        const nextMeta: ParsedJobMeta = {
          ...rowMeta,
          status: payload.nextIsActive
            ? (rowMeta.status === 'Completed' ? 'Ongoing' : rowMeta.status)
            : 'Completed',
        };

        const { error } = await supabaseAdmin
          .from('job_club_posts')
          .update({
            is_active: payload.nextIsActive,
            title: `${nextMeta.area} - ${nextMeta.job}`,
            description: buildDescription(nextMeta),
          })
          .eq('id', row.id);

        if (error) {
          return res.status(500).json({ ok: false, error: error.message });
        }
      }

      return res.status(200).json({ ok: true, updatedCount: matchingRows.length });
    }

    return res.status(400).json({ ok: false, error: 'Invalid action' });
  }

  const { id } = (req.body || {}) as { id?: unknown };

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, error: 'Post id is required' });
  }

  const { error } = await supabaseAdmin.from('job_club_posts').delete().eq('id', id);
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
}
