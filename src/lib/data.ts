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

const TASK_TEMPLATE_COLUMNS =
  "id, zone_id, title, assigned_to, recurrence_type, due_time, active_from, interval_days, active_days, enabled";

export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select(TASK_TEMPLATE_COLUMNS)
    .eq("enabled", true);
  if (error) throw error;
  return data ?? [];
}

/** Same as `fetchTaskTemplates` but includes disabled tasks, for the admin screen. */
export async function fetchAllTaskTemplates(): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from("task_templates")
    .select(TASK_TEMPLATE_COLUMNS)
    .order("zone_id")
    .order("title");
  if (error) throw error;
  return data ?? [];
}

export type TaskTemplateInput = Omit<TaskTemplate, "id" | "enabled">;

export async function createTaskTemplate(
  id: string,
  input: TaskTemplateInput
): Promise<TaskTemplate> {
  const { data, error } = await supabase
    .from("task_templates")
    .insert({ id, ...input, enabled: true })
    .select(TASK_TEMPLATE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskTemplate(
  id: string,
  input: TaskTemplateInput
): Promise<TaskTemplate> {
  const { data, error } = await supabase
    .from("task_templates")
    .update(input)
    .eq("id", id)
    .select(TASK_TEMPLATE_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function setTaskTemplateEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  // `.select().single()` forces an error when 0 rows match (e.g. an update
  // silently blocked by RLS) instead of resolving as if it had succeeded.
  const { error } = await supabase
    .from("task_templates")
    .update({ enabled })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
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
