import { supabase } from "@/lib/supabaseClient";
import type {
  Profile,
  TaskCompletion,
  TaskTemplate,
  Zone,
} from "@/types/domain";

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from("zones")
    .select("id, name, sort_order")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select(
      "id, zone_id, title, assigned_to, recurrence_type, due_time, active_from, interval_days, active_days, enabled"
    )
    .eq("enabled", true);
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetches recent completions across all tasks. `sinceDaysAgo` bounds the
 * query since only recent history is needed to compute urgency.
 */
export async function fetchRecentCompletions(
  sinceDaysAgo = 30
): Promise<TaskCompletion[]> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDaysAgo);

  const { data, error } = await supabase
    .from("task_completions")
    .select("id, task_template_id, completed_by, completed_at")
    .gte("completed_at", since.toISOString())
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function completeTask(
  taskTemplateId: string,
  completedBy: string
): Promise<TaskCompletion> {
  const { data, error } = await supabase
    .from("task_completions")
    .insert({
      task_template_id: taskTemplateId,
      completed_by: completedBy,
    })
    .select("id, task_template_id, completed_by, completed_at")
    .single();
  if (error) throw error;
  return data;
}
